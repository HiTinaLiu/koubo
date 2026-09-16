from __future__ import annotations

import asyncio
import os
import re
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock

import edge_tts

from backend.applog import get_logger
from backend.audio import concat_audio, duration_ms, to_mp3
from backend.schemas import WordStamp
from backend.voice_lib import resolve_voice

log = get_logger("tts")

Progress = Callable[[int, int], None]


def _ms(value: int | float) -> int:
    return int(value / 10_000)


def split_narration(text: str, max_chars: int) -> list[str]:
    clean = re.sub(r"\s+", "", (text or "").strip())
    if not clean:
        return []
    limit = max(24, min(int(max_chars), 120))
    parts = [item for item in re.split(r"(?<=[。！？；!?;])", clean) if item]
    if not parts:
        parts = [clean]
    chunks: list[str] = []
    buf = ""
    for part in parts:
        pieces = [part]
        if len(part) > limit:
            pieces = [item for item in re.split(r"(?<=[，、,])", part) if item] or [part]
        for piece in pieces:
            if len(piece) > limit:
                for index in range(0, len(piece), limit):
                    if buf:
                        chunks.append(buf)
                        buf = ""
                    chunks.append(piece[index : index + limit])
                continue
            if buf and len(buf) + len(piece) > limit:
                chunks.append(buf)
                buf = piece
            else:
                buf += piece
    if buf:
        chunks.append(buf)
    return chunks


def _edge_proxy() -> str | None:
    for key in ("EDGE_TTS_PROXY", "HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"):
        value = (os.getenv(key) or "").strip()
        if value:
            return value
    return None


def _is_transient_tts(exc: BaseException) -> bool:
    text = str(exc).lower()
    name = type(exc).__name__
    return (
        name == "NoAudioReceived"
        or "no audio was received" in text
        or "没有返回音频" in str(exc)
        or "websocket" in text
        or "timeout" in text
        or "timed out" in text
        or "connection" in text
    )


async def _stream_edge(text: str, voice: str, *, rate: str) -> tuple[bytes, list[WordStamp]]:
    kwargs: dict = {
        "rate": rate,
        "boundary": "WordBoundary",
        "connect_timeout": 20,
        "receive_timeout": 90,
    }
    proxy = _edge_proxy()
    if proxy:
        kwargs["proxy"] = proxy
    communicate = edge_tts.Communicate(text, voice, **kwargs)
    audio = bytearray()
    words: list[WordStamp] = []
    async for chunk in communicate.stream():
        kind = chunk.get("type")
        if kind == "audio":
            audio.extend(chunk["data"])
        elif kind == "WordBoundary":
            start = _ms(chunk["offset"])
            end = start + _ms(chunk["duration"])
            token = str(chunk.get("text") or "").strip()
            if token:
                words.append(WordStamp(text=token, start_ms=start, end_ms=end))
    if not audio:
        raise RuntimeError("微软语音没有返回音频。")
    return bytes(audio), words


async def _synthesize_edge(text: str, voice: str, dest: Path) -> list[WordStamp]:
    last_error: BaseException | None = None
    rates = ("+8%", "+0%")
    for attempt in range(3):
        try:
            audio, words = await _stream_edge(text, voice, rate=rates[min(attempt, len(rates) - 1)])
            dest.write_bytes(audio)
            return words
        except Exception as exc:
            last_error = exc
            log.warning("Edge-TTS 失败 attempt=%s voice=%s: %s", attempt + 1, voice, exc)
            if attempt < 2 and _is_transient_tts(exc):
                await asyncio.sleep(0.7 * (attempt + 1))
                continue
            break
    raise last_error or RuntimeError("微软语音没有返回音频。")


def _run_async(factory: Callable[[], object]):
    def runner():
        return asyncio.run(factory())

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return runner()
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(runner).result()


def _estimate_words(text: str, duration: int) -> list[WordStamp]:
    chars = [item for item in re.sub(r"\s+", "", text or "") if item]
    if not chars or duration <= 0:
        return []
    slot = duration / len(chars)
    stamps: list[WordStamp] = []
    for index, char in enumerate(chars):
        start = int(index * slot)
        end = duration if index + 1 == len(chars) else int((index + 1) * slot)
        stamps.append(WordStamp(text=char, start_ms=start, end_ms=max(end, start + 1)))
    return stamps


