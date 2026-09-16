from __future__ import annotations

import json
import time
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse

from backend import jobs
from backend.api.deps import get_job, require_idle
from backend.api.dto import AnalyzeRequest, DeckPlanRequest, DeckStyleRequest, JobBatchDelete, LookPlanRequest, RenderRequest, ScriptPatch, TextJobBody, TranscriptPatch
from backend.config import EDGE_TTS_VOICE
from backend.cover import ensure_cover
from backend.errors import explain_error
from backend.keywords import fill_keywords
from backend.library import upsert_job
from backend.llm import script_from_transcript
from backend.perf import normalize_render_preset
from backend.review import build_review, pack_text
from backend.rewrite import resolve_genre, resolve_platform
from backend.schemas import Script, Transcript
from backend.services.pipeline import apply_produce, run_analyze, run_render, run_transcribe
from backend.services.scripting import compose_narration
from backend.work_queue import submit

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("")
def list_jobs():
    return {"jobs": [item.model_dump() for item in jobs.list_history()]}


@router.post("/batch-delete")
def jobs_batch_delete(body: JobBatchDelete):
    ids = [item_id.strip() for item_id in body.ids if item_id and item_id.strip()]
    if not ids:
        raise HTTPException(400, "请先勾选要删除的成片")
    deleted, skipped = jobs.delete_jobs(ids)
    return {"ok": True, "deleted": deleted, "skipped": skipped}


@router.get("/{job_id}")
def get_job_view(job_id: str):
    last_error: Exception | None = None
    for _ in range(4):
        try:
            get_job(job_id)
            return jobs.view(job_id).model_dump()
        except json.JSONDecodeError as exc:
            last_error = exc
            time.sleep(0.05)
    raise HTTPException(503, "任务状态稍后刷新") from last_error


@router.delete("/{job_id}")
def remove_job(job_id: str):
    get_job(job_id)
    try:
        jobs.delete_job(job_id)
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc
    return {"ok": True}


@router.post("/text")
def create_text_job(body: TextJobBody):
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "请输入口播文字")
    job = jobs.create_job("text", body.voice or EDGE_TTS_VOICE)
    jobs.save_transcript(job.id, Transcript(text=text, language="zh", duration_ms=0))
    jobs.set_status(job.id, "transcribed", "文字已导入，可以直接改稿")
    upsert_job(job.id)
    return jobs.view(job.id).model_dump()


@router.post("/audio")
async def create_audio_job(
    file: UploadFile = File(...),
    voice: str = Form(default=EDGE_TTS_VOICE),
):
    suffix = Path(file.filename or "recording.webm").suffix.lower() or ".webm"
    if suffix not in {".webm", ".wav", ".mp3", ".m4a", ".mp4", ".ogg", ".aac"}:
        suffix = ".webm"
    job = jobs.create_job("audio", voice or EDGE_TTS_VOICE)
    dest = jobs.job_dir(job.id) / f"raw{suffix}"
    dest.write_bytes(await file.read())
    jobs.set_status(job.id, "transcribing", "正在准备识别…", progress=4)
    submit(run_transcribe, job.id, job_id=job.id)
    return jobs.view(job.id).model_dump()


@router.patch("/{job_id}/transcript")
def patch_transcript(job_id: str, body: TranscriptPatch):
    get_job(job_id)
    current = jobs.load_transcript(job_id) or Transcript(text="")
    current.text = body.text.strip()
    jobs.save_transcript(job_id, current)
    jobs.set_status(job_id, "transcribed", "原文已更新")
    upsert_job(job_id)
    return jobs.view(job_id).model_dump()


@router.post("/{job_id}/analyze")
def analyze_job(job_id: str, body: AnalyzeRequest | None = None):
    job = get_job(job_id)
    require_idle(job)
    transcript = jobs.load_transcript(job_id)
    if not transcript or not transcript.text.strip():
        raise HTTPException(400, "没有原文")
    options = body or AnalyzeRequest()
    job.rewrite_genre = resolve_genre(options.genre)[0]
    job.rewrite_platform = resolve_platform(options.platform)[0]
    jobs.save_job(job)
    jobs.set_status(job_id, "analyzing", "正在规划口播结构…", progress=18)
    submit(run_analyze, job_id, job_id=job_id)
    return jobs.view(job_id).model_dump()


@router.patch("/{job_id}/script")
def patch_script(job_id: str, body: ScriptPatch):
    get_job(job_id)
    script = jobs.load_script(job_id)
    transcript = jobs.load_transcript(job_id)
    if script:
        data = script.model_dump()
    else:
        source = transcript.text if transcript else ""
        data = script_from_transcript(source).model_dump()
    patch = body.model_dump(exclude_none=True)
    data.update(patch)
    if not body.narration:
        temp = Script.model_validate(data)
        data["narration"] = compose_narration(temp)
    script = Script.model_validate(data)
    if body.keywords is not None:
        script.keyword_engine = "manual"
        script.keywords = [item.strip() for item in body.keywords if item.strip()]
    elif not script.keywords and script.engine != "manual":
        script = fill_keywords(script)
    jobs.save_script(job_id, script)
    jobs.set_status(job_id, "script_ready", "口播稿已更新")
    upsert_job(job_id)
    return jobs.view(job_id).model_dump()


