from __future__ import annotations

import re

from backend.schemas import Script, Timeline, WordStamp
from backend.slides import build_slides
from backend.themes import resolve_theme

_FONTS = {"sans", "serif", "xiaowei", "huangyou", "kuaile", "mashan"}
_BOXES = {"theme", "card", "bar", "chalk", "outline", "plain"}
_SIZES = {"sm", "md", "lg"}
_THEME_MOTION = {"auto", "none", "pulse", "drift", "scan"}
_TEXT_MOTION = {"fade", "pop", "type", "slide"}
_PERSON_MASK = {"theme", "cutout", "square", "chroma"}
_PERSON_MASK_ALIASES = {"off": "square"}


def _person_mask(value: str | None, default: str = "square") -> str:
    raw = (value or "").strip() or default
    raw = _PERSON_MASK_ALIASES.get(raw, raw)
    return raw if raw in _PERSON_MASK else default


def _letters(text: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fff]+", "", text or "")


def _pick(value: str, allowed: set[str], default: str) -> str:
    return value if value in allowed else default


def _clamp01(value: float, default: float, lo: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(1.0, number))


def _clamp_zoom(value: float, default: float = 1.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.4, min(3.0, number))


def _chroma_color(value: str | None, default: str = "#2ecc40") -> str:
    raw = (value or "").strip().lstrip("#")
    if re.fullmatch(r"[0-9a-fA-F]{3}", raw):
        raw = "".join(ch * 2 for ch in raw)
    if re.fullmatch(r"[0-9a-fA-F]{6}", raw):
        return f"#{raw.lower()}"
    return default


def _chroma_tolerance(value: float, default: float = 0.18) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.06, min(0.42, number))


def _title_end_ms(script: Script, words: list[WordStamp], duration_ms: int) -> int:
    topic = _letters(script.topic)
    if not topic:
        return 0
    estimated = max(1600, min(4200, len(topic) * 280))
    if not words:
        return min(estimated, max(duration_ms - 800, 800))

    letter_words: list[WordStamp] = []
    spoken_parts: list[str] = []
    for word in words:
        token = _letters(word.text)
        if not token:
            continue
        spoken_parts.append(token)
        letter_words.extend([word] * len(token))
    spoken = "".join(spoken_parts)
    if not spoken or not letter_words:
        return min(estimated, max(duration_ms - 800, 800))

    start = 0 if spoken.startswith(topic) else spoken.find(topic)
    if start != 0:
        hook = _letters(script.hook)
        if hook and spoken.startswith(hook):
            end = min(len(hook), len(letter_words))
            return max(letter_words[end - 1].end_ms, 1200)
        return min(estimated, max(duration_ms - 800, 800))

    end = min(len(topic), len(letter_words))
    return max(letter_words[end - 1].end_ms, 1200)


def build_timeline(
    script: Script,
    words: list[WordStamp],
    duration_ms: int,
    audio_name: str = "voice.mp3",
    orientation: str = "portrait",
    theme: str = "slate",
    watermark: str = "口播场记",
    show_watermark: bool = True,
    caption_font: str = "sans",
    caption_box: str = "theme",
    caption_size: str = "md",
    hide_captions_on_cta: bool = True,
    title_font: str = "sans",
    title_box: str = "outline",
    title_size: str = "lg",
    background: str | None = None,
    background_kind: str | None = None,
    music: str | None = None,
    music_volume: float = 0.16,
    talking_head: str | None = None,
    background_duration_ms: int | None = None,
    theme_motion: str = "auto",
    text_motion: str = "pop",
    show_subtitles: bool = False,
    person_mask: str = "square",
    mask_x: float = 0.5,
    mask_y: float = 0.47,
    mask_w: float = 0.64,
    mask_h: float = 0.72,
    mask_zoom: float = 1.0,
    chroma_color: str = "#2ecc40",
    chroma_tolerance: float = 0.18,
    subtitles: list | None = None,
) -> Timeline:
    portrait = orientation != "landscape"
    width, height = (1080, 1920) if portrait else (1920, 1080)
    title_end = _title_end_ms(script, words, duration_ms)
    return Timeline(
        width=width,
        height=height,
        duration_ms=max(duration_ms, 3000),
        audio=audio_name,
        topic=script.topic,
        hook=script.hook,
        cta=script.cta,
        slides=build_slides(script, words, duration_ms, title_end),
        orientation="landscape" if not portrait else "portrait",
        theme=resolve_theme(theme),
        watermark=(watermark or "").strip() or "口播场记",
        show_watermark=show_watermark,
        caption_font=_pick(caption_font, _FONTS, "sans"),
        caption_box=_pick(caption_box, _BOXES, "theme"),
        caption_size=_pick(caption_size, _SIZES, "md"),
        hide_captions_on_cta=hide_captions_on_cta,
        title_end_ms=title_end,
        title_font=_pick(title_font, _FONTS, "sans"),
        title_box=_pick(title_box, _BOXES, "outline"),
        title_size=_pick(title_size, _SIZES, "lg"),
        background=background or None,
        background_kind="video" if background_kind == "video" else ("image" if background else None),
        music=music or None,
        music_volume=max(0.0, min(float(music_volume or 0), 0.5)),
        talking_head=talking_head or None,
        background_duration_ms=background_duration_ms or None,
        theme_motion=_pick(theme_motion, _THEME_MOTION, "auto"),  # type: ignore[arg-type]
        text_motion=_pick(text_motion, _TEXT_MOTION, "pop"),  # type: ignore[arg-type]
        show_subtitles=bool(show_subtitles),
        person_mask=_person_mask(person_mask),  # type: ignore[arg-type]
        mask_x=_clamp01(mask_x, 0.5),
        mask_y=_clamp01(mask_y, 0.47),
        mask_w=_clamp01(mask_w, 0.64, lo=0.12),
        mask_h=_clamp01(mask_h, 0.72, lo=0.12),
        mask_zoom=_clamp_zoom(mask_zoom),
        chroma_color=_chroma_color(chroma_color),
        chroma_tolerance=_chroma_tolerance(chroma_tolerance),
        subtitles=list(subtitles or []),
    )
