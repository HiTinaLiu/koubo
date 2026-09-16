from __future__ import annotations

import re
from typing import Any

from backend.applog import get_logger
from backend.deck import beat_window, resolve_style
from backend.fx import CLIP_TYPES, ENTER_FX, sanitize_params
from backend.llm import _extract_json
from backend.look import BUILTIN_IDS, LOOK_PACKS, apply_look, match_brief, sanitize_look
from backend.schemas import MotionClip, Script, Timeline, WordStamp
from backend.settings_store import llm_ready, open_llm, prompt_text
from backend.themes import THEMES

log = get_logger("motion")

AUTO_THEME = {
    "slate": "pulse",
    "education": "drift",
    "tech": "scan",
    "life": "drift",
    "business": "pulse",
    "news": "scan",
}


def theme_accent(timeline: Timeline) -> str:
    tokens = getattr(timeline, "theme_tokens", None) or {}
    if tokens.get("accent"):
        return str(tokens["accent"])
    for item in THEMES:
        if item["id"] == timeline.theme:
            return str(item["accent"])
    return "#ffcc33"


def _letters(text: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fff]+", "", text or "")


def _theme_kind(timeline: Timeline) -> str:
    motion = timeline.theme_motion if timeline.theme_motion != "auto" else AUTO_THEME.get(timeline.theme, "pulse")
    return motion if motion in {"pulse", "drift", "scan"} else "none"


def _locate(words: list[WordStamp], phrase: str) -> tuple[int, int] | None:
    needle = _letters(phrase)
    if not needle:
        return None
    chars: list[tuple[str, int, int]] = []
    for word in words:
        token = _letters(word.text)
        for ch in token:
            chars.append((ch, word.start_ms, word.end_ms))
    blob = "".join(item[0] for item in chars)
    start = blob.find(needle)
    if start < 0:
        return None
    end = start + len(needle) - 1
    return chars[start][1], chars[end][2]


def _clip(
    cid: str,
    kind: str,
    content: str,
    start: float,
    duration: float,
    params: dict | None = None,
) -> MotionClip:
    return MotionClip(
        id=cid,
        type=kind,
        content=content or "",
        start=round(max(0.0, start), 3),
        duration=round(max(0.24, duration), 3),
        params=params or {},
    )


def _deck_clips(script: Script, words: list[WordStamp], timeline: Timeline, deck) -> list[MotionClip]:
    duration_s = max(timeline.duration_ms / 1000, 3)
    types = {
        "points": "deck_ppt",
        "steps": "deck_ppt",
        "ppt": "deck_ppt",
        "stats": "deck_stats",
        "chart": "deck_line",
        "line_chart": "deck_line",
        "timeline": "deck_timeline",
        "timeline_chart": "deck_timeline",
        "compare": "deck_compare",
        "quote": "deck_quote",
    }
    clips: list[MotionClip] = []
    beats = list(getattr(deck, "beats", None) or [])
    for index, beat in enumerate(beats):
        start_ms, end_ms = beat_window(script, words, timeline.duration_ms, list(beat.lines or []))
        start = max(start_ms, timeline.title_end_ms or 0) / 1000
        end = end_ms / 1000
        if timeline.hide_captions_on_cta:
            end = min(end, duration_s - 3.2)
        if end - start < 0.4:
            end = min(duration_s, start + 1.2)
        kind = types.get(str(getattr(beat, "kind", "points")), "deck_ppt")
        look = resolve_style(deck, beat)
        page_id = str(getattr(beat, "background_id", "") or "").strip()
        global_id = str(getattr(timeline, "background_asset_id", "") or "").strip()
        page_bgs = getattr(timeline, "page_bgs", None) or {}
        extra: dict[str, Any] = {}
        if page_id == "__theme__":
            extra = {"pageBg": "__theme__"}
        elif page_id and page_id != global_id:
            info = page_bgs.get(page_id) if isinstance(page_bgs, dict) else None
            if isinstance(info, dict) and info.get("file"):
                extra = {
                    "pageBg": str(info["file"]),
                    "pageBgKind": str(info.get("kind") or "image"),
                    "pageBgDurationMs": int(info["duration_ms"] or 0) if info.get("duration_ms") else 0,
                }
        clips.append(
            _clip(
                str(beat.id or f"beat_{index + 1:02d}"),
                kind,
                beat.title,
                start,
                end - start,
                {
                    "index": index + 1,
                    "total": len(beats),
                    "kind": beat.kind,
                    "title": beat.title,
                    "points": list(beat.points or []),
                    "stats": list(beat.stats or []),
                    "left": getattr(beat, "left", "") or "",
                    "right": getattr(beat, "right", "") or "",
                    "series": [item.model_dump() if hasattr(item, "model_dump") else item for item in (beat.series or [])],
                    "events": [item.model_dump() if hasattr(item, "model_dump") else item for item in (beat.events or [])],
                    "lines": list(beat.lines or []),
                    "enter": look.enter,
                    "exit": look.exit,
                    "reveal": look.reveal,
                    "font": look.font,
                    "box": look.box,
                    "size": look.size,
                    "cardX": float(getattr(timeline, "card_x", 50) or 50),
                    "cardY": float(getattr(timeline, "card_y", 72) or 72),
                    **extra,
                },
            )
        )
    return clips


