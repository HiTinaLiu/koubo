from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from uuid import uuid4

from backend.config import LIBRARY_DIR
from backend.schemas import LibraryItem, Script, VisualDeck
from backend import jobs

LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
STORE = LIBRARY_DIR / "items.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read() -> list[dict]:
    if not STORE.exists():
        return []
    raw = json.loads(STORE.read_text(encoding="utf-8"))
    return list(raw.get("items") or [])


def _write(items: list[dict]) -> None:
    STORE.write_text(json.dumps({"items": items}, ensure_ascii=False, indent=2), encoding="utf-8")


def _fingerprint(original: str, script: Script | None = None) -> str:
    text = re.sub(r"\s+", "", original or "")
    if not text and script:
        text = re.sub(r"\s+", "", (script.narration or script.cleaned_transcript or script.topic or ""))
    text = re.sub(r"[，。！？、,.!?;；：:]+", "", text)
    return text.casefold()


def _find_existing(rows: list[dict], job_id: str, fingerprint: str) -> dict | None:
    for item in rows:
        if item.get("job_id") == job_id:
            return item
    if not fingerprint:
        return None
    for item in rows:
        script = Script.model_validate(item["script"]) if item.get("script") else None
        if _fingerprint(str(item.get("original") or ""), script) == fingerprint:
            return item
    return None


def dedupe_store() -> None:
    rows = _read()
    if len(rows) < 2:
        return
    kept: dict[str, dict] = {}
    unique: list[dict] = []
    for raw in rows:
        script = Script.model_validate(raw["script"]) if raw.get("script") else None
        fingerprint = _fingerprint(str(raw.get("original") or ""), script)
        if not fingerprint:
            unique.append(raw)
            continue
        prev = kept.get(fingerprint)
        if not prev:
            kept[fingerprint] = raw
            unique.append(raw)
            continue
        newer = (raw.get("updated_at") or "") >= (prev.get("updated_at") or "")
        winner, loser = (raw, prev) if newer else (prev, raw)
        if loser.get("script") and not winner.get("script"):
            winner["script"] = loser["script"]
        if loser.get("deck") and not (winner.get("deck") or {}).get("beats"):
            winner["deck"] = loser["deck"]
        elif loser.get("deck") and winner.get("deck"):
            loser_n = len((loser.get("deck") or {}).get("beats") or [])
            winner_n = len((winner.get("deck") or {}).get("beats") or [])
            if loser_n > winner_n:
                winner["deck"] = loser["deck"]
        if len(str(loser.get("title") or "")) > len(str(winner.get("title") or "")):
            winner["title"] = loser["title"]
        kept[fingerprint] = winner
        unique = [item for item in unique if item is not loser]
        if winner not in unique:
            unique.append(winner)
    if len(unique) != len(rows):
        _write(unique)


def _deck_haystack(deck: VisualDeck | None) -> str:
    if not deck or not deck.beats:
        return ""
    parts: list[str] = []
    for beat in deck.beats:
        parts.extend(
            [
                beat.title or "",
                beat.kind or "",
                beat.left or "",
                beat.right or "",
                " ".join(beat.points or []),
                " ".join(beat.stats or []),
            ]
        )
    return " ".join(parts).lower()


def _as_item(raw: dict) -> LibraryItem | None:
    try:
        return LibraryItem.model_validate(raw)
    except Exception:
        return None


def list_items(query: str = "") -> list[LibraryItem]:
    dedupe_store()
    needle = (query or "").strip().lower()
    items = [item for item in (_as_item(raw) for raw in _read()) if item]
    items.sort(key=lambda item: item.updated_at, reverse=True)
    if not needle:
        return items
    return [
        item
        for item in items
        if needle in item.title.lower()
        or needle in item.original.lower()
        or needle in (item.script.topic.lower() if item.script else "")
        or needle in (item.script.narration.lower() if item.script else "")
        or needle in _deck_haystack(item.deck)
    ]


def get_item(item_id: str) -> LibraryItem | None:
    for item in _read():
        if item.get("id") == item_id:
            return LibraryItem.model_validate(item)
    return None


def save_item(item: LibraryItem) -> LibraryItem:
    item.updated_at = _now()
    rows = _read()
    for index, raw in enumerate(rows):
        if raw.get("id") == item.id:
            rows[index] = item.model_dump()
            _write(rows)
            return item
    rows.append(item.model_dump())
    _write(rows)
    return item


def delete_item(item_id: str) -> bool:
    return delete_items([item_id]) == 1


def delete_items(item_ids: list[str]) -> int:
    wanted = {item_id for item_id in item_ids if item_id}
    if not wanted:
        return 0
    rows = _read()
    next_rows = [item for item in rows if item.get("id") not in wanted]
    deleted = len(rows) - len(next_rows)
    if deleted:
        _write(next_rows)
    return deleted


def upsert_job(job_id: str) -> LibraryItem | None:
    transcript = jobs.load_transcript(job_id)
    script = jobs.load_script(job_id)
    deck = jobs.load_deck(job_id)
    original = (transcript.text if transcript else "").strip()
    if not original and not script:
        return None
    fingerprint = _fingerprint(original, script)
    rows = _read()
    existing = _find_existing(rows, job_id, fingerprint)
    title = (script.topic if script else "") or original[:18] or "未命名口播"
    if existing:
        item = LibraryItem.model_validate(existing)
        item.job_id = job_id
        auto_title = (item.original or "")[:18] or "未命名口播"
        if not item.title or item.title in {"未命名口播", auto_title}:
            item.title = title
        item.original = original or item.original
        if script:
            item.script = script
        if deck and deck.beats:
            item.deck = deck
        return save_item(item)
    item = LibraryItem(
        id=uuid4().hex[:10],
        job_id=job_id,
        title=title,
        original=original,
        script=script,
        deck=deck if deck and deck.beats else None,
        created_at=_now(),
        updated_at=_now(),
    )
    return save_item(item)


def update_item(
    item_id: str,
    title: str | None,
    original: str | None,
    script: Script | None,
    deck: VisualDeck | None = None,
) -> LibraryItem:
    item = get_item(item_id)
    if not item:
        raise FileNotFoundError(item_id)
    if title is not None:
        item.title = title.strip() or item.title
    if original is not None:
        item.original = original.strip()
    if script is not None:
        item.script = script
    if deck is not None:
        item.deck = deck
    return save_item(item)
