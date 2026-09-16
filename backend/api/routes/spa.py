from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import FileResponse

from backend.config import WEB_DIST

router = APIRouter(tags=["spa"])


@router.get("/")
def spa_index():
    index = WEB_DIST / "index.html"
    if index.exists():
        return FileResponse(index)
    return {"ok": True, "app": "口播场记", "hint": "开发模式请用 Electron 窗口"}