def heuristic_clips(script: Script, words: list[WordStamp], timeline: Timeline, pack: str) -> list[MotionClip]:
    duration_s = max(timeline.duration_ms / 1000, 3)
    accent = theme_accent(timeline)
    title_enter = getattr(timeline, "title_enter", "scale_in") or "scale_in"
    title_exit = getattr(timeline, "title_exit", "fade_out") or "fade_out"
    step_enters = [item for item in (getattr(timeline, "step_enters", None) or []) if item in ENTER_FX] or ["spring_pop"]
    step_exit = getattr(timeline, "step_exit", "fade_out") or "fade_out"
    keyword_fx = getattr(timeline, "keyword_fx", "keyword_pop") or "keyword_pop"
    cta_enter = getattr(timeline, "cta_enter", "slide_up") or "slide_up"
    clips: list[MotionClip] = []
    kind = _theme_kind(timeline)
    if kind in {"pulse", "drift", "scan"}:
        clips.append(_clip("theme_01", f"theme_{kind}", "", 0, duration_s))
    title_s = max(0.8, (timeline.title_end_ms or 0) / 1000)
    if (script.topic or "").strip() and title_s > 0.4:
        clips.append(
            _clip(
                "title_01",
                "title_in",
                script.topic.strip(),
                0,
                title_s,
                {"enter": title_enter, "exit": title_exit},
            )
        )
    deck = getattr(timeline, "deck", None)
    if deck and getattr(deck, "beats", None):
        clips.extend(_deck_clips(script, words, timeline, deck))
    else:
        for slide in timeline.slides or []:
            start = max(slide.start_ms, timeline.title_end_ms or 0) / 1000
            end = slide.end_ms / 1000
            if timeline.hide_captions_on_cta:
                end = min(end, duration_s - 3.2)
            if end - start < 0.35:
                continue
            enter = step_enters[(max(slide.index, 1) - 1) % len(step_enters)]
            clips.append(
                _clip(
                    f"step_{slide.index:02d}",
                    "step_card",
                    slide.title,
                    start,
                    end - start,
                    {
                        "index": slide.index,
                        "total": slide.total,
                        "highlights": list(slide.highlights or []),
                        "enter": enter,
                        "exit": step_exit,
                        "motion": enter,
                    },
                )
            )
    last_kw = -1.0
    for index, word in enumerate(script.keywords or []):
        found = _locate(words, word)
        if not found:
            continue
        start = found[0] / 1000
        if start - last_kw < 0.38:
            continue
        last_kw = start
        slot = index % 5
        clips.append(
            _clip(
                f"keyword_{index + 1:02d}",
                keyword_fx if keyword_fx in {"keyword_pop", "keyword_pulse"} else "keyword_pop",
                word,
                start,
                0.8,
                {
                    "enter": keyword_fx,
                    "scaleFrom": 0.6,
                    "scaleTo": 1.15,
                    "settleScale": 1,
                    "color": accent,
                    "x": 18 + (slot * 14) % 52,
                    "y": 28 + (slot % 3) * 10,
                },
            )
        )
    cta = (script.cta or "").strip()
    if cta:
        clips.append(
            _clip("cta_01", "cta_in", cta, max(0.0, duration_s - 3.2), 3.2, {"enter": cta_enter, "exit": "fade_out"})
        )
    if timeline.show_subtitles:
        for index, cue in enumerate(timeline.subtitles or []):
            start = cue.start_ms / 1000
            dur = max(0.3, (cue.end_ms - cue.start_ms) / 1000)
            clips.append(
                _clip(
                    f"sub_{index + 1:02d}",
                    "subtitle",
                    cue.text,
                    start,
                    dur,
                    {"enter": "karaoke" if pack == "news" else "fade_in"},
                )
            )
    return clips


