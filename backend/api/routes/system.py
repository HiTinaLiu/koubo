from __future__ import annotations

import os
import threading
import time

from fastapi import APIRouter

from backend.config import whisper_model_dir
from backend.models_store import engine_status

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/ping")
def ping():
    return {"ok": True}


@router.get("/health")
def health():
    from backend.settings_store import llm_ready

    return {
        "ok": True,
        "whisper": (whisper_model_dir() / "model.bin").exists(),
        "llm": llm_ready(),
        "engine": engine_status(),
    }


@router.post("/system/restart")
def restart_process():
    def boom() -> None:
        time.sleep(0.4)
        os._exit(3)

    threading.Thread(target=boom, daemon=True, name="koubo-restart").start()
    return {"ok": True, "mode": "soft"}
