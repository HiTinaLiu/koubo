from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend import jobs
from backend.api.deps import get_library_item
from backend.api.dto import LibraryBatchDelete, LibraryPatch
from backend.config import EDGE_TTS_VOICE
from backend.library import delete_item, delete_items, list_items, update_item
from backend.schemas import Transcript
from backend.services.scripting import script_from_rewrite

router = APIRouter(prefix="/api/library", tags=["library"])


@router.get("")
def library_list(q: str = ""):
    return {"items": [item.model_dump() for item in list_items(q)]}


@router.post("/batch-delete")
def library_batch_delete(body: LibraryBatchDelete):
    ids = [item_id.strip() for item_id in body.ids if item_id and item_id.strip()]
    if not ids:
        raise HTTPException(400, "请先勾选要删除的文稿")
    deleted = delete_items(ids)
    return {"ok": True, "deleted": deleted}


@router.get("/{item_id}")
def library_get(item_id: str):
    return get_library_item(item_id).model_dump()


@router.patch("/{item_id}")
def library_patch(item_id: str, body: LibraryPatch):
    item = get_library_item(item_id)
    script = body.script
    if script is None and body.narration is not None:
        script = script_from_rewrite(
            body.original if body.original is not None else item.original,
            body.narration,
            item.script,
        )
    updated = update_item(item_id, body.title, body.original, script, body.deck)
    return updated.model_dump()


@router.delete("/{item_id}")
def library_delete(item_id: str):
    if not delete_item(item_id):
        raise HTTPException(404, "文稿不存在")
    return {"ok": True}


@router.post("/{item_id}/reuse")
def library_reuse(item_id: str):
    item = get_library_item(item_id)
    job = jobs.create_job("text", EDGE_TTS_VOICE)
    original = item.original.strip()
    if original:
        jobs.save_transcript(job.id, Transcript(text=original, language="zh", duration_ms=0))
    if item.script:
        jobs.save_script(job.id, item.script)
        jobs.set_status(job.id, "script_ready", "已从文稿库载入")
    elif original:
        jobs.set_status(job.id, "transcribed", "已从文稿库载入原文")
    else:
        raise HTTPException(400, "这篇文稿是空的")
    if item.deck and item.deck.beats:
        jobs.save_deck(job.id, item.deck)
    return jobs.view(job.id).model_dump()