@router.post("/{job_id}/script/from-transcript")
def adopt_transcript_script(job_id: str):
    job = get_job(job_id)
    require_idle(job)
    transcript = jobs.load_transcript(job_id)
    if not transcript or not transcript.text.strip():
        raise HTTPException(400, "没有原文")
    jobs.save_script(job_id, script_from_transcript(transcript.text))
    jobs.set_status(job_id, "script_ready", "已用原文进入口播稿")
    upsert_job(job_id)
    return jobs.view(job_id).model_dump()


@router.post("/{job_id}/keywords")
def refresh_keywords(job_id: str):
    job = get_job(job_id)
    require_idle(job)
    script = jobs.load_script(job_id)
    if not script:
        raise HTTPException(400, "还没有口播稿")
    jobs.save_script(job_id, fill_keywords(script, force=True))
    jobs.set_status(job_id, "script_ready", "重点词已更新")
    upsert_job(job_id)
    return jobs.view(job_id).model_dump()


@router.post("/{job_id}/script/limits")
def scrub_script_limits(job_id: str):
    job = get_job(job_id)
    require_idle(job)
    script = jobs.load_script(job_id)
    if not script:
        raise HTTPException(400, "还没有口播稿")
    from backend.compliance import scrub_limits

    next_script, message = scrub_limits(script, job.rewrite_platform or script.platform)
    jobs.save_script(job_id, next_script)
    jobs.set_status(job_id, "script_ready", message)
    return jobs.view(job_id).model_dump()


@router.post("/{job_id}/look")
def plan_job_look(job_id: str, body: LookPlanRequest | None = None):
    get_job(job_id)
    script = jobs.load_script(job_id)
    if not script:
        raise HTTPException(400, "还没有口播稿")
    from backend.motion import plan_look

    deck = jobs.load_deck(job_id)
    look, source, note = plan_look(script, (body.brief if body else "") or "", deck)
    from backend.deck import apply_look_to_deck

    if deck and deck.beats:
        deck = apply_look_to_deck(deck, look)
        jobs.save_deck(job_id, deck)
    return {"look": look, "deck": deck.model_dump() if deck else None, "source": source, "note": note}


@router.post("/{job_id}/deck")
def plan_job_deck(job_id: str, body: DeckPlanRequest | None = None):
    job = get_job(job_id)
    require_idle(job)
    script = jobs.load_script(job_id)
    if not script:
        raise HTTPException(400, "还没有口播稿")
    from backend.deck import normalize_kind, plan_deck

    kind = normalize_kind((body.kind if body else None) or getattr(job, "deck_kind", "mirror"))
    deck, source = plan_deck(script, kind)
    jobs.save_deck(job_id, deck)
    job.deck_kind = kind  # type: ignore[assignment]
    jobs.save_job(job)
    note = "已用 AI 归纳展示稿。" if source == "llm" else "已按口播稿逐句平移成展示页。"
    return {"deck": deck.model_dump(), "source": source, "note": note}


@router.put("/{job_id}/deck")
def save_job_deck(job_id: str, body: dict):
    get_job(job_id)
    script = jobs.load_script(job_id)
    if not script:
        raise HTTPException(400, "还没有口播稿")
    from backend.deck import normalize_kind, sanitize_deck

    job = jobs.load_job(job_id)
    deck = sanitize_deck(body if isinstance(body, dict) else {}, script, str(body.get("kind") or job.deck_kind))
    jobs.save_deck(job_id, deck)
    job.deck_kind = normalize_kind(deck.kind)  # type: ignore[assignment]
    jobs.save_job(job)
    upsert_job(job_id)
    return {"deck": deck.model_dump()}


@router.post("/{job_id}/deck/style")
def style_job_deck(job_id: str, body: DeckStyleRequest | None = None):
    job = get_job(job_id)
    require_idle(job)
    script = jobs.load_script(job_id)
    if not script:
        raise HTTPException(400, "还没有口播稿")
    from backend.deck import plan_deck, style_deck

    deck = jobs.load_deck(job_id)
    if not deck or not deck.beats:
        deck, _source = plan_deck(script, getattr(job, "deck_kind", "mirror"))
    try:
        deck = style_deck(deck, (body.brief if body else "") or "")
    except Exception as exc:
        raise HTTPException(400, f"样式生成失败：{exc}") from exc
    jobs.save_deck(job_id, deck)
    return {"deck": deck.model_dump(), "note": "已写入统一样式，有覆盖的页会保留。"}



