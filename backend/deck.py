from __future__ import annotations

import re
from typing import Any

from backend.fx import ENTER_FX, EXIT_FX, as_effect
from backend.llm import _extract_json
from backend.schemas import ChartSeries, DeckBeat, DeckEvent, DeckStyle, DeckStylePatch, Script, VisualDeck, WordStamp
from backend.settings_store import llm_ready, open_llm, prompt_text

DECK_KINDS = {
    "mirror": "逐句对照",
    "points": "要点卡",
    "steps": "步骤条",
    "stats": "数据卡",
    "compare": "对比卡",
    "quote": "金句条",
    "chart": "趋势图",
    "timeline": "时间轴",
    "auto": "AI 混排",
}

LEGACY_KIND = {
    "ppt_summary": "points",
    "data_analysis": "chart",
    "method_steps": "steps",
    "comparison": "compare",
    "timeline_story": "timeline",
    "mixed": "auto",
}

BEAT_KINDS = {"points", "steps", "stats", "compare", "quote", "chart", "timeline"}
LEGACY_BEAT = {"ppt": "points", "line_chart": "chart", "timeline_chart": "timeline"}
REVEAL = {"stagger", "draw", "count", "fade"}
FONTS = {"sans", "serif", "xiaowei", "huangyou", "kuaile", "mashan"}
BOXES = {"theme", "card", "bar", "chalk", "outline", "plain"}
SIZES = {"sm", "md", "lg"}


def normalize_kind(kind: str | None) -> str:
    raw = str(kind or "mirror").strip()
    raw = LEGACY_KIND.get(raw, raw)
    return raw if raw in DECK_KINDS else "mirror"


def normalize_beat_kind(kind: str | None) -> str:
    raw = LEGACY_BEAT.get(str(kind or "points").strip(), str(kind or "points").strip())
    return raw if raw in BEAT_KINDS else "points"


def _page_bg_id(raw: Any) -> str:
    value = str(raw or "").strip()
    if value == "__theme__":
        return value
    return value[:64] if value else ""


def default_reveal(kind: str, fallback: str = "stagger") -> str:
    pack = normalize_beat_kind(kind)
    if pack in {"chart", "timeline"}:
        return "draw"
    if pack == "stats":
        return "count"
    if pack in {"quote", "compare"}:
        return "fade"
    return fallback if fallback in REVEAL else "stagger"


def spoken_units(script: Script) -> list[str]:
    units: list[str] = []
    hook = (script.hook or "").strip()
    if hook:
        units.append(hook)
    for line in script.body or []:
        text = str(line).strip()
        if text:
            units.append(text)
    cta = (script.cta or "").strip()
    if cta:
        units.append(cta)
    return units or [((script.narration or script.topic or "要点").strip())]


def _letters(text: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fff]+", "", text or "")


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
    if start < 0 and len(needle) >= 8:
        start = blob.find(needle[:8])
    if start < 0:
        return None
    end = min(len(chars) - 1, start + max(len(needle) - 1, 0))
    return chars[start][1], chars[end][2]


def _nums(text: str) -> list[float]:
    found: list[float] = []
    for raw in re.findall(r"-?\d+(?:\.\d+)?", text or ""):
        try:
            found.append(float(raw))
        except ValueError:
            continue
    return found[:12]


def _as_lines(raw: Any, total: int) -> list[int]:
    values: list[int] = []
    if isinstance(raw, list):
        for item in raw:
            try:
                index = int(item)
            except (TypeError, ValueError):
                continue
            if 0 <= index < total and index not in values:
                values.append(index)
    return values


def _series(raw: Any) -> list[ChartSeries]:
    out: list[ChartSeries] = []
    if not isinstance(raw, list):
        return out
    for item in raw[:4]:
        if not isinstance(item, dict):
            continue
        ys: list[float] = []
        for value in item.get("values") or []:
            try:
                ys.append(float(value))
            except (TypeError, ValueError):
                continue
        labels = [str(label)[:12] for label in (item.get("labels") or [])][: len(ys)]
        if not ys:
            continue
        if len(labels) < len(ys):
            labels = labels + [str(i + 1) for i in range(len(labels), len(ys))]
        out.append(ChartSeries(label=str(item.get("label") or "数据")[:16], values=ys[:12], labels=labels[:12]))
    return out


