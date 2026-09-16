from __future__ import annotations

THEMES = [
    {"id": "slate", "name": "场记", "accent": "#ffcc33", "hint": "黑底黄标"},
    {"id": "education", "name": "教育", "accent": "#f0c75e", "hint": "黑板粉笔"},
    {"id": "tech", "name": "科技", "accent": "#00e8ff", "hint": "深空青光"},
    {"id": "life", "name": "生活", "accent": "#e85d4c", "hint": "暖光日间"},
    {"id": "business", "name": "商务", "accent": "#d4a017", "hint": "海军金"},
    {"id": "news", "name": "资讯", "accent": "#d61f26", "hint": "新闻红"},
]

THEME_IDS = {item["id"] for item in THEMES}
LEGACY_THEMES = {"paper": "life", "neon": "tech", "ink": "news"}


def resolve_theme(theme: str | None) -> str:
    value = (theme or "slate").strip()
    value = LEGACY_THEMES.get(value, value)
    return value if value in THEME_IDS else "slate"
