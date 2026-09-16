from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

from backend.config import tool_path


def _ffmpeg() -> str:
    exe = tool_path("ffmpeg")
    if not exe:
        raise RuntimeError("未找到 ffmpeg，请先安装并加入 PATH，或使用带 ffmpeg 的安装包")
    return exe


def _ffprobe() -> str:
    exe = tool_path("ffprobe")
    if not exe:
        raise RuntimeError("未找到 ffprobe，请先安装并加入 PATH，或使用带 ffmpeg 的安装包")
    return exe


def to_wav_16k(src: Path, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            _ffmpeg(),
            "-y",
            "-i",
            str(src),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-vn",
            str(dest),
        ],
        check=True,
        capture_output=True,
    )
    return dest


def to_mp3(src: Path, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [_ffmpeg(), "-y", "-i", str(src), "-vn", "-codec:a", "libmp3lame", "-q:a", "4", str(dest)],
        check=True,
        capture_output=True,
    )
    return dest


def extract_mp3(src: Path, dest: Path) -> Path:
    if not has_audio_stream(src):
        raise RuntimeError("录像里没有声音。请允许麦克风后，重新对着提词器录一段。")
    to_mp3(src, dest)
    level = mean_volume_db(dest)
    if level is not None and level < -50:
        dest.unlink(missing_ok=True)
        raise RuntimeError(
            "录像几乎没有声音。请在提词器里改选系统麦克风（不要用 Iriun 等虚拟麦），允许麦克风权限后重录。"
        )
    return dest


def mean_volume_db(path: Path) -> float | None:
    result = subprocess.run(
        [_ffmpeg(), "-hide_banner", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True,
        text=True,
        check=False,
    )
    text = f"{result.stderr or ''}\n{result.stdout or ''}"
    match = re.search(r"mean_volume:\s*(-inf|-?[\d.]+)\s*dB", text, re.I)
    if not match:
        return None
    raw = match.group(1).lower()
    return -120.0 if raw == "-inf" else float(raw)


def has_audio_stream(path: Path) -> bool:
    result = subprocess.run(
        [
            _ffprobe(),
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=index",
            "-of",
            "csv=p=0",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    return bool((result.stdout or "").strip())


def to_h264_mp4(src: Path, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            _ffmpeg(),
            "-y",
            "-i",
            str(src),
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-r",
            "30",
            "-fps_mode",
            "cfr",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-movflags",
            "+faststart",
            str(dest),
        ],
        check=True,
        capture_output=True,
    )
    return dest


def extract_frame(src: Path, dest: Path, at_seconds: float = 0.9) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            _ffmpeg(),
            "-y",
            "-i",
            str(src),
            "-ss",
            f"{max(0.0, float(at_seconds)):.3f}",
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(dest),
        ],
        check=True,
        capture_output=True,
    )
    return dest


def write_wav_pcm(dest: Path, samples, sample_rate: int) -> Path:
    import wave

    import numpy as np

    dest.parent.mkdir(parents=True, exist_ok=True)
    array = np.asarray(samples)
    if array.ndim > 1:
        array = array.squeeze()
    pcm = (array * 32767.0).clip(-32768, 32767).astype("<i2")
    with wave.open(str(dest), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(int(sample_rate))
        handle.writeframes(pcm.tobytes())
    return dest


def concat_audio(parts: list[Path], dest: Path) -> Path:
    if not parts:
        raise RuntimeError("没有可拼接的音频")
    if len(parts) == 1:
        if parts[0] != dest:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(parts[0].read_bytes())
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    listing = dest.with_suffix(".concat.txt")
    listing.write_text(
        "".join(
            "file '" + path.resolve().as_posix().replace("'", r"'\''") + "'\n" for path in parts
        ),
        encoding="utf-8",
    )
    try:
        subprocess.run(
            [
                _ffmpeg(),
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(listing),
                "-codec:a",
                "libmp3lame",
                "-q:a",
                "4",
                str(dest),
            ],
            check=True,
            capture_output=True,
        )
    finally:
        if listing.exists():
            listing.unlink()
    return dest


def duration_ms(path: Path) -> int:
    result = subprocess.run(
        [
            _ffprobe(),
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    seconds = float(json.loads(result.stdout)["format"]["duration"])
    return int(seconds * 1000)
