from __future__ import annotations

import re
from typing import Any

HEX = re.compile(r"^#([0-9a-fA-F]{6})$")
RGBA = re.compile(r"^rgba?\([\d\s.,%]+\)$")

ENTER_FX = {
    "fade_in",
    "slide_up",
    "slide_down",
    "slide_left",
    "slide_right",
    "scale_in",
    "spring_pop",
    "bounce",
    "typewriter",
    "word_reveal",
    "char_reveal",
    "blur_reveal",
    "glitch_text",
    "shake",
    "underline_reveal",
    "marker_highlight",
}

EXIT_FX = {
    "fade_out",
    "scale_out",
    "slide_up",
    "slide_down",
    "slide_left",
    "slide_right",
}

KEYWORD_FX = {"keyword_pop", "keyword_pulse"}
SUB_FX = {"karaoke", "word_highlight", "fade_in"}
OVERLAY_FX = {"callout", "arrow_point", "circle_emphasis", "underline_reveal", "marker_highlight"}
THEME_FX = {"pulse", "drift", "scan", "none"}

ALL_FX = ENTER_FX | EXIT_FX | KEYWORD_FX | SUB_FX | OVERLAY_FX

CLIP_TYPES = {
    "theme",
    "theme_pulse",
    "theme_drift",
    "theme_scan",
    "title",
    "title_in",
    "step_card",
    "cta",
    "cta_in",
    "subtitle",
    "keyword",
    "keyword_pop",
    "keyword_pulse",
    "deck_ppt",
    "deck_stats",
    "deck_line",
    "deck_timeline",
    "deck_compare",
    "deck_quote",
    *OVERLAY_FX,
}

LEGACY_ENTER = {
    "fade": "fade_in",
    "pop": "spring_pop",
    "type": "typewriter",
    "slide": "slide_left",
    "auto": "spring_pop",
}

TOKEN_KEYS = ("bg", "text", "accent", "ctaText", "captionBg", "line", "glow", "muted", "markBg", "markText")


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def as_effect(value: Any, allowed: set[str], fallback: str) -> str:
    raw = str(value or "").strip()
    raw = LEGACY_ENTER.get(raw, raw)
    return raw if raw in allowed else fallback


def as_hex(value: Any, fallback: str) -> str:
    text = str(value or "").strip()
    return text.lower() if HEX.match(text) else fallback


def as_color(value: Any, fallback: str) -> str:
    text = str(value or "").strip()
    if HEX.match(text) or RGBA.match(text) or text == "transparent":
        return text
    return fallback


_PX_RADIAL = re.compile(r"radial-gradient\(\s*(\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px", re.I)
_PX_RADIAL_ONE = re.compile(r"radial-gradient\(\s*(\d+(?:\.\d+)?)px\s+at", re.I)


def scale_glow(glow: str) -> str:
    def pair(match: re.Match[str]) -> str:
        wp = max(70, min(160, round(float(match.group(1)) / 7.5)))
        hp = max(70, min(140, round(float(match.group(2)) / 6.6)))
        return f"radial-gradient({wp}% {hp}%"

    def single(match: re.Match[str]) -> str:
        size = max(70, min(160, round(float(match.group(1)) / 7.5)))
        return f"radial-gradient({size}% {size}% at"

    return _PX_RADIAL_ONE.sub(single, _PX_RADIAL.sub(pair, glow))


def glow_from(accent: str) -> str:
    r, g, b = _rgb(accent)
    return f"radial-gradient(120% 85% at 50% 12%, rgba({r},{g},{b},0.28), transparent 58%)"


def _rgb(hex_color: str) -> tuple[int, int, int]:
    value = hex_color.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def _luma(hex_color: str) -> float:
    r, g, b = _rgb(hex_color)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0


def _rgba(hex_color: str, alpha: float) -> str:
    r, g, b = _rgb(hex_color)
    return f"rgba({r},{g},{b},{alpha})"


def contrast_on(hex_color: str) -> str:
    return "#14110a" if _luma(hex_color) > 0.55 else "#fff7f2"


def derive_tokens(bg: str, text: str, accent: str) -> dict[str, str]:
    dark = _luma(bg) < 0.55
    if abs(_luma(bg) - _luma(text)) < 0.38:
        text = contrast_on(bg)
    return {
        "bg": bg,
        "text": text,
        "accent": accent,
        "ctaText": contrast_on(accent),
        "captionBg": _rgba(bg, 0.82) if dark else "#ffffff",
        "line": _rgba(accent, 0.4),
        "glow": glow_from(accent),
        "muted": _rgba(text, 0.62),
        "markBg": _rgba(accent, 0.16),
        "markText": accent if abs(_luma(accent) - _luma(bg)) >= 0.28 else contrast_on(bg),
    }


def _has_palette(src: dict[str, Any]) -> bool:
    return bool(src.get("bg") or src.get("background") or src.get("text") or src.get("text_color") or src.get("accent") or src.get("accent_color"))


