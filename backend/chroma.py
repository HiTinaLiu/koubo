from __future__ import annotations

import json
import subprocess
from collections import deque
from pathlib import Path

import numpy as np

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


def _probe(path: Path) -> tuple[int, int, float]:
    result = subprocess.run(
        [
            _ffprobe(),
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,avg_frame_rate,r_frame_rate",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    stream = (json.loads(result.stdout or "{}").get("streams") or [{}])[0]
    width = int(stream.get("width") or 0)
    height = int(stream.get("height") or 0)
    rate = str(stream.get("avg_frame_rate") or stream.get("r_frame_rate") or "30/1")
    if "/" in rate:
        num, den = rate.split("/", 1)
        fps = float(num) / max(float(den), 1.0)
    else:
        fps = float(rate or 30)
    if width < 2 or height < 2:
        raise RuntimeError("录像没有有效画面")
    return width, height, max(12.0, min(60.0, fps or 30.0))


def _median_axis(values: np.ndarray) -> np.ndarray:
    return np.median(values, axis=0)


def _flood(walk: np.ndarray) -> np.ndarray:
    height, width = walk.shape
    seen = np.zeros((height, width), dtype=np.bool_)
    queue: deque[tuple[int, int]] = deque()

    def push(y: int, x: int) -> None:
        if y < 0 or x < 0 or y >= height or x >= width:
            return
        if seen[y, x] or not walk[y, x]:
            return
        seen[y, x] = True
        queue.append((y, x))

    for x in range(width):
        push(0, x)
        push(height - 1, x)
    for y in range(height):
        push(y, 0)
        push(y, width - 1)
    while queue:
        y, x = queue.popleft()
        push(y - 1, x)
        push(y + 1, x)
        push(y, x - 1)
        push(y, x + 1)
    return seen


def _dilate(mask: np.ndarray) -> np.ndarray:
    pad = np.pad(mask, 1, mode="constant", constant_values=False)
    return (
        pad[1:-1, 1:-1]
        | pad[:-2, 1:-1]
        | pad[2:, 1:-1]
        | pad[1:-1, :-2]
        | pad[1:-1, 2:]
        | pad[:-2, :-2]
        | pad[:-2, 2:]
        | pad[2:, :-2]
        | pad[2:, 2:]
    )


def _erode(mask: np.ndarray) -> np.ndarray:
    pad = np.pad(mask, 1, mode="constant", constant_values=False)
    return (
        pad[1:-1, 1:-1]
        & pad[:-2, 1:-1]
        & pad[2:, 1:-1]
        & pad[1:-1, :-2]
        & pad[1:-1, 2:]
    )


def _close(mask: np.ndarray, radius: int) -> np.ndarray:
    out = mask
    for _ in range(max(1, radius)):
        out = _dilate(out)
    for _ in range(max(1, radius)):
        out = _erode(out)
    return out


def _fill_interior(fg: np.ndarray) -> np.ndarray:
    outer = _flood(~fg)
    return ~outer


def _key_frame(rgb: np.ndarray, tightness: float) -> np.ndarray:
    height, width, _ = rgb.shape
    step = max(1, int(round(max(width, height) / 480)))
    small = rgb[::step, ::step]
    sh, sw = small.shape[:2]
    border = np.concatenate(
        [
            small[0:2, :, :].reshape(-1, 3),
            small[-2:, :, :].reshape(-1, 3),
            small[:, 0:2, :].reshape(-1, 3),
            small[:, -2:, :].reshape(-1, 3),
        ],
        axis=0,
    ).astype(np.float32)
    y = 0.299 * border[:, 0] + 0.587 * border[:, 1] + 0.114 * border[:, 2]
    u = border[:, 0] - y
    v = border[:, 2] - y
    key = np.array([np.median(y), np.median(u), np.median(v)], dtype=np.float32)
    spread = float(
        np.sqrt(
            np.median(np.abs(y - key[0])) ** 2
            + np.median(np.abs(u - key[1])) ** 2
            + np.median(np.abs(v - key[2])) ** 2
        )
    )
    limit = float(np.clip(14 + tightness * 110 + spread * 1.15, 16, 78))
    pixels = small.astype(np.float32)
    py = 0.299 * pixels[:, :, 0] + 0.587 * pixels[:, :, 1] + 0.114 * pixels[:, :, 2]
    pu = pixels[:, :, 0] - py
    pv = pixels[:, :, 2] - py
    dist2 = 0.28 * (py - key[0]) ** 2 + (pu - key[1]) ** 2 + (pv - key[2]) ** 2
    like = dist2 <= limit * limit
    gray = 0.299 * pixels[:, :, 0] + 0.587 * pixels[:, :, 1] + 0.114 * pixels[:, :, 2]
    gx = np.abs(np.diff(gray, axis=1, append=gray[:, -1:]))
    gy = np.abs(np.diff(gray, axis=0, append=gray[-1:, :]))
    barrier = gx + gy > 18
    walk = like & ~barrier
    walk[0, :] = like[0, :]
    walk[-1, :] = like[-1, :]
    walk[:, 0] = like[:, 0]
    walk[:, -1] = like[:, -1]
    outer_bg = _flood(walk)
    fg = ~outer_bg
    radius = 3 if tightness > 0.28 else 2 if tightness > 0.16 else 1
    fg = _fill_interior(_close(fg, radius))
    alpha_small = np.where(fg, 255, 0).astype(np.uint8)
    neighbor = _dilate(~fg)
    alpha_small = np.where(fg & neighbor, 210, alpha_small)
    alpha = np.repeat(np.repeat(alpha_small, step, axis=0), step, axis=1)[:height, :width]
    return np.dstack([rgb, alpha])


def _encode_args(dest: Path, width: int, height: int, fps: float) -> list[str]:
    common = [
        _ffmpeg(),
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "-s",
        f"{width}x{height}",
        "-r",
        f"{fps:.4f}",
        "-i",
        "-",
        "-an",
    ]
    suffix = dest.suffix.lower()
    if suffix == ".mov":
        return [*common, "-c:v", "qtrle", str(dest)]
    return [
        *common,
        "-c:v",
        "libvpx-vp9",
        "-pix_fmt",
        "yuva420p",
        "-auto-alt-ref",
        "0",
        "-deadline",
        "realtime",
        "-cpu-used",
        "8",
        "-crf",
        "33",
        "-b:v",
        "0",
        str(dest),
    ]


def key_solid_background(src: Path, dest: Path, tightness: float = 0.18, on_progress=None) -> Path:
    width, height, fps = _probe(src)
    dest.parent.mkdir(parents=True, exist_ok=True)
    frame_size = width * height * 3
    decode = subprocess.Popen(
        [_ffmpeg(), "-i", str(src), "-f", "rawvideo", "-pix_fmt", "rgb24", "-an", "-"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    encode = subprocess.Popen(
        _encode_args(dest, width, height, fps),
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    assert decode.stdout and encode.stdin
    index = 0
    try:
        while True:
            buf = decode.stdout.read(frame_size)
            if not buf or len(buf) < frame_size:
                break
            rgb = np.frombuffer(buf, dtype=np.uint8).reshape((height, width, 3)).copy()
            rgba = _key_frame(rgb, tightness)
            encode.stdin.write(np.ascontiguousarray(rgba).tobytes())
            index += 1
            if on_progress and index % 12 == 0:
                on_progress(index)
        encode.stdin.close()
        encode.wait(timeout=600)
        decode.wait(timeout=60)
        if encode.returncode != 0 or not dest.exists() or dest.stat().st_size < 64:
            raise RuntimeError("透明抠像编码失败")
        return dest
    finally:
        if decode.poll() is None:
            decode.kill()
        if encode.poll() is None:
            encode.kill()


def key_talking_head(src: Path, directory: Path, tightness: float = 0.18, on_progress=None) -> Path:
    webm = directory / "talk_key.webm"
    try:
        return key_solid_background(src, webm, tightness, on_progress)
    except Exception:
        if webm.exists():
            webm.unlink()
        mov = directory / "talk_key.mov"
        return key_solid_background(src, mov, tightness, on_progress)
