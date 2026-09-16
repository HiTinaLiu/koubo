from __future__ import annotations

import os
import shutil
from pathlib import Path

from backend.applog import get_logger, truncate_log_files
from backend.config import DATA_DIR, ENGINE_ROOT, PREVIEW_DIR, USER_DATA
from backend.jobs import list_history
from backend.render import remotion_public_dir
from backend.schemas import WORKING_STATUSES

log = get_logger("cleanup")

SKIP_DIRS = {
    ".git",
    "node_modules",
    "pretrained_models",
    "packaging",
    "dist",
    "release",
    ".venv",
    "venv",
    "models",
    "ffmpeg",
    "python",
}

JOB_TMP_SUFFIXES = {".tmp", ".pyc"}


def format_bytes(value: int) -> str:
    size = max(0, int(value))
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    if size < 1024 * 1024 * 1024:
        return f"{size / (1024 * 1024):.1f} MB"
    return f"{size / (1024 * 1024 * 1024):.1f} GB"


def _file_size(path: Path) -> int:
    try:
        return path.stat().st_size if path.is_file() else 0
    except OSError:
        return 0


def _dir_size(path: Path) -> int:
    total = 0
    if not path.exists():
        return 0
    if path.is_file():
        return _file_size(path)
    for item in path.rglob("*"):
        if item.is_file():
            total += _file_size(item)
    return total


def _unlink(path: Path) -> int:
    size = _file_size(path)
    try:
        path.unlink()
        return size
    except OSError:
        return 0


def _rmtree(path: Path) -> int:
    size = _dir_size(path)
    try:
        shutil.rmtree(path, ignore_errors=True)
        return size if not path.exists() else 0
    except OSError:
        return 0


def _purge_pycache(root: Path) -> int:
    freed = 0
    if not root.exists():
        return 0
    for dirpath, dirnames, filenames in os.walk(root):
        current = Path(dirpath)
        dirnames[:] = [name for name in dirnames if name not in SKIP_DIRS]
        if current.name == "__pycache__":
            freed += _rmtree(current)
            dirnames[:] = []
            continue
        for name in filenames:
            path = current / name
            if path.suffix in {".pyc", ".pyo"}:
                freed += _unlink(path)
    return freed


def _purge_tmp_in_jobs() -> int:
    freed = 0
    if not DATA_DIR.exists():
        return 0
    for path in DATA_DIR.rglob("*"):
        if not path.is_file():
            continue
        name = path.name
        if name in {".gitkeep", "job.json"}:
            continue
        if path.suffix in JOB_TMP_SUFFIXES or name.startswith("."):
            freed += _unlink(path)
    return freed


def _purge_previews() -> int:
    if not PREVIEW_DIR.exists():
        return 0
    return _rmtree(PREVIEW_DIR)


def _purge_remotion_copies() -> int:
    public = remotion_public_dir() / "jobs"
    if not public.exists():
        return 0
    busy = {item.id for item in list_history() if item.status in WORKING_STATUSES}
    freed = 0
    for folder in list(public.iterdir()):
        if not folder.is_dir():
            continue
        if folder.name in busy:
            continue
        freed += _rmtree(folder)
    return freed


def _purge_vite_cache() -> int:
    freed = 0
    for path in (
        ENGINE_ROOT / "web" / "node_modules" / ".vite",
        ENGINE_ROOT / "web" / "node_modules" / ".cache",
        ENGINE_ROOT / "remotion" / "node_modules" / ".cache",
        USER_DATA / "cache" / "tmp",
    ):
        if path.exists():
            freed += _rmtree(path)
    return freed


def purge_junk() -> dict:
    parts: dict[str, int] = {}
    parts["logs"] = truncate_log_files()
    parts["python_cache"] = _purge_pycache(ENGINE_ROOT / "backend")
    parts["job_tmp"] = _purge_tmp_in_jobs()
    parts["voice_previews"] = _purge_previews()
    parts["render_copies"] = _purge_remotion_copies()
    parts["vite_cache"] = _purge_vite_cache()
    try:
        from backend.spark_slim import slim_spark_dir

        parts["spark_slim"] = slim_spark_dir()
    except Exception:
        parts["spark_slim"] = 0
    freed = sum(parts.values())
    labels = {
        "logs": "日志",
        "python_cache": "Python 缓存",
        "job_tmp": "任务临时文件",
        "voice_previews": "试听缓存",
        "render_copies": "渲染中间拷贝",
        "vite_cache": "前端缓存",
        "spark_slim": "克隆编码器",
    }
    detail = "、".join(f"{labels[key]} {format_bytes(size)}" for key, size in parts.items() if size)
    log.info("已清理占用空间 bytes=%s", freed)
    return {
        "ok": True,
        "freed": freed,
        "freed_label": format_bytes(freed),
        "parts": {key: {"bytes": size, "label": format_bytes(size)} for key, size in parts.items()},
        "message": f"已清理 {format_bytes(freed)}" + (f"（{detail}）" if detail else "，没有多余文件。"),
    }
