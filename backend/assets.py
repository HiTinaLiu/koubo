from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from backend.config import ASSET_DIR
from backend.schemas import Asset

ASSET_DIR.mkdir(parents=True, exist_ok=True)
FILES_DIR = ASSET_DIR / "files"
FILES_DIR.mkdir(parents=True, exist_ok=True)
STORE = ASSET_DIR / "library.json"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXTS = {".mp4", ".webm", ".mov"}
MUSIC_EXTS = {".mp3", ".wav", ".m4a", ".ogg", ".aac"}
MAX_BYTES = 80 * 1024 * 1024

KIND_EXTS = {
    "image": IMAGE_EXTS,
    "video": VIDEO_EXTS,
    "music": MUSIC_EXTS,
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read() -> list[dict]:
    if not STORE.exists():
        return []
    raw = json.loads(STORE.read_text(encoding="utf-8"))
    return list(raw.get("items") or [])


def _write(items: list[dict]) -> None:
    STORE.write_text(json.dumps({"items": items}, ensure_ascii=False, indent=2), encoding="utf-8")


def infer_kind(suffix: str, hinted: str = "") -> str | None:
    ext = (suffix or "").lower()
    hint = (hinted or "").strip().lower()
    if hint in KIND_EXTS and ext in KIND_EXTS[hint]:
        return hint
    if ext in IMAGE_EXTS:
        return "image"
    if ext in VIDEO_EXTS:
        return "video"
    if ext in MUSIC_EXTS:
        return "music"
    return None


def file_path(item: Asset) -> Path:
    return FILES_DIR / item.filename


def list_assets(kind: str = "") -> list[Asset]:
    wanted = kind.strip().lower()
    items: list[Asset] = []
    kept: list[dict] = []
    dirty = False
    for raw in _read():
        item = Asset.model_validate(raw)
        path = file_path(item)
        if not path.exists():
            dirty = True
            continue
        kept.append(item.model_dump())
        if wanted and item.kind != wanted:
            continue
        items.append(item)
    if dirty:
        _write(kept)
    items.sort(key=lambda item: item.created_at, reverse=True)
    return items


def get_asset(asset_id: str) -> Asset | None:
    if not asset_id:
        return None
    for item in list_assets():
        if item.id == asset_id:
            return item
    return None


def add_asset(name: str, src: Path, kind: str = "") -> Asset:
    suffix = src.suffix.lower() or ".bin"
    resolved = infer_kind(suffix, kind)
    if not resolved:
        raise ValueError("只支持图片 jpg/png/webp、视频 mp4/webm、或配乐 mp3/wav/m4a")
    size = src.stat().st_size
    if size > MAX_BYTES:
        raise ValueError("文件太大，请控制在 80MB 以内")
    asset_id = uuid4().hex[:10]
    filename = f"{asset_id}{suffix}"
    dest = FILES_DIR / filename
    shutil.copyfile(src, dest)
    stem = Path(name).stem.strip() or src.stem.strip() or "未命名素材"
    item = Asset(
        id=asset_id,
        name=stem[:80],
        kind=resolved,  # type: ignore[arg-type]
        filename=filename,
        size=size,
        created_at=_now(),
    )
    rows = _read()
    rows.insert(0, item.model_dump())
    _write(rows)
    return item


def delete_asset(asset_id: str) -> bool:
    rows = _read()
    keep: list[dict] = []
    found = None
    for raw in rows:
        if raw.get("id") == asset_id:
            found = raw
        else:
            keep.append(raw)
    if not found:
        return False
    path = FILES_DIR / str(found.get("filename") or "")
    if path.exists():
        path.unlink()
    _write(keep)
    return True


def copy_into_job(
    job_id: str,
    background_id: str | None,
    music_id: str | None,
) -> tuple[str | None, str | None, str | None]:
    from backend.jobs import job_dir

    directory = job_dir(job_id)
    for leftover in list(directory.glob("bg.*")) + list(directory.glob("bgm.*")):
        leftover.unlink(missing_ok=True)

    background = None
    background_kind = None
    music = None

    visual = get_asset((background_id or "").strip())
    visual_src = file_path(visual) if visual and visual.kind in {"image", "video"} else None
    if visual and visual_src and visual.kind == "video":
        from backend.audio import to_h264_mp4

        background = "bg.mp4"
        background_kind = "video"
        to_h264_mp4(visual_src, directory / background)
    elif visual and visual_src:
        suffix = Path(visual.filename).suffix.lower() or ".jpg"
        background = f"bg{suffix}"
        background_kind = "image"
        shutil.copyfile(visual_src, directory / background)

    audio = get_asset((music_id or "").strip())
    if audio and audio.kind == "music":
        suffix = Path(audio.filename).suffix.lower() or ".mp3"
        music = f"bgm{suffix}"
        shutil.copyfile(file_path(audio), directory / music)
    elif (music_id or "").strip() == "__bg_audio__" and visual and visual_src and visual.kind == "video":
        from backend.audio import extract_mp3, has_audio_stream

        try:
            if has_audio_stream(visual_src):
                extract_mp3(visual_src, directory / "bgm.mp3")
                music = "bgm.mp3"
        except Exception:
            music = None

    return background, background_kind, music


def copy_page_backgrounds(job_id: str, asset_ids: list[str]) -> dict[str, dict]:
    import re

    from backend.jobs import job_dir

    directory = job_dir(job_id)
    for leftover in directory.glob("pagebg_*"):
        leftover.unlink(missing_ok=True)
    out: dict[str, dict] = {}
    seen: set[str] = set()
    for raw in asset_ids:
        asset_id = (raw or "").strip()
        if not asset_id or asset_id == "__theme__" or asset_id in seen:
            continue
        visual = get_asset(asset_id)
        visual_src = file_path(visual) if visual and visual.kind in {"image", "video"} else None
        if not visual or not visual_src:
            continue
        seen.add(asset_id)
        safe = re.sub(r"[^a-zA-Z0-9]+", "", asset_id)[:12] or "x"
        if visual.kind == "video":
            from backend.audio import duration_ms, to_h264_mp4

            name = f"pagebg_{safe}.mp4"
            to_h264_mp4(visual_src, directory / name)
            duration = duration_ms(directory / name) if (directory / name).exists() else None
            out[asset_id] = {"file": name, "kind": "video", "duration_ms": duration}
        else:
            suffix = Path(visual.filename).suffix.lower() or ".jpg"
            name = f"pagebg_{safe}{suffix}"
            shutil.copyfile(visual_src, directory / name)
            out[asset_id] = {"file": name, "kind": "image"}
    return out
