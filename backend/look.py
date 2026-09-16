from __future__ import annotations

from typing import Any

from backend.fx import ENTER_FX, EXIT_FX, KEYWORD_FX, THEME_FX, as_effect, sanitize_tokens
from backend.themes import resolve_theme

THEMES = {"slate", "education", "tech", "life", "business", "news"}
FONTS = {"sans", "serif", "xiaowei", "huangyou", "kuaile", "mashan"}
BOXES = {"theme", "card", "bar", "chalk", "outline", "plain"}
SIZES = {"sm", "md", "lg"}

TOKEN_PRESETS: dict[str, dict[str, str]] = {
    "slate": {
        "bg": "#0a0a0a",
        "text": "#fff7d6",
        "accent": "#ffcc33",
        "ctaText": "#14110a",
        "captionBg": "rgba(12,12,12,0.82)",
        "line": "rgba(255,204,51,0.28)",
        "glow": "radial-gradient(120% 85% at 50% 12%, rgba(255,204,51,0.28), transparent 58%)",
        "muted": "rgba(255,247,214,0.62)",
        "markBg": "rgba(255,204,51,0.16)",
        "markText": "#ffcc33",
    },
    "education": {
        "bg": "#163526",
        "text": "#f6efd8",
        "accent": "#f0c75e",
        "ctaText": "#1a2a1c",
        "captionBg": "transparent",
        "line": "rgba(240,199,94,0.45)",
        "glow": "radial-gradient(107% 73% at 50% 0%, rgba(240,199,94,0.2), transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 30%)",
        "muted": "rgba(246,239,216,0.7)",
        "markBg": "rgba(240,199,94,0.16)",
        "markText": "#f0c75e",
    },
    "tech": {
        "bg": "#050814",
        "text": "#e7fbff",
        "accent": "#00e8ff",
        "ctaText": "#03141a",
        "captionBg": "rgba(4,16,28,0.84)",
        "line": "rgba(0,232,255,0.45)",
        "glow": "radial-gradient(120% 79% at 18% 8%, rgba(0,232,255,0.22), transparent 50%), radial-gradient(93% 79% at 90% 88%, rgba(88,86,255,0.2), transparent 48%)",
        "muted": "rgba(231,251,255,0.62)",
        "markBg": "rgba(0,232,255,0.14)",
        "markText": "#00e8ff",
    },
    "life": {
        "bg": "#fff4e8",
        "text": "#3a241c",
        "accent": "#e85d4c",
        "ctaText": "#fff7f2",
        "captionBg": "rgba(255,255,255,0.88)",
        "line": "rgba(232,93,76,0.28)",
        "glow": "radial-gradient(120% 76% at 70% 0%, rgba(255,186,120,0.45), transparent 55%)",
        "muted": "rgba(58,36,28,0.55)",
        "markBg": "rgba(232,93,76,0.12)",
        "markText": "#e85d4c",
    },
    "business": {
        "bg": "#0b1628",
        "text": "#f6f1e4",
        "accent": "#d4a017",
        "ctaText": "#16120a",
        "captionBg": "rgba(8,16,30,0.82)",
        "line": "rgba(212,160,23,0.4)",
        "glow": "radial-gradient(115% 73% at 50% 0%, rgba(212,160,23,0.18), transparent 58%)",
        "muted": "rgba(246,241,228,0.62)",
        "markBg": "rgba(212,160,23,0.16)",
        "markText": "#d4a017",
    },
    "news": {
        "bg": "#f3f4f6",
        "text": "#111111",
        "accent": "#d61f26",
        "ctaText": "#ffffff",
        "captionBg": "#111111",
        "line": "rgba(214,31,38,0.7)",
        "glow": "linear-gradient(180deg, rgba(214,31,38,0.08), transparent 28%)",
        "muted": "rgba(17,17,17,0.55)",
        "markBg": "#d61f26",
        "markText": "#ffffff",
    },
}

