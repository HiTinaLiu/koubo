from __future__ import annotations

from fastapi import HTTPException

from backend import jobs
from backend.api.dto import RenderRequest
from backend.applog import get_logger
from backend.assets import copy_into_job
from backend.audio import duration_ms, extract_mp3, to_h264_mp4
from backend.chroma import key_talking_head
from backend.cover import write_cover
from backend.errors import explain_error
from backend.keywords import fill_keywords
from backend.library import upsert_job
from backend.llm import analyze_transcript
from backend.motion import attach_motion_clips
from backend.perf import normalize_render_preset
from backend.render import render_video
from backend.services.scripting import compose_narration
from backend.spark_tts import spark_ready, unload_spark
from backend.stt import transcribe_file
from backend.subtitles import build_subtitles
from backend.themes import resolve_theme
from backend.timeline import build_timeline
from backend.tts import synthesize
from backend.voice_lib import is_known_voice, resolve_voice

log = get_logger("pipeline")


def run_transcribe(job_id: str) -> None:
    try:
        jobs.set_status(job_id, "transcribing", "正在识别口播…", progress=8)
        directory = jobs.job_dir(job_id)
        raw = next((p for p in directory.glob("raw.*") if p.is_file()), None)
        if not raw:
            raise RuntimeError("没有找到录音文件")
        transcript = transcribe_file(
            raw,
            directory / "input.wav",
            need_words=False,
            on_progress=lambda message, progress: jobs.set_status(
                job_id, "transcribing", message, progress=progress
            ),
        )
        jobs.save_transcript(job_id, transcript)
        upsert_job(job_id)
        jobs.set_status(job_id, "transcribed", "识别完成，请确认原文")
        log.info("识别完成 job=%s", job_id)
    except Exception as exc:
        log.exception("识别失败 job=%s", job_id)
        jobs.set_status(job_id, "failed", "识别失败", str(exc))


def run_analyze(job_id: str) -> None:
    try:
        job = jobs.load_job(job_id)
        jobs.set_status(job_id, "analyzing", "正在规划口播结构…", progress=22)
        transcript = jobs.load_transcript(job_id)
        if not transcript or not transcript.text.strip():
            raise RuntimeError("没有原文")
        script = analyze_transcript(
            transcript.text,
            genre=job.rewrite_genre,
            platform=job.rewrite_platform,
            on_progress=lambda message, progress: jobs.set_status(
                job_id, "analyzing", message, progress=progress
            ),
        )
        jobs.save_script(job_id, script)
        upsert_job(job_id)
        jobs.set_status(job_id, "script_ready", "口播稿已生成，请确认后成片")
        log.info("改稿完成 job=%s", job_id)
    except Exception as exc:
        log.exception("改稿失败 job=%s", job_id)
        jobs.set_status(job_id, "failed", "改稿失败", str(exc))