def _shift(words: list[WordStamp], offset: int) -> list[WordStamp]:
    return [
        WordStamp(text=item.text, start_ms=item.start_ms + offset, end_ms=item.end_ms + offset)
        for item in words
    ]


def _write_chunk(text: str, profile: dict, dest: Path, max_new_tokens: int = 3000) -> list[WordStamp]:
    if profile["engine"] == "spark":
        from backend.spark_tts import synthesize_spark

        wav_path = dest.with_suffix(".wav")
        synthesize_spark(text, wav_path, profile, max_new_tokens=max_new_tokens)
        to_mp3(wav_path, dest)
        if wav_path.exists() and wav_path != dest:
            wav_path.unlink()
        return _estimate_words(text, duration_ms(dest))
    return _run_async(lambda: _synthesize_edge(text, profile["id"], dest))


def _write_edge_parallel(
    chunks: list[str],
    profile: dict,
    parts: list[Path],
    on_progress: Progress | None,
) -> list[WordStamp]:
    n = len(chunks)
    stamps: list[list[WordStamp]] = [[] for _ in range(n)]
    done = 0
    lock = Lock()

    def one(index: int) -> None:
        nonlocal done
        stamps[index] = _write_chunk(chunks[index], profile, parts[index])
        with lock:
            done += 1
            if on_progress:
                on_progress(done, n)

    workers = min(2, n)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(one, index) for index in range(n)]
        for future in futures:
            future.result()

    words: list[WordStamp] = []
    offset = 0
    for index, part in enumerate(parts):
        words.extend(_shift(stamps[index], offset))
        offset += duration_ms(part)
    return words


def _write_voice(
    text: str,
    voice: str,
    dest: Path,
    on_progress: Progress | None = None,
    max_new_tokens: int = 3000,
) -> tuple[dict, list[WordStamp]]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    profile = resolve_voice(voice)
    limit = 42 if profile["engine"] == "spark" else 90
    chunks = split_narration(text, limit) or [text.strip() or "口播"]
    if on_progress:
        on_progress(0, len(chunks))
    if len(chunks) == 1:
        words = _write_chunk(chunks[0], profile, dest, max_new_tokens=max_new_tokens)
        if on_progress:
            on_progress(1, 1)
        return profile, words

    parts = [dest.parent / f"{dest.stem}_p{index:02d}.mp3" for index, _chunk in enumerate(chunks, start=1)]
    if profile["engine"] == "spark":
        words: list[WordStamp] = []
        offset = 0
        for index, chunk in enumerate(chunks):
            part_words = _write_chunk(chunk, profile, parts[index], max_new_tokens=max_new_tokens)
            words.extend(_shift(part_words, offset))
            offset += duration_ms(parts[index])
            if on_progress:
                on_progress(index + 1, len(chunks))
    else:
        words = _write_edge_parallel(chunks, profile, parts, on_progress)
    concat_audio(parts, dest)
    for part in parts:
        if part.exists() and part != dest:
            part.unlink()
        leftover = part.with_suffix(".wav")
        if leftover.exists():
            leftover.unlink()
    return profile, words


def synthesize_preview(text: str, voice: str, dest: Path) -> Path:
    from backend.voices import SPARK_PREVIEW_TEXT

    profile = resolve_voice(voice)
    # 试听尽量短；合成后保留模型在内存，避免连点试听反复加载。
    sample = SPARK_PREVIEW_TEXT if profile["engine"] == "spark" else text
    tokens = 600 if profile["engine"] == "spark" else 3000
    _write_voice(sample, voice, dest, max_new_tokens=tokens)
    return dest


def synthesize(
    text: str,
    voice: str,
    dest: Path,
    on_progress: Progress | None = None,
) -> tuple[list[WordStamp], int]:
    profile, words = _write_voice(text, voice, dest, on_progress=on_progress)
    audio_ms = duration_ms(dest)
    if profile["engine"] == "spark" and not words:
        words = _estimate_words(text, audio_ms)
    if profile["engine"] == "spark":
        from backend.spark_tts import unload_spark

        unload_spark()
    return words, audio_ms