LOOK_PACKS: dict[str, dict[str, Any]] = {
    "knowledge": {
        "name": "知识干货",
        "brief": "黑金干货口播：结论和重点词从画面中间弹出，步骤卡干脆利落。",
        "theme": "slate",
        "theme_motion": "pulse",
        "title_enter": "scale_in",
        "title_exit": "fade_out",
        "step_enters": ["spring_pop", "bounce", "scale_in"],
        "step_exit": "fade_out",
        "keyword_fx": "keyword_pop",
        "cta_enter": "slide_up",
        "title_font": "sans",
        "title_box": "outline",
        "title_size": "lg",
        "caption_font": "sans",
        "caption_box": "card",
        "caption_size": "md",
        "hide_captions_on_cta": True,
    },
    "news": {
        "name": "资讯快报",
        "brief": "像新闻直播：浅底红条，标题和步骤从左侧滑入，适合叠字幕。",
        "theme": "news",
        "theme_motion": "scan",
        "title_enter": "slide_left",
        "title_exit": "slide_left",
        "step_enters": ["slide_left", "slide_up"],
        "step_exit": "fade_out",
        "keyword_fx": "keyword_pop",
        "cta_enter": "slide_up",
        "title_font": "sans",
        "title_box": "bar",
        "title_size": "md",
        "caption_font": "sans",
        "caption_box": "bar",
        "caption_size": "md",
        "hide_captions_on_cta": True,
    },
    "life": {
        "name": "轻松生活",
        "brief": "生活号暖色：柔光慢慢铺开，文字淡入，轻松不抢人。",
        "theme": "life",
        "theme_motion": "drift",
        "title_enter": "fade_in",
        "title_exit": "fade_out",
        "step_enters": ["fade_in", "blur_reveal"],
        "step_exit": "fade_out",
        "keyword_fx": "keyword_pulse",
        "cta_enter": "fade_in",
        "title_font": "kuaile",
        "title_box": "plain",
        "title_size": "lg",
        "caption_font": "sans",
        "caption_box": "card",
        "caption_size": "md",
        "hide_captions_on_cta": True,
    },
    "tech": {
        "name": "科技感",
        "brief": "深空青光科技风：扫描线、故障字点缀，关键词脉冲。",
        "theme": "tech",
        "theme_motion": "scan",
        "title_enter": "glitch_text",
        "title_exit": "fade_out",
        "step_enters": ["spring_pop", "slide_right", "glitch_text"],
        "step_exit": "scale_out",
        "keyword_fx": "keyword_pulse",
        "cta_enter": "scale_in",
        "title_font": "sans",
        "title_box": "outline",
        "title_size": "lg",
        "caption_font": "sans",
        "caption_box": "card",
        "caption_size": "md",
        "hide_captions_on_cta": True,
    },
    "education": {
        "name": "课堂板书",
        "brief": "黑板粉笔课：主题词打字机，步骤逐字出现，适合讲方法。",
        "theme": "education",
        "theme_motion": "drift",
        "title_enter": "typewriter",
        "title_exit": "fade_out",
        "step_enters": ["char_reveal", "typewriter", "underline_reveal"],
        "step_exit": "fade_out",
        "keyword_fx": "keyword_pop",
        "cta_enter": "slide_up",
        "title_font": "xiaowei",
        "title_box": "chalk",
        "title_size": "lg",
        "caption_font": "xiaowei",
        "caption_box": "chalk",
        "caption_size": "md",
        "hide_captions_on_cta": True,
    },
    "business": {
        "name": "商务金",
        "brief": "海军金商务风：沉稳淡入，少噱头，适合公司和职场。",
        "theme": "business",
        "theme_motion": "pulse",
        "title_enter": "fade_in",
        "title_exit": "fade_out",
        "step_enters": ["fade_in", "slide_up"],
        "step_exit": "fade_out",
        "keyword_fx": "keyword_pop",
        "cta_enter": "slide_up",
        "title_font": "serif",
        "title_box": "card",
        "title_size": "md",
        "caption_font": "serif",
        "caption_box": "card",
        "caption_size": "md",
        "hide_captions_on_cta": True,
    },
}

BUILTIN_IDS = set(LOOK_PACKS)


def _pick(raw: dict, key: str, allowed: set[str], fallback: str) -> str:
    value = str(raw.get(key) or fallback)
    return value if value in allowed else fallback