def _events(raw: Any) -> list[DeckEvent]:
    out: list[DeckEvent] = []
    if not isinstance(raw, list):
        return out
    for index, item in enumerate(raw[:8]):
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()[:18]
        if not label:
            continue
        try:
            at = float(item.get("at") if item.get("at") is not None else (index / max(len(raw) - 1, 1)))
        except (TypeError, ValueError):
            at = index / max(len(raw) - 1, 1)
        y = None
        try:
            if item.get("y") is not None:
                y = float(item["y"])
        except (TypeError, ValueError):
            y = None
        out.append(DeckEvent(label=label, at=max(0.0, min(1.0, at)), y=y))
    return out


def sanitize_style(raw: Any, fallback: DeckStyle | None = None) -> DeckStyle:
    base = fallback or DeckStyle()
    src = raw if isinstance(raw, dict) else {}
    font = str(src.get("font") or base.font)
    box = str(src.get("box") or base.box)
    size = str(src.get("size") or base.size)
    return DeckStyle(
        font=font if font in FONTS else base.font,  # type: ignore[arg-type]
        box=box if box in BOXES else base.box,  # type: ignore[arg-type]
        size=size if size in SIZES else base.size,  # type: ignore[arg-type]
        enter=as_effect(src.get("enter"), ENTER_FX, base.enter),
        exit=as_effect(src.get("exit"), EXIT_FX, base.exit),
        reveal=str(src.get("reveal") or base.reveal) if str(src.get("reveal") or base.reveal) in REVEAL else base.reveal,
    )


def sanitize_patch(raw: Any) -> DeckStylePatch | None:
    if not isinstance(raw, dict) or not raw:
        return None
    data: dict[str, Any] = {}
    if raw.get("font") in FONTS:
        data["font"] = raw["font"]
    if raw.get("box") in BOXES:
        data["box"] = raw["box"]
    if raw.get("size") in SIZES:
        data["size"] = raw["size"]
    if raw.get("enter"):
        data["enter"] = as_effect(raw.get("enter"), ENTER_FX, "slide_up")
    if raw.get("exit"):
        data["exit"] = as_effect(raw.get("exit"), EXIT_FX, "fade_out")
    reveal = str(raw.get("reveal") or "").strip()
    if reveal in REVEAL:
        data["reveal"] = reveal
    return DeckStylePatch.model_validate(data) if data else None


def resolve_style(deck: VisualDeck, beat: DeckBeat) -> DeckStyle:
    base = deck.style or DeckStyle()
    patch = beat.style
    if not patch:
        return DeckStyle(
            font=base.font,
            box=base.box,
            size=base.size,
            enter=beat.enter or base.enter,
            exit=beat.exit or base.exit,
            reveal=beat.reveal or base.reveal,
        )
    merged = sanitize_style(patch.model_dump(exclude_none=True), base)
    return merged


def sanitize_beat(raw: dict[str, Any], index: int, total_lines: int, base: DeckStyle) -> DeckBeat | None:
    kind = normalize_beat_kind(raw.get("kind"))
    title = str(raw.get("title") or raw.get("content") or "").strip()[:28]
    points = [str(item).strip()[:28] for item in (raw.get("points") or []) if str(item).strip()][:6]
    stats = [str(item).strip()[:16] for item in (raw.get("stats") or []) if str(item).strip()][:4]
    left = str(raw.get("left") or (points[0] if points else "")).strip()[:24]
    right = str(raw.get("right") or (points[1] if len(points) > 1 else "")).strip()[:24]
    lines = _as_lines(raw.get("lines"), total_lines)
    if not lines:
        lines = [min(index, max(total_lines - 1, 0))]
    if not title:
        title = points[0] if points else "要点"
    series = _series(raw.get("series"))
    events = _events(raw.get("events"))
    if kind == "chart" and not series:
        kind = "points"
    if kind == "timeline" and not events:
        kind = "points"
    if kind == "stats" and not stats:
        stats = points[:3] or [title]
    if kind == "compare" and (not left or not right):
        kind = "points"
    patch = sanitize_patch(raw.get("style"))
    enter = as_effect(raw.get("enter") or (patch.enter if patch else None), ENTER_FX, base.enter)
    exit = as_effect(raw.get("exit") or (patch.exit if patch else None), EXIT_FX, base.exit)
    reveal_raw = str(raw.get("reveal") or (patch.reveal if patch else "") or "").strip()
    reveal = reveal_raw if reveal_raw in REVEAL else default_reveal(kind, base.reveal)
    return DeckBeat(
        id=str(raw.get("id") or f"beat_{index + 1:02d}")[:24],
        kind=kind,  # type: ignore[arg-type]
        title=title,
        points=points,
        stats=stats,
        left=left,
        right=right,
        series=series,
        events=events,
        lines=lines,
        enter=enter,
        exit=exit,
        reveal=reveal,
        style=patch,
        note=str(raw.get("note") or "").strip()[:80],
        background_id=_page_bg_id(raw.get("background_id")),
    )


