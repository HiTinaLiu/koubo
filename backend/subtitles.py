from __future__ import annotations

import re

from backend.schemas import SubtitleCue, WordStamp


def build_subtitles(
    narration: str,
    words: list[WordStamp],
    duration_ms: int,
    max_chars: int = 18,
) -> list[SubtitleCue]:
    cues: list[SubtitleCue] = []
    letter_words = [item for item in words if (item.text or "").strip()]
    if letter_words:
        buf: list[str] = []
        start = letter_words[0].start_ms
        count = 0
        for item in letter_words:
            token = item.text.strip()
            if not buf:
                start = item.start_ms
            buf.append(token)
            count += len(re.sub(r"\s+", "", token))
            punct = bool(re.search(r"[。！？!?，,;；]$", token))
            if count >= max_chars or punct:
                text = "".join(buf).strip()
                if text:
                    cues.append(SubtitleCue(text=text, start_ms=start, end_ms=max(item.end_ms, start + 400)))
                buf, count = [], 0
        if buf:
            text = "".join(buf).strip()
            last = letter_words[-1]
            if text:
                cues.append(SubtitleCue(text=text, start_ms=start, end_ms=max(last.end_ms, start + 400)))
        return cues

    source = re.sub(r"\s+", "", (narration or "").strip())
    if not source:
        return []
    parts = [item for item in re.split(r"(?<=[。！？!?])", source) if item]
    if not parts:
        parts = [source[i : i + max_chars] for i in range(0, len(source), max_chars)]
    span = max(duration_ms, 1000)
    cursor = 0
    for index, part in enumerate(parts):
        share = max(len(part), 1) / max(len(source), 1)
        length = max(700, int(span * share))
        end = span if index == len(parts) - 1 else min(span, cursor + length)
        cues.append(SubtitleCue(text=part, start_ms=cursor, end_ms=end))
        cursor = end
    return cues