def sanitize_look(raw: dict | None, fallback: dict[str, Any] | None = None) -> dict[str, Any]:
    base = dict(LOOK_PACKS["knowledge"])
    if fallback:
        base.update(fallback)
    if not isinstance(raw, dict):
        raw = {}
    theme = resolve_theme(str(raw.get("theme") or base["theme"]))
    # 只要 tokens 里有 bg/text/accent，sanitize_tokens 会按这组色推导，不再套固定底色方案。
    tokens = sanitize_tokens(raw.get("tokens") or raw.get("theme_tokens"), TOKEN_PRESETS.get(theme))
    step_enters = raw.get("step_enters") if isinstance(raw.get("step_enters"), list) else base.get("step_enters")
    cleaned_steps = [as_effect(item, ENTER_FX, "spring_pop") for item in (step_enters or ["spring_pop"])]
    from backend.deck import sanitize_style

    deck_style = sanitize_style(
        raw.get("deck_style")
        if isinstance(raw.get("deck_style"), dict)
        else {
            "font": _pick(raw, "caption_font", FONTS, str(base["caption_font"])),
            "box": _pick(raw, "caption_box", BOXES, str(base["caption_box"])),
            "size": _pick(raw, "caption_size", SIZES, str(base["caption_size"])),
            "enter": cleaned_steps[0] if cleaned_steps else "slide_up",
            "exit": as_effect(raw.get("step_exit"), EXIT_FX, str(base.get("step_exit") or "fade_out")),
            "reveal": str(raw.get("reveal") or "stagger"),
        }
    )
    overrides = raw.get("deck_overrides") if isinstance(raw.get("deck_overrides"), list) else []
    return {
        "theme": theme if theme in THEMES else "slate",
        "theme_motion": _pick(raw, "theme_motion", THEME_FX, str(base["theme_motion"])),
        "title_enter": as_effect(raw.get("title_enter") or raw.get("text_motion"), ENTER_FX, str(base["title_enter"])),
        "title_exit": as_effect(raw.get("title_exit"), EXIT_FX, str(base.get("title_exit") or "fade_out")),
        "step_enters": cleaned_steps or ["spring_pop"],
        "step_exit": as_effect(raw.get("step_exit"), EXIT_FX, str(base.get("step_exit") or "fade_out")),
        "keyword_fx": as_effect(raw.get("keyword_fx"), KEYWORD_FX, str(base.get("keyword_fx") or "keyword_pop")),
        "cta_enter": as_effect(raw.get("cta_enter"), ENTER_FX, str(base.get("cta_enter") or "slide_up")),
        "title_font": _pick(raw, "title_font", FONTS, str(base["title_font"])),
        "title_box": _pick(raw, "title_box", BOXES, str(base["title_box"])),
        "title_size": _pick(raw, "title_size", SIZES, str(base["title_size"])),
        "caption_font": _pick(raw, "caption_font", FONTS, str(base["caption_font"])),
        "caption_box": _pick(raw, "caption_box", BOXES, str(base["caption_box"])),
        "caption_size": _pick(raw, "caption_size", SIZES, str(base["caption_size"])),
        "hide_captions_on_cta": bool(raw["hide_captions_on_cta"])
        if "hide_captions_on_cta" in raw
        else bool(base["hide_captions_on_cta"]),
        "tokens": tokens,
        "text_motion": str(base.get("text_motion") or "pop"),
        "deck_style": deck_style.model_dump(),
        "deck_overrides": overrides,
    }


def match_brief(brief: str, genre: str = "") -> dict[str, Any]:
    text = (brief or "").strip()
    if not text:
        if genre in LOOK_PACKS:
            return sanitize_look(LOOK_PACKS[genre])
        return sanitize_look(LOOK_PACKS["knowledge"])
    for item in LOOK_PACKS.values():
        if item["brief"] == text:
            return sanitize_look(item)
    keys = ["新闻", "资讯", "字幕", "红条", "科技", "扫描", "故障", "黑板", "粉笔", "课堂", "商务", "职场", "生活", "暖", "干货", "弹出"]
    best_key = "knowledge"
    best = 0
    for key, item in LOOK_PACKS.items():
        hay = f"{item['name']} {item['brief']} {item['theme']}"
        score = 5 if item["name"] in text else 0
        score += sum(2 for token in keys if token in text and token in hay)
        if score > best:
            best = score
            best_key = key
    return sanitize_look(LOOK_PACKS[best_key])


def apply_look(target: Any, look: dict[str, Any]) -> None:
    clean = sanitize_look(look)
    target.theme = clean["theme"]
    target.theme_motion = clean["theme_motion"]
    target.text_motion = "pop"
    target.title_font = clean["title_font"]
    target.title_box = clean["title_box"]
    target.title_size = clean["title_size"]
    target.caption_font = clean["caption_font"]
    target.caption_box = clean["caption_box"]
    target.caption_size = clean["caption_size"]
    target.hide_captions_on_cta = clean["hide_captions_on_cta"]
    target.theme_tokens = clean["tokens"]
    target.title_enter = clean["title_enter"]
    target.step_enters = clean["step_enters"]
    target.step_exit = clean["step_exit"]
    target.keyword_fx = clean["keyword_fx"]
    target.cta_enter = clean["cta_enter"]
    target.title_exit = clean["title_exit"]