def sanitize_tokens(raw: Any, fallback: dict[str, Any] | None = None) -> dict[str, str]:
    src = raw if isinstance(raw, dict) else {}
    if _has_palette(src):
        bg = as_hex(src.get("bg") or src.get("background"), "#0a0a0a")
        text = as_hex(src.get("text") or src.get("text_color"), "#fff7d6")
        accent = as_hex(src.get("accent") or src.get("accent_color"), "#ffcc33")
        base = derive_tokens(bg, text, accent)
    else:
        seed = dict(fallback or {})
        bg = as_hex(seed.get("bg"), "#0a0a0a")
        text = as_hex(seed.get("text"), "#fff7d6")
        accent = as_hex(seed.get("accent"), "#ffcc33")
        base = {**derive_tokens(bg, text, accent), **{k: str(v) for k, v in seed.items() if v}}
    out = {
        "bg": bg,
        "text": text,
        "accent": accent,
        "ctaText": as_hex(src.get("ctaText") or src.get("cta_text"), base.get("ctaText") or contrast_on(accent)),
        "captionBg": as_color(src.get("captionBg") or src.get("caption_bg"), base.get("captionBg") or "rgba(12,12,12,0.82)"),
        "line": as_color(src.get("line"), base.get("line") or _rgba(accent, 0.4)),
        "glow": str(src.get("glow") or "").strip() or base.get("glow") or glow_from(accent),
        "muted": as_color(src.get("muted"), base.get("muted") or _rgba(text, 0.62)),
        "markBg": as_color(src.get("markBg") or src.get("mark_bg"), base.get("markBg") or _rgba(accent, 0.16)),
        "markText": as_hex(src.get("markText") or src.get("mark_text"), base.get("markText") or accent),
    }
    if abs(_luma(out["bg"]) - _luma(out["text"])) < 0.38:
        out["text"] = contrast_on(out["bg"])
        out["muted"] = _rgba(out["text"], 0.62)
    if "gradient" in out["glow"] or out["glow"].startswith("radial") or out["glow"].startswith("linear"):
        pass
    else:
        out["glow"] = glow_from(out["accent"])
    out["glow"] = scale_glow(out["glow"])
    return out


def sanitize_params(kind: str, raw: dict[str, Any], fallback_enter: str, fallback_exit: str) -> dict[str, Any]:
    params: dict[str, Any] = {}
    enter_allow = ENTER_FX | KEYWORD_FX | SUB_FX
    params["enter"] = as_effect(raw.get("enter") or raw.get("motion"), enter_allow, fallback_enter)
    params["exit"] = as_effect(raw.get("exit"), EXIT_FX, fallback_exit)
    if kind in KEYWORD_FX or kind in {"keyword"}:
        params["enter"] = as_effect(raw.get("enter") or kind, KEYWORD_FX, "keyword_pop")
    if kind == "subtitle":
        params["enter"] = as_effect(raw.get("enter"), SUB_FX | ENTER_FX, "fade_in")
    for key in ("x", "y"):
        if key in raw:
            try:
                params[key] = round(clamp(float(raw[key]), 0, 100), 2)
            except (TypeError, ValueError):
                pass
    for key, lo, hi, default in (
        ("scaleFrom", 0.2, 2.0, 0.6),
        ("scaleTo", 0.6, 2.4, 1.15),
        ("settleScale", 0.6, 1.4, 1.0),
        ("intensity", 0.1, 1.0, 0.6),
    ):
        if key in raw:
            try:
                params[key] = round(clamp(float(raw[key]), lo, hi), 3)
            except (TypeError, ValueError):
                params[key] = default
    if "color" in raw:
        params["color"] = as_hex(raw.get("color"), "")
        if not params["color"]:
            params.pop("color")
    if "index" in raw:
        try:
            params["index"] = max(1, int(raw["index"]))
        except (TypeError, ValueError):
            pass
    if "total" in raw:
        try:
            params["total"] = max(1, int(raw["total"]))
        except (TypeError, ValueError):
            pass
    if isinstance(raw.get("highlights"), list):
        params["highlights"] = [str(item).strip() for item in raw["highlights"] if str(item).strip()][:8]
    if str(kind).startswith("deck_"):
        for key in ("title", "kind", "reveal", "font", "box", "size", "left", "right"):
            if isinstance(raw.get(key), str) and raw.get(key):
                params[key] = str(raw[key])[:40]
        for key in ("points", "stats", "lines"):
            if isinstance(raw.get(key), list):
                params[key] = raw[key][:12]
        for key in ("series", "events"):
            if isinstance(raw.get(key), list):
                params[key] = raw[key][:8]
    for key, value in raw.items():
        if key in params or key in {"enter", "exit", "motion"}:
            continue
        if isinstance(value, (str, int, float, bool)):
            params[key] = value
    return params
