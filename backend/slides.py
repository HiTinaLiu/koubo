from __future__ import annotations

import re

from backend.keywords import match_highlights
from backend.schemas import Script, Slide, WordStamp

CTA_HOLD_MS = 3200
_TITLE_LIMIT = 14


def letters(text: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fff]+", "", text or "")


def slide_title(text: str, limit: int = _TITLE_LIMIT) -> str:
    raw = re.sub(r"\s+", "", text or "").strip("，、。！？!?；;：: ")
    if not raw:
        return "要点"
    for sep in "，、；;：:":
        idx = raw.find(sep)
        if 4 <= idx <= limit:
            return raw[:idx]
    if len(raw) <= limit:
        return raw
    return raw[:limit]


def slide_lines(script: Script) -> list[str]:
    body = [item.strip() for item in script.body if item and str(item).strip()]
    hook = (script.hook or "").strip()
    if not hook:
        return body
    if body and letters(hook) == letters(body[0]):
        return body
    return [hook, *body]


def slide_highlights(text: str, keywords: list[str] | None = None, limit: int = 3) -> list[str]:
    hits: list[str] = []
    for item in match_highlights(text, keywords or []):
        if item not in hits:
            hits.append(item)
        if len(hits) >= limit:
            break
    return hits


def _spoken_letters(words: list[WordStamp]) -> tuple[str, list[WordStamp]]:
    parts: list[str] = []
    mapped: list[WordStamp] = []
    for word in words:
        token = letters(word.text)
        if not token:
            continue
        parts.append(token)
        mapped.extend([word] * len(token))
    return "".join(parts), mapped


def _find_key(spoken: str, key: str, cursor: int) -> int:
    if not key or cursor >= len(spoken):
        return -1
    at = spoken.find(key, cursor)
    if at >= 0:
        return at
    for size in (12, 8, 6):
        if size > len(key) or size < 4:
            continue
        at = spoken.find(key[:size], cursor)
        if at >= 0:
            return at
    return -1


def _ms_at(mapped: list[WordStamp], index: int, *, end: bool) -> int:
    if not mapped:
        return 0
    index = max(0, min(index, len(mapped) - 1))
    return mapped[index].end_ms if end else mapped[index].start_ms


def _cursor_at_ms(mapped: list[WordStamp], ms: int) -> int:
    if not mapped or ms <= 0:
        return 0
    for index, word in enumerate(mapped):
        if word.end_ms >= ms:
            return index
    return len(mapped)


def _even_slides(
    lines: list[str],
    start_ms: int,
    end_ms: int,
    keywords: list[str],
) -> list[Slide]:
    if not lines:
        return []
    origin = max(0, int(start_ms))
    span = max(int(end_ms) - origin, 800)
    slot = span / len(lines)
    total = len(lines)
    slides: list[Slide] = []
    for index, line in enumerate(lines):
        begin = origin + int(index * slot)
        stop = origin + int(min(span, (index + 1) * slot))
        if stop - begin < 400:
            stop = begin + 400
        slides.append(
            Slide(
                text=line,
                title=slide_title(line),
                start_ms=begin,
                end_ms=stop,
                index=index + 1,
                total=total,
                highlights=slide_highlights(line, keywords),
            )
        )
    return slides


def build_slides(
    script: Script,
    words: list[WordStamp],
    duration_ms: int,
    title_end_ms: int = 0,
) -> list[Slide]:
    lines = slide_lines(script)
    if not lines:
        return []
    keywords = list(script.keywords or [])
    hold = min(CTA_HOLD_MS, max(duration_ms // 4, 800))
    hard_end = max(title_end_ms + 400, duration_ms - hold)
    spoken, mapped = _spoken_letters(words)
    if not spoken or not mapped:
        return _even_slides(lines, title_end_ms, hard_end, keywords)

    cursor = _cursor_at_ms(mapped, title_end_ms)
    cta_key = letters(script.cta)
    if cta_key:
        cta_at = spoken.rfind(cta_key)
        if cta_at >= cursor:
            hard_end = min(hard_end, max(title_end_ms + 400, mapped[cta_at].start_ms))

    spans: list[tuple[int, int, str] | None] = []
    search = cursor
    for line in lines:
        key = letters(line)
        if not key:
            spans.append(None)
            continue
        at = _find_key(spoken, key, search)
        if at < 0:
            return _even_slides(lines, title_end_ms, hard_end, keywords)
        if spoken[at : at + len(key)] == key:
            end = at + len(key)
        else:
            end = at + min(len(key), len(spoken) - at)
            for size in range(min(len(key), len(spoken) - at), 3, -1):
                if spoken[at : at + size] == key[:size]:
                    end = at + size
                    break
        spans.append((at, end, line))
        search = end

    usable = [item for item in spans if item]
    if len(usable) != len(lines):
        return _even_slides(lines, title_end_ms, hard_end, keywords)

    total = len(usable)
    slides: list[Slide] = []
    for index, (start_i, end_i, line) in enumerate(usable):
        start_ms = max(title_end_ms, _ms_at(mapped, start_i, end=False))
        if index + 1 < total:
            next_start = usable[index + 1][0]
            end_ms = _ms_at(mapped, next_start, end=False)
        else:
            end_ms = hard_end
        end_ms = max(end_ms, start_ms + 400)
        if end_ms > hard_end and start_ms < hard_end:
            end_ms = hard_end
        slides.append(
            Slide(
                text=line,
                title=slide_title(line),
                start_ms=start_ms,
                end_ms=end_ms,
                index=index + 1,
                total=total,
                highlights=slide_highlights(line, keywords),
            )
        )
    return slides