def sanitize_deck(raw: Any, script: Script, kind: str) -> VisualDeck:
    pack = normalize_kind(kind)
    src = raw if isinstance(raw, dict) else {}
    if src.get("kind"):
        pack = normalize_kind(str(src.get("kind")))
    style = sanitize_style(src.get("style"))
    units = spoken_units(script)
    beats: list[DeckBeat] = []
    for index, item in enumerate(src.get("beats") or []):
        if not isinstance(item, dict):
            continue
        beat = sanitize_beat(item, index, len(units), style)
        if beat:
            beats.append(beat)
        if len(beats) >= 16:
            break
    if not beats:
        return heuristic_deck(script, pack)
    covered = {line for beat in beats for line in beat.lines}
    leftover = [i for i in range(len(units)) if i not in covered]
    if leftover:
        beats.append(
            DeckBeat(
                id=f"beat_{len(beats) + 1:02d}",
                kind="points",
                title="补充",
                points=[units[i][:28] for i in leftover[:4]],
                lines=leftover[:8],
                enter=style.enter,
                exit=style.exit,
                reveal=style.reveal,
            )
        )
    source = str(src.get("source") or "llm")
    return VisualDeck(kind=pack, source="llm" if source == "llm" else "heuristic", style=style, beats=beats)  # type: ignore[arg-type]


def _beat_kind_for(pack: str, text: str) -> str:
    if pack == "steps":
        return "steps"
    if pack == "stats":
        return "stats"
    if pack == "quote":
        return "quote"
    if pack == "chart" and _nums(text):
        return "chart"
    if pack == "timeline":
        return "timeline"
    if pack == "compare":
        return "points"
    return "points"


def heuristic_deck(script: Script, kind: str) -> VisualDeck:
    pack = normalize_kind(kind)
    units = spoken_units(script)
    style = DeckStyle(reveal="draw" if pack in {"chart", "timeline"} else "stagger")
    beats: list[DeckBeat] = []
    for index, text in enumerate(units):
        beat_kind = _beat_kind_for(pack, text)
        values = _nums(text)
        beats.append(
            DeckBeat(
                id=f"beat_{index + 1:02d}",
                kind=beat_kind,  # type: ignore[arg-type]
                title=text[:28],
                points=[] if beat_kind in {"quote", "chart", "compare"} else [text[:28]],
                stats=([f"{v:g}" for v in values[:3]] or [text[:16]]) if beat_kind == "stats" else [],
                series=(
                    [ChartSeries(label="数值", values=values[:8], labels=[str(i + 1) for i in range(len(values[:8]))])]
                    if beat_kind == "chart" and values
                    else []
                ),
                events=[DeckEvent(label=text[:12], at=0.5)] if beat_kind == "timeline" else [],
                lines=[index],
                enter=style.enter,
                exit=style.exit,
                reveal="draw" if beat_kind in {"chart", "timeline"} else style.reveal,
            )
        )
    if pack == "compare" and len(units) >= 2:
        paired: list[DeckBeat] = []
        for index in range(0, len(units), 2):
            left = units[index]
            right = units[index + 1] if index + 1 < len(units) else ""
            lines = [index] + ([index + 1] if right else [])
            paired.append(
                DeckBeat(
                    id=f"beat_{len(paired) + 1:02d}",
                    kind="compare" if right else "points",
                    title="对比" if right else left[:28],
                    points=[left[:28]] if not right else [],
                    left=left[:24] if right else "",
                    right=right[:24],
                    lines=lines,
                    enter=style.enter,
                    exit=style.exit,
                    reveal=style.reveal,
                )
            )
        beats = paired
    return VisualDeck(kind=pack, source="heuristic", style=style, beats=beats or [DeckBeat(id="beat_01", title=script.topic or "要点", lines=[0])])


