from __future__ import annotations

from pathlib import Path

from backend.audio import duration_ms, extract_frame
from backend.jobs import job_dir

COVER_NAME = "cover.jpg"


def cover_file(job_id: str) -> Path:
    return job_dir(job_id) / COVER_NAME


def write_cover(
    video: Path,
    dest: Path,
    duration_ms_value: int | None = None,
    title_end_ms: int | None = None,
) -> Path:
    total = duration_ms_value if duration_ms_value is not None else duration_ms(video)
    at = 0.6
    if title_end_ms and title_end_ms > 400:
        at = max(0.25, min((title_end_ms / 1000.0) * 0.42, (title_end_ms / 1000.0) - 0.12))
    elif total > 0:
        at = min(0.9, max(0.25, (total / 1000) * 0.08))
    try:
        extract_frame(video, dest, at)
        if dest.exists() and dest.stat().st_size > 200:
            return dest
    except Exception:
        pass
    extract_frame(video, dest, 0)
    return dest


def ensure_cover(job_id: str) -> Path:
    from backend.jobs import job_dir, load_timeline

    dest = cover_file(job_id)
    if dest.exists() and dest.stat().st_size > 200:
        return dest
    video = job_dir(job_id) / "final.mp4"
    if not video.exists():
        raise FileNotFoundError(job_id)
    timeline = load_timeline(job_id)
    return write_cover(
        video,
        dest,
        timeline.duration_ms if timeline else None,
        timeline.title_end_ms if timeline else None,
    )
