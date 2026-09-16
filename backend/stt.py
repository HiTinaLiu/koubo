from __future__ import annotations

import time
from collections.abc import Callable
from pathlib import Path
from threading import Lock

from faster_whisper import WhisperModel

from backend.applog import get_logger
from backend.audio import duration_ms, to_wav_16k
from backend.config import whisper_model_dir
from backend.perf import whisper_cpu_threads
from backend.schemas import Transcript, WordStamp
from backend.zh import to_simplified

Progress = Callable[[str, int], None]
log = get_logger("stt")

_model: WhisperModel | None = None
_lock = Lock()

LONG_MS = 8 * 60 * 1000
MAX_MS = 90 * 60 * 1000


def get_model() -> WhisperModel:
    global _model
    with _lock:
        if _model is None:
            model_dir = whisper_model_dir()
            if not (model_dir / "model.bin").exists():
                log.error("找不到 Whisper 模型：%s", model_dir)
                raise RuntimeError(f"找不到 Whisper 模型：{model_dir}")
            _model = WhisperModel(
                str(model_dir),
                device="cpu",
                compute_type="int8",
                cpu_threads=whisper_cpu_threads(),
                num_workers=1,
            )
        return _model


def _clock(seconds: float) -> str:
    total = max(0, int(seconds))
    minutes, sec = divmod(total, 60)
    if minutes >= 60:
        hours, minutes = divmod(minutes, 60)
        return f"{hours}:{minutes:02d}:{sec:02d}"
    return f"{minutes}:{sec:02d}"


def transcribe_file(
    src: Path,
    wav_dest: Path,
    *,
    need_words: bool = False,
    on_progress: Progress | None = None,
) -> Transcript:
    last = {"t": 0.0, "p": -1}

    def ping(message: str, progress: int, *, force: bool = False) -> None:
        if not on_progress:
            return
        now = time.monotonic()
        clamped = max(0, min(99, int(progress)))
        if (
            force
            or clamped <= 18
            or clamped >= 92
            or now - last["t"] >= 0.8
            or clamped - last["p"] >= 2
        ):
            last["t"] = now
            last["p"] = clamped
            on_progress(message, clamped)

    ping("正在读取录音时长…", 6, force=True)
    try:
        source_ms = duration_ms(src)
    except Exception:
        source_ms = 0
    if source_ms > MAX_MS:
        raise RuntimeError("录音超过 90 分钟。请先剪成更短的几段再识别。")
    if source_ms >= LONG_MS:
        ping(f"录音约 {_clock(source_ms / 1000)}，正在转成识别音频…", 10, force=True)
    else:
        ping("正在转成识别音频…", 10, force=True)

    wav = to_wav_16k(src, wav_dest)
    length = duration_ms(wav) or source_ms
    long_form = length >= LONG_MS
    use_words = need_words and not long_form
    ping("正在加载识别模型，首次会稍慢…", 14, force=True)
    model = get_model()
    ping(
        f"正在识别口播 0:00 / {_clock(length / 1000)}…" if long_form else "正在识别口播…",
        18,
        force=True,
    )
    options = {
        "language": "zh",
        "initial_prompt": "以下是简体中文普通话的口播。",
        "word_timestamps": use_words,
        "vad_filter": True,
        "beam_size": 1,
        "best_of": 1,
        "condition_on_previous_text": not long_form,
    }
    if long_form:
        options["vad_parameters"] = {"min_silence_duration_ms": 700}
    segments, info = model.transcribe(str(wav), **options)
    words: list[WordStamp] = []
    chunk_list: list[WordStamp] = []
    texts: list[str] = []
    last_end = 0.0
    for segment in segments:
        last_end = float(segment.end or last_end)
        text = to_simplified((segment.text or "").strip())
        if text:
            texts.append(text)
            chunk_list.append(
                WordStamp(
                    text=text,
                    start_ms=int(segment.start * 1000),
                    end_ms=int(segment.end * 1000),
                )
            )
        for word in segment.words or []:
            token = to_simplified((word.word or "").strip())
            if not token:
                continue
            words.append(
                WordStamp(
                    text=token,
                    start_ms=int(word.start * 1000),
                    end_ms=int(word.end * 1000),
                )
            )
        if length:
            pct = 18 + int(74 * min(1.0, last_end * 1000 / length))
            ping(f"正在识别口播 {_clock(last_end)} / {_clock(length / 1000)}…", pct)

    full = to_simplified("".join(texts).strip() or " ".join(w.text for w in words).strip())
    return Transcript(
        text=full,
        language=getattr(info, "language", None) or "zh",
        duration_ms=length,
        words=words,
        segments=chunk_list,
    )
