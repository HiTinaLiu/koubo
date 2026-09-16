from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from backend.config import PREVIEW_DIR, VOICE_DIR
from backend.errors import explain_error
from backend.spark_tts import spark_ready
from backend.themes import THEMES
from backend.tts import synthesize_preview
from backend.voices import PREVIEW_TEXT, SPARK_PREVIEW_TEXT, default_voice
from backend.voice_lib import add_clone, all_voices, clone_ref_path, delete_clone, get_clone, is_known_voice, resolve_voice

router = APIRouter(prefix="/api/voices", tags=["voices"])

_CLONE_MEDIA = {
    ".wav",
    ".mp3",
    ".m4a",
    ".aac",
    ".flac",
    ".ogg",
    ".opus",
    ".webm",
    ".mp4",
    ".mov",
    ".mkv",
    ".avi",
    ".m4v",
}


@router.get("")
def list_voices():
    return {
        "voices": all_voices(),
        "themes": THEMES,
        "default_voice": default_voice(),
        "spark": spark_ready(),
    }


@router.get("/preview")
def preview_voice(voice: str):
    if not is_known_voice(voice):
        raise HTTPException(400, "不支持的音色")
    profile = resolve_voice(voice)
    dest = PREVIEW_DIR / f"{profile['id']}.mp3"
    try:
        if not dest.exists() or dest.stat().st_size < 1000:
            dest.parent.mkdir(parents=True, exist_ok=True)
            sample = SPARK_PREVIEW_TEXT if profile.get("engine") == "spark" else PREVIEW_TEXT
            synthesize_preview(sample, profile["id"], dest)
        return FileResponse(dest, media_type="audio/mpeg")
    except HTTPException:
        raise
    except Exception as exc:
        if dest.exists() and dest.stat().st_size < 1000:
            dest.unlink()
        raise HTTPException(500, explain_error(exc, where="试听失败")) from exc


@router.get("/clones/{clone_id}/ref")
def clone_reference(clone_id: str):
    """立即播放克隆时保存的参考音，不跑 Spark 合成。"""
    if not get_clone(clone_id):
        raise HTTPException(404, "克隆声音不存在")
    path = clone_ref_path(clone_id)
    if not path.exists():
        raise HTTPException(404, "参考音文件不存在")
    return FileResponse(path, media_type="audio/wav", filename=f"{clone_id}-ref.wav")


@router.post("/clones")
async def create_clone(
    name: Annotated[str, Form()],
    prompt_text: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    source: Annotated[str, Form()] = "self",
):
    """用参考音视频 + 对应文字创建克隆音色。source=self 本人朗读；source=other 他人材料。"""
    if not (name or "").strip():
        raise HTTPException(400, "请填写声音名称")
    text = (prompt_text or "").strip()
    if not text:
        raise HTTPException(400, "请填写这段音视频里实际说的文字")
    suffix = Path(file.filename or "ref.wav").suffix.lower() or ".wav"
    if suffix not in _CLONE_MEDIA:
        raise HTTPException(400, "请上传音频或视频（mp3 / wav / m4a / mp4 / webm / mov 等）")
    temp = VOICE_DIR / f"_upload{suffix}"
    temp.parent.mkdir(parents=True, exist_ok=True)
    payload = await file.read()
    if len(payload) < 1000:
        raise HTTPException(400, "文件太小，请换一段清晰的人声音视频")
    temp.write_bytes(payload)
    try:
        return add_clone(name, temp, text, source)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(500, explain_error(exc, where="克隆失败")) from exc
    finally:
        if temp.exists():
            temp.unlink()


@router.delete("/clones/{clone_id}")
def remove_clone(clone_id: str):
    if not delete_clone(clone_id):
        raise HTTPException(404, "克隆声音不存在")
    return {"ok": True}