def _sanitize(raw: list, duration_s: float, timeline: Timeline) -> list[MotionClip]:
    clips: list[MotionClip] = []
    seen: set[str] = set()
    title_enter = getattr(timeline, "title_enter", "scale_in")
    step_exit = getattr(timeline, "step_exit", "fade_out")
    for index, item in enumerate(raw or []):
        if not isinstance(item, dict):
            continue
        kind = str(item.get("type") or "").strip()
        if kind not in CLIP_TYPES:
            continue
        cid = str(item.get("id") or f"{kind}_{index + 1:02d}").strip()[:40]
        if cid in seen:
            cid = f"{cid}_{index + 1}"
        seen.add(cid)
        start = float(item.get("start") or 0)
        duration = float(item.get("duration") or 0.8)
        if start >= duration_s:
            continue
        duration = min(duration, duration_s - start + 0.05)
        raw_params = item.get("params") if isinstance(item.get("params"), dict) else {}
        params = sanitize_params(kind, raw_params, title_enter, step_exit)
        clips.append(_clip(cid, kind, str(item.get("content") or ""), start, duration, params))
    return clips


def llm_decide_look(
    script: Script,
    timeline: Timeline,
    base: list[MotionClip],
    brief: str,
) -> tuple[dict | None, list[MotionClip] | None]:
    if not llm_ready():
        return None, None
    duration_s = max(timeline.duration_ms / 1000, 3)
    payload = [item.model_dump() for item in base]
    client, model = open_llm()
    response = client.chat.completions.create(
        model=model,
        temperature=0.45,
        messages=[
            {"role": "system", "content": prompt_text("motion")},
            {
                "role": "user",
                "content": (
                    f"用户想要的效果：{brief.strip() or '按口播类型自行决定'}\n"
                    f"主题：{script.topic}\n口播类型：{script.genre or ''}\n"
                    f"是否叠加口播字幕：{'是' if timeline.show_subtitles else '否'}\n"
                    f"口播稿：{script.narration[:1200]}\n"
                    f"成片时长秒：{duration_s:.2f}\n"
                    f"参考 clips（时间已对齐口播，步骤可各自不同 enter）：\n{payload}"
                ),
            },
        ],
    )
    data = _extract_json(response.choices[0].message.content or "")
    if not isinstance(data, dict):
        return None, None
    look = sanitize_look(data.get("look")) if isinstance(data.get("look"), dict) else None
    clips = _sanitize(data.get("clips"), duration_s, timeline)
    if len(clips) < 2:
        clips = None
    return look, clips