@router.post("/{job_id}/render")
def render_job(job_id: str, body: RenderRequest | None = None):
    job = get_job(job_id)
    require_idle(job)
    if not jobs.load_script(job_id):
        raise HTTPException(400, "还没有口播稿")
    options = body or RenderRequest(
        voice=job.voice,
        orientation=job.orientation,
        theme=job.theme,
        watermark=job.watermark,
        show_watermark=job.show_watermark,
        caption_font=job.caption_font,
        caption_box=job.caption_box,
        caption_size=job.caption_size,
        hide_captions_on_cta=job.hide_captions_on_cta,
        title_font=job.title_font,
        title_box=job.title_box,
        title_size=job.title_size,
        background_id=job.background_id,
        music_id=job.music_id,
        music_volume=job.music_volume,
        produce_mode=job.produce_mode,
        render_preset=normalize_render_preset(job.render_preset),
        theme_motion=getattr(job, "theme_motion", "auto"),
        text_motion=getattr(job, "text_motion", "pop"),
        show_subtitles=bool(getattr(job, "show_subtitles", False)),
        person_mask=getattr(job, "person_mask", "square"),
        mask_x=getattr(job, "mask_x", 0.5),
        mask_y=getattr(job, "mask_y", 0.47),
        mask_w=getattr(job, "mask_w", 0.64),
        mask_h=getattr(job, "mask_h", 0.72),
        mask_zoom=getattr(job, "mask_zoom", 1.0),
        chroma_color=getattr(job, "chroma_color", "#2ecc40"),
        chroma_tolerance=getattr(job, "chroma_tolerance", 0.18),
        motion_pack=getattr(job, "motion_pack", "auto"),
        look_brief=getattr(job, "look_brief", ""),
    )
    apply_produce(job_id, options)
    if options.produce_mode == "teleprompter" and not jobs.find_take(job_id):
        raise HTTPException(400, "还没有提词器录像，请先对着提词器录一段")
    audio_only = bool(options.audio_only)
    jobs.set_status(job_id, "voicing", "正在准备口播声音…" if audio_only else "正在准备成片…", progress=3)
    submit(run_render, job_id, audio_only, job_id=job_id)
    return jobs.view(job_id).model_dump()


@router.get("/{job_id}/final.mp4")
def download_final(job_id: str):
    get_job(job_id)
    path = jobs.job_dir(job_id) / "final.mp4"
    if not path.exists():
        raise HTTPException(404, "还没有成片")
    return FileResponse(path, media_type="video/mp4", filename=f"{job_id}.mp4")


@router.get("/{job_id}/cover.jpg")
def download_cover(job_id: str):
    get_job(job_id)
    try:
        path = ensure_cover(job_id)
    except FileNotFoundError:
        raise HTTPException(404, "还没有主图") from None
    except Exception as exc:
        raise HTTPException(500, explain_error(exc, where="主图失败")) from exc
    return FileResponse(path, media_type="image/jpeg", filename=f"{job_id}-cover.jpg")


@router.get("/{job_id}/voice.mp3")
def download_voice(job_id: str):
    get_job(job_id)
    path = jobs.job_dir(job_id) / "voice.mp3"
    if not path.exists():
        raise HTTPException(404, "还没有配音")
    return FileResponse(path, media_type="audio/mpeg", filename=f"{job_id}.mp3")


@router.get("/{job_id}/take")
def download_take(job_id: str):
    get_job(job_id)
    path = jobs.find_take(job_id)
    if not path:
        raise HTTPException(404, "还没有提词器录像")
    media = "video/mp4" if path.suffix.lower() == ".mp4" else "video/webm"
    return FileResponse(path, media_type=media)


@router.post("/{job_id}/take")
async def upload_take(job_id: str, file: UploadFile = File(...)):
    job = get_job(job_id)
    require_idle(job)
    suffix = Path(file.filename or "take.webm").suffix.lower() or ".webm"
    payload = await file.read()
    if len(payload) < 1000:
        raise HTTPException(400, "录像文件太小，请重新录")
    jobs.save_take(job_id, suffix, payload)
    job.produce_mode = "teleprompter"
    jobs.save_job(job)
    return jobs.view(job_id).model_dump()


@router.post("/{job_id}/review")
def review_job(job_id: str):
    job = get_job(job_id)
    require_idle(job)
    script = jobs.load_script(job_id)
    if not script:
        raise HTTPException(400, "还没有口播稿")
    jobs.save_review(job_id, build_review(script))
    return jobs.view(job_id).model_dump()


@router.get("/{job_id}/pack.txt")
def download_pack(job_id: str):
    get_job(job_id)
    script = jobs.load_script(job_id)
    if not script:
        raise HTTPException(400, "还没有口播稿")
    review = jobs.load_review(job_id)
    if not review:
        review = build_review(script)
        jobs.save_review(job_id, review)
    filename = quote(f"{(script.topic or job_id)[:16]}-文案包.txt")
    return PlainTextResponse(
        pack_text(script, review),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=pack.txt; filename*=UTF-8''{filename}"},
    )
