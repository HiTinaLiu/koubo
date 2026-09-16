from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from backend.assets import add_asset, delete_asset, file_path, get_asset, list_assets
from backend.config import ASSET_DIR

router = APIRouter(prefix="/api/assets", tags=["assets"])

ASSET_MEDIA = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".aac": "audio/aac",
}


@router.get("")
def assets_list(kind: str = ""):
    return {"items": [item.model_dump() for item in list_assets(kind)]}


@router.post("")
async def assets_create(
    file: UploadFile = File(...),
    name: str = Form(default=""),
    kind: str = Form(default=""),
):
    suffix = Path(file.filename or "asset.bin").suffix.lower() or ".bin"
    temp = ASSET_DIR / f"_upload{suffix}"
    temp.parent.mkdir(parents=True, exist_ok=True)
    temp.write_bytes(await file.read())
    try:
        item = add_asset(name or (file.filename or ""), temp, kind)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    finally:
        if temp.exists():
            temp.unlink()
    return item.model_dump()


@router.get("/{asset_id}/file")
def assets_file(asset_id: str):
    item = get_asset(asset_id)
    if not item:
        raise HTTPException(404, "素材不存在")
    path = file_path(item)
    if not path.exists():
        raise HTTPException(404, "素材文件已丢失")
    media = ASSET_MEDIA.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media)


@router.delete("/{asset_id}")
def assets_delete(asset_id: str):
    if not delete_asset(asset_id):
        raise HTTPException(404, "素材不存在")
    return {"ok": True}