def llm_deck(script: Script, kind: str) -> VisualDeck | None:
    if not llm_ready():
        return None
    units = spoken_units(script)
    numbered = "\n".join(f"{index}. {text}" for index, text in enumerate(units))
    client, model = open_llm()
    response = client.chat.completions.create(
        model=model,
        temperature=0.35,
        messages=[
            {"role": "system", "content": prompt_text("deck")},
            {
                "role": "user",
                "content": (
                    f"展示类型：{kind}（{DECK_KINDS.get(kind, kind)}）\n"
                    f"主题：{script.topic}\n"
                    f"口播类型：{script.genre or ''}\n"
                    f"口播句子（下标从 0 开始，beats.lines 必须引用这些下标）：\n{numbered}\n"
                ),
            },
        ],
    )
    content = (response.choices[0].message.content or "").strip()
    return sanitize_deck(_extract_json(content), script, kind)


def plan_deck(script: Script, kind: str) -> tuple[VisualDeck, str]:
    pack = normalize_kind(kind)
    if pack != "mirror":
        try:
            deck = llm_deck(script, pack)
            if deck and deck.beats:
                deck.source = "llm"
                return deck, "llm"
        except Exception:
            pass
    return heuristic_deck(script, pack), "heuristic"


def apply_look_to_deck(deck: VisualDeck, look: dict[str, Any]) -> VisualDeck:
    steps = look.get("step_enters")
    enter = steps[0] if isinstance(steps, list) and steps else look.get("title_enter")
    seed = look.get("deck_style") if isinstance(look.get("deck_style"), dict) else {
        "font": look.get("caption_font") or look.get("title_font"),
        "box": look.get("caption_box") or look.get("title_box"),
        "size": look.get("caption_size") or look.get("title_size"),
        "enter": enter,
        "exit": look.get("step_exit") or look.get("title_exit"),
        "reveal": "stagger",
    }
    deck.style = sanitize_style(seed, deck.style)
    extras = look.get("deck_overrides")
    by_id = {beat.id: beat for beat in deck.beats}
    if isinstance(extras, list):
        for item in extras:
            if not isinstance(item, dict):
                continue
            target = by_id.get(str(item.get("id") or ""))
            if not target:
                continue
            target.style = sanitize_patch(item.get("style") or item)
    for beat in deck.beats:
        if beat.style and beat.style.reveal:
            beat.reveal = beat.style.reveal
            continue
        beat.reveal = default_reveal(beat.kind, deck.style.reveal)
    return deck


def style_deck(deck: VisualDeck, brief: str = "") -> VisualDeck:
    if not llm_ready():
        return deck
    client, model = open_llm()
    response = client.chat.completions.create(
        model=model,
        temperature=0.4,
        messages=[
            {"role": "system", "content": prompt_text("deck_style")},
            {
                "role": "user",
                "content": (
                    f"用户想要的样式：{brief.strip() or '适合口播、清楚好读'}\n"
                    f"展示类型：{deck.kind}\n"
                    f"页数：{len(deck.beats)}\n"
                    f"各页：{[{'id': b.id, 'kind': b.kind, 'title': b.title} for b in deck.beats[:12]]}\n"
                ),
            },
        ],
    )
    raw = _extract_json((response.choices[0].message.content or "").strip())
    style = sanitize_style(raw.get("style") if isinstance(raw, dict) else raw, deck.style)
    extras = raw.get("overrides") if isinstance(raw, dict) else None
    beats = list(deck.beats)
    if isinstance(extras, list):
        by_id = {beat.id: beat for beat in beats}
        for item in extras:
            if not isinstance(item, dict):
                continue
            target = by_id.get(str(item.get("id") or ""))
            if not target:
                continue
            target.style = sanitize_patch(item.get("style") or item)
    deck.style = style
    deck.beats = beats
    return deck



def beat_window(
    script: Script,
    words: list[WordStamp],
    duration_ms: int,
    lines: list[int],
) -> tuple[int, int]:
    units = spoken_units(script)
    texts = [units[i] for i in lines if 0 <= i < len(units)]
    starts: list[int] = []
    ends: list[int] = []
    for text in texts:
        found = _locate(words, text) if words else None
        if found:
            starts.append(found[0])
            ends.append(found[1])
    if starts:
        return min(starts), max(ends)
    weights = [max(len(_letters(unit)), 1) for unit in units] or [1]
    total = sum(weights)
    begin = 0
    picked = lines or [0]
    lo, hi = min(picked), max(picked)
    start = int(duration_ms * sum(weights[:lo]) / total)
    end = int(duration_ms * sum(weights[: hi + 1]) / total)
    if end <= start:
        end = min(duration_ms, start + 1200)
    return max(0, start), min(duration_ms, max(end, begin + 400))