def apply_produce(job_id: str, body: RenderRequest):
    job = jobs.load_job(job_id)
    mode = "teleprompter" if body.produce_mode == "teleprompter" else "tts"
    voice = body.voice or job.voice
    if mode == "tts" and not is_known_voice(voice):
        raise HTTPException(400, "不支持的音色")
    if is_known_voice(voice):
        job.voice = voice
    job.produce_mode = mode  # type: ignore[assignment]
    job.orientation = body.orientation
    job.theme = resolve_theme(body.theme)  # type: ignore[assignment]
    job.watermark = body.watermark.strip() or "口播场记"
    job.show_watermark = body.show_watermark
    job.caption_font = body.caption_font
    job.caption_box = body.caption_box
    job.caption_size = body.caption_size
    job.hide_captions_on_cta = body.hide_captions_on_cta
    job.title_font = body.title_font
    job.title_box = body.title_box
    job.title_size = body.title_size
    job.background_id = (body.background_id or "").strip() or None
    job.music_id = (body.music_id or "").strip() or None
    job.music_volume = max(0.0, min(float(body.music_volume or 0), 0.5))
    job.render_preset = normalize_render_preset(body.render_preset)
    job.theme_motion = body.theme_motion  # type: ignore[assignment]
    job.text_motion = body.text_motion  # type: ignore[assignment]
    job.show_subtitles = bool(body.show_subtitles)
    job.person_mask = (
        "square"
        if body.person_mask == "off"
        else body.person_mask
        if body.person_mask in {"theme", "cutout", "square", "chroma"}
        else "square"
    )  # type: ignore[assignment]
    job.mask_x = max(0.0, min(1.0, float(getattr(body, "mask_x", 0.5) or 0.5)))
    job.mask_y = max(0.0, min(1.0, float(getattr(body, "mask_y", 0.47) or 0.47)))
    job.mask_w = max(0.12, min(1.0, float(getattr(body, "mask_w", 0.64) or 0.64)))
    job.mask_h = max(0.12, min(1.0, float(getattr(body, "mask_h", 0.72) or 0.72)))
    job.mask_zoom = max(0.4, min(3.0, float(getattr(body, "mask_zoom", 1.0) or 1.0)))
    job.chroma_color = (getattr(body, "chroma_color", None) or "#2ecc40").strip() or "#2ecc40"
    job.chroma_tolerance = max(0.06, min(0.42, float(getattr(body, "chroma_tolerance", 0.18) or 0.18)))
    pack = getattr(body, "motion_pack", "auto")
    job.motion_pack = pack if pack in {"auto", "custom", "knowledge", "news", "life", "tech", "education", "business"} else "auto"  # type: ignore[assignment]
    job.look_brief = str(getattr(body, "look_brief", "") or "").strip()[:400]
    from backend.fx import ENTER_FX, EXIT_FX, KEYWORD_FX, as_effect, sanitize_tokens
    from backend.look import TOKEN_PRESETS

    job.theme_tokens = sanitize_tokens(getattr(body, "theme_tokens", None), TOKEN_PRESETS.get(job.theme))
    job.title_enter = as_effect(getattr(body, "title_enter", None), ENTER_FX, "scale_in")
    job.title_exit = as_effect(getattr(body, "title_exit", None), EXIT_FX, "fade_out")
    raw_steps = getattr(body, "step_enters", None)
    if isinstance(raw_steps, list) and raw_steps:
        job.step_enters = [as_effect(item, ENTER_FX, "spring_pop") for item in raw_steps[:8]]
    else:
        job.step_enters = [as_effect(getattr(body, "title_enter", None), ENTER_FX, "spring_pop")]
    job.step_exit = as_effect(getattr(body, "step_exit", None), EXIT_FX, "fade_out")
    job.keyword_fx = as_effect(getattr(body, "keyword_fx", None), KEYWORD_FX, "keyword_pop")
    from backend.deck import normalize_kind

    job.cta_enter = as_effect(getattr(body, "cta_enter", None), ENTER_FX, "slide_up")
    job.deck_kind = normalize_kind(getattr(body, "deck_kind", None) or getattr(job, "deck_kind", "mirror"))  # type: ignore[assignment]

    def _pct(raw: object, fallback: float) -> float:
        try:
            return max(8.0, min(92.0, float(raw)))
        except (TypeError, ValueError):
            return fallback

    job.title_x = _pct(getattr(body, "title_x", None), float(getattr(job, "title_x", 50) or 50))
    job.title_y = _pct(getattr(body, "title_y", None), float(getattr(job, "title_y", 24) or 24))
    job.card_x = _pct(getattr(body, "card_x", None), float(getattr(job, "card_x", 50) or 50))
    job.card_y = _pct(getattr(body, "card_y", None), float(getattr(job, "card_y", 72) or 72))
    jobs.save_job(job)
    return job


