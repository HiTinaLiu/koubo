from __future__ import annotations

import os
from typing import Literal

RenderPreset = Literal["fast", "standard"]


def cpu_count() -> int:
    return os.cpu_count() or 4


def whisper_cpu_threads() -> int:
    """Leave a core for the UI / later Remotion; cap so 8GB machines do not oversubscribe."""
    return max(2, min(cpu_count() - 1, 4))


def normalize_render_preset(value: str | None) -> RenderPreset:
    return "fast" if value == "fast" else "standard"


def remotion_concurrency(preset: str = "standard") -> int:
    cores = cpu_count()
    cap = 3 if preset == "fast" else 4
    return max(1, min(cores - 1 if cores > 1 else 1, cap))


def render_encode_args(preset: str = "standard") -> list[str]:
    if preset == "fast":
        return [
            "--codec=h264",
            "--x264-preset=ultrafast",
            "--crf=28",
            "--jpeg-quality=55",
            "--scale=0.666667",
        ]
    return [
        "--codec=h264",
        "--x264-preset=veryfast",
        "--crf=23",
        "--jpeg-quality=80",
    ]