def llm_plan_look_only(script: Script, brief: str, deck: Any | None = None) -> dict | None:
    if not llm_ready():
        return None
    pages = ""
    beats = getattr(deck, "beats", None) if deck is not None else None
    if beats:
        pages = (
            "当前展示页（必须按 kind 写揭示；图表/时间轴用 overrides.reveal=draw）：\n"
            + str([{"id": b.id, "kind": b.kind, "title": b.title} for b in beats[:16]])
            + "\n"
        )
    client, model = open_llm()
    response = client.chat.completions.create(
        model=model,
        temperature=0.45,
        messages=[
            {"role": "system", "content": prompt_text("motion")},
            {
                "role": "user",
                "content": (
                    "这次只要 look，clips 输出空数组 []。\n"
                    "look.deck_style 必须含 font/box/size/enter/exit/reveal。图表页用 deck_overrides 写 reveal=draw。\n"
                    f"{pages}"
                    f"用户想要的效果：{brief.strip() or '按口播类型自行决定'}\n"
                    f"主题：{script.topic}\n口播类型：{script.genre or ''}\n"
                    f"口播稿：{(script.narration or '')[:1200]}"
                ),
            },
        ],
    )
    data = _extract_json(response.choices[0].message.content or "")
    if not isinstance(data, dict) or not isinstance(data.get("look"), dict):
        return None
    return sanitize_look(data.get("look"))


def plan_look(script: Script, brief: str, deck: Any | None = None) -> tuple[dict, str, str]:
    guessed = match_brief(brief, script.genre or "")
    if not llm_ready():
        return guessed, "pack", "未配置大模型，已套最接近的常见搭配（含展示卡样式和揭示）。生成成片时会用这套。"
    try:
        look = llm_plan_look_only(script, brief, deck)
        if look:
            return look, "llm", "已生成效果方案：主题色、动效和展示卡揭示方式已写入。生成成片时会用这套配置。"
    except Exception:
        log.exception("预生成成片效果失败")
    return guessed, "pack", "AI 这次没给出可用方案，已套最接近的常见搭配。生成成片时会用这套。"


def _ensure_subs(timeline: Timeline, script: Script, words: list[WordStamp]) -> None:
    if timeline.show_subtitles and not timeline.subtitles:
        from backend.subtitles import build_subtitles

        timeline.subtitles = build_subtitles(script.narration, words, timeline.duration_ms)


def attach_motion_clips(
    timeline: Timeline,
    script: Script,
    words: list[WordStamp],
    pack: str,
    brief: str = "",
) -> Timeline:
    allowed = {"auto", "custom", *BUILTIN_IDS}
    pack = pack if pack in allowed else "auto"
    source = "pack"
    llm_clips: list[MotionClip] | None = None
    kept = dict(getattr(timeline, "theme_tokens", None) or {})
    # custom：沿用 04 展示稿已定好的效果，不再重新套包或让 AI 改样式
    if pack == "custom":
        source = "custom"
    elif pack in BUILTIN_IDS:
        apply_look(timeline, LOOK_PACKS[pack])
    else:
        apply_look(timeline, match_brief(brief, script.genre or ""))
        _ensure_subs(timeline, script, words)
        base = heuristic_clips(script, words, timeline, pack)
        try:
            look, refined = llm_decide_look(script, timeline, base, brief)
            if look:
                apply_look(timeline, look)
                source = "llm"
            llm_clips = refined
        except Exception:
            log.exception("AI 成片效果失败，改用固定搭配")
            source = "pack"
    if kept.get("bg") and kept.get("accent"):
        timeline.theme_tokens = kept
    _ensure_subs(timeline, script, words)
    built = heuristic_clips(script, words, timeline, pack)
    clips = llm_clips if llm_clips else built
    if getattr(timeline, "deck", None) and getattr(timeline.deck, "beats", None):
        rest = [item for item in clips if not str(item.type).startswith("deck_") and item.type != "step_card"]
        clips = rest + _deck_clips(script, words, timeline, timeline.deck)
        clips.sort(key=lambda item: item.start)
    if llm_clips and _theme_kind(timeline) != "none" and not any(item.type.startswith("theme_") for item in clips):
        theme = next((item for item in built if item.type.startswith("theme_")), None)
        if theme:
            clips.insert(0, theme)
    timeline.clips = clips
    timeline.motion_pack = pack  # type: ignore[assignment]
    timeline.motion_source = source
    return timeline