def run_render(job_id: str, audio_only: bool = False) -> None:
    try:
        job = jobs.load_job(job_id)
        script = jobs.load_script(job_id)
        if not script:
            raise RuntimeError("没有口播稿")
        jobs.set_status(job_id, "voicing", "正在准备口播声音…" if audio_only else "正在准备朗读稿…", progress=5)
        narration = compose_narration(script)
        script.narration = narration
        if not script.keywords and script.engine != "manual":
            jobs.set_status(job_id, "voicing", "正在生成字幕重点词…", progress=8)
            fill_keywords(script)
        jobs.save_script(job_id, script)
        upsert_job(job_id)

        talking_head = None
        voice_path = jobs.job_dir(job_id) / "voice.mp3"
        if job.produce_mode == "teleprompter":
            take = jobs.find_take(job_id)
            if not take:
                raise RuntimeError("还没有提词器录像，请先对着提词器录一段")
            if audio_only:
                jobs.set_status(job_id, "voicing", "正在从重录提取口播声音…", progress=40)
                extract_mp3(take, voice_path)
                jobs.set_status(job_id, "script_ready", "口播声音已导出", progress=100)
                log.info("口播声音已导出 job=%s mode=teleprompter", job_id)
                return
            jobs.set_status(job_id, "voicing", "正在整理重录音画…", progress=12)
            talk_path = jobs.job_dir(job_id) / "talk.mp4"
            person_mask = getattr(job, "person_mask", "square")
            if person_mask == "off":
                person_mask = "square"
            hide_person = person_mask == "theme"
            if hide_person:
                jobs.set_status(job_id, "voicing", "正在提取重录声音…", progress=28)
                extract_mp3(take, voice_path)
                jobs.set_status(job_id, "voicing", "正在按重录口播对齐步骤卡…", progress=40)
                try:
                    spoken = transcribe_file(take, jobs.job_dir(job_id) / "take.wav")
                    words, duration = spoken.words, max(spoken.duration_ms, duration_ms(voice_path))
                except Exception:
                    log.exception("重录转写失败，改按时长均分 job=%s", job_id)
                    words, duration = [], duration_ms(voice_path)
                talking_head = None
            else:
                to_h264_mp4(take, talk_path)
                jobs.set_status(job_id, "voicing", "正在提取重录声音…", progress=28)
                extract_mp3(take, voice_path)
                jobs.set_status(job_id, "voicing", "正在按重录口播对齐步骤卡…", progress=40)
                try:
                    spoken = transcribe_file(take, jobs.job_dir(job_id) / "take.wav")
                    words, duration = spoken.words, max(spoken.duration_ms, duration_ms(voice_path))
                except Exception:
                    log.exception("重录转写失败，改按时长均分 job=%s", job_id)
                    words, duration = [], duration_ms(voice_path)
                talking_head = "talk.mp4"
                if person_mask == "chroma":
                    jobs.set_status(job_id, "voicing", "正在按画面边缘抠纯色背景…", progress=50)

                    def on_key(frame: int) -> None:
                        jobs.set_status(job_id, "voicing", f"正在按轮廓抠像，已处理 {frame} 帧…", progress=min(62, 50 + frame // 40))

                    try:
                        keyed = key_talking_head(
                            talk_path,
                            jobs.job_dir(job_id),
                            float(getattr(job, "chroma_tolerance", 0.18) or 0.18),
                            on_key,
                        )
                        talking_head = keyed.name
                    except Exception:
                        log.exception("纯色轮廓抠像失败，改用原录像 job=%s", job_id)
                duration = duration_ms(talk_path)
            # 「不用人像」只去掉摄像头画面，背景/配乐仍跟 04 展示稿一致
            background, background_kind, music = copy_into_job(
                job_id,
                job.background_id,
                job.music_id,
            )
        else:
            try:
                profile = resolve_voice(job.voice)
            except KeyError:
                profile = {"engine": "edge"}
            if profile.get("engine") == "spark" and not spark_ready().get("loaded"):
                jobs.set_status(
                    job_id,
                    "voicing",
                    "正在加载克隆模型，准备口播声音…" if audio_only else "正在加载克隆模型，首次会较慢…",
                    progress=10,
                )

            def on_progress(done: int, total: int) -> None:
                pct = 12 + int(48 * done / max(total, 1))
                label = "口播声音" if audio_only else "配音"
                if done <= 0:
                    jobs.set_status(job_id, "voicing", f"开始合成{label}，共 {total} 段…", progress=12)
                else:
                    jobs.set_status(job_id, "voicing", f"正在合成{label} {done}/{total} 段…", progress=pct)

            words, duration = synthesize(narration, job.voice, voice_path, on_progress=on_progress)
            if audio_only:
                unload_spark()
                jobs.set_status(job_id, "script_ready", "口播声音已导出", progress=100)
                log.info("口播声音已导出 job=%s mode=tts", job_id)
                return
            background, background_kind, music = copy_into_job(job_id, job.background_id, job.music_id)

        bg_duration = None
        if background and background_kind == "video":
            bg_path = jobs.job_dir(job_id) / background
            if bg_path.exists():
                bg_duration = duration_ms(bg_path)

        jobs.set_status(job_id, "voicing", "正在整理成片时间轴…", progress=64)
        timeline = build_timeline(
            script,
            words,
            duration,
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
            background=background,
            background_kind=background_kind,
            music=music,
            music_volume=job.music_volume,
            talking_head=talking_head,
            background_duration_ms=bg_duration,
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
            subtitles=build_subtitles(narration, words, duration) if bool(getattr(job, "show_subtitles", False)) else [],
        )
        timeline.theme_tokens = dict(getattr(job, "theme_tokens", None) or {})
        timeline.title_enter = getattr(job, "title_enter", "scale_in")
        timeline.title_exit = getattr(job, "title_exit", "fade_out")
        timeline.step_enters = list(getattr(job, "step_enters", None) or ["spring_pop"])
        timeline.step_exit = getattr(job, "step_exit", "fade_out")
        timeline.keyword_fx = getattr(job, "keyword_fx", "keyword_pop")
        timeline.cta_enter = getattr(job, "cta_enter", "slide_up")
        timeline.title_x = float(getattr(job, "title_x", 50) or 50)
        timeline.title_y = float(getattr(job, "title_y", 24) or 24)
        timeline.card_x = float(getattr(job, "card_x", 50) or 50)
        timeline.card_y = float(getattr(job, "card_y", 72) or 72)
        user_subs = bool(getattr(job, "show_subtitles", False))
        timeline.show_subtitles = user_subs
        from backend.deck import plan_deck

        deck = jobs.load_deck(job_id)
        if not deck or not deck.beats:
            jobs.set_status(job_id, "voicing", "正在整理展示稿…", progress=64)
            deck, _source = plan_deck(script, getattr(job, "deck_kind", "mirror"))
            jobs.save_deck(job_id, deck)
        from backend.assets import copy_page_backgrounds

        page_ids = [str(getattr(beat, "background_id", "") or "") for beat in deck.beats]
        skip = {(job.background_id or "").strip(), "", "__theme__"}
        timeline.page_bgs = copy_page_backgrounds(job_id, [item for item in page_ids if item not in skip])
        timeline.background_asset_id = (job.background_id or "").strip()
        timeline.deck = deck
        # 成片展示卡样式以 04 展示稿为准
        style = getattr(deck, "style", None)
        if style:
            if getattr(style, "font", None):
                timeline.caption_font = style.font  # type: ignore[assignment]
            if getattr(style, "box", None):
                timeline.caption_box = style.box  # type: ignore[assignment]
            if getattr(style, "size", None):
                timeline.caption_size = style.size  # type: ignore[assignment]
            if getattr(style, "enter", None):
                timeline.step_enters = [style.enter]
            if getattr(style, "exit", None):
                timeline.step_exit = style.exit
        jobs.set_status(job_id, "voicing", "正在编排成片效果…", progress=65)
        attach_motion_clips(
            timeline,
            script,
            words,
            getattr(job, "motion_pack", "auto"),
            getattr(job, "look_brief", ""),
        )
        timeline.show_subtitles = user_subs
        job.theme = timeline.theme  # type: ignore[assignment]
        job.theme_motion = timeline.theme_motion  # type: ignore[assignment]
        job.text_motion = timeline.text_motion  # type: ignore[assignment]
        job.title_font = timeline.title_font  # type: ignore[assignment]
        job.title_box = timeline.title_box  # type: ignore[assignment]
        job.title_size = timeline.title_size  # type: ignore[assignment]
        job.caption_font = timeline.caption_font  # type: ignore[assignment]
        job.caption_box = timeline.caption_box  # type: ignore[assignment]
        job.caption_size = timeline.caption_size  # type: ignore[assignment]
        job.hide_captions_on_cta = bool(timeline.hide_captions_on_cta)
        job.theme_tokens = dict(getattr(timeline, "theme_tokens", None) or {})
        job.title_enter = getattr(timeline, "title_enter", job.title_enter)
        job.title_exit = getattr(timeline, "title_exit", job.title_exit)
        job.step_enters = list(getattr(timeline, "step_enters", None) or job.step_enters)
        job.step_exit = getattr(timeline, "step_exit", job.step_exit)
        job.keyword_fx = getattr(timeline, "keyword_fx", job.keyword_fx)
        job.cta_enter = getattr(timeline, "cta_enter", job.cta_enter)
        jobs.save_job(job)
        preset = normalize_render_preset(job.render_preset)
        if preset == "fast":
            timeline.fps = 24
        jobs.save_timeline(job_id, timeline)
        if unload_spark():
            jobs.set_status(job_id, "voicing", "正在释放克隆模型，给成片腾内存…", progress=66)
        jobs.set_status(
            job_id,
            "rendering",
            "正在快速渲染成片…" if preset == "fast" else "正在渲染成片…",
            progress=68,
        )

        def on_render(done: int, total: int, _line: str) -> None:
            pct = 68 + int(28 * done / max(total, 1))
            jobs.set_status(job_id, "rendering", f"正在渲染成片 {done}/{total} 帧…", progress=pct)

        rendered = render_video(job_id, timeline, on_progress=on_render, preset=preset)
        try:
            jobs.set_status(job_id, "rendering", "正在生成主图…", progress=96)
            write_cover(
                rendered,
                jobs.job_dir(job_id) / "cover.jpg",
                timeline.duration_ms,
                timeline.title_end_ms,
            )
            jobs.set_status(job_id, "done", "成片和主图已导出", progress=100)
        except Exception:
            log.exception("主图生成失败 job=%s", job_id)
            jobs.set_status(job_id, "done", "成片已导出，主图未生成", progress=100)
        log.info("成片完成 job=%s audio_only=%s", job_id, audio_only)
    except Exception as exc:
        unload_spark()
        log.exception("%s失败 job=%s", "声音" if audio_only else "成片", job_id)
        jobs.set_status(
            job_id,
            "failed",
            "成片失败" if not audio_only else "声音失败",
            explain_error(exc, where="成片失败" if not audio_only else "配音失败"),
        )
