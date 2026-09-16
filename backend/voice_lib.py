from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from backend.audio import mean_volume_db, to_wav_16k
from backend.config import VOICE_DIR
from backend.voices import SPARK_PRESETS, VOICES, canonical_edge_voice, default_voice, get_spark_preset

VOICE_DIR.mkdir(parents=True, exist_ok=True)
LIBRARY = VOICE_DIR / "library.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read() -> dict:
    if not LIBRARY.exists():
        return {"clones": []}
    return json.loads(LIBRARY.read_text(encoding="utf-8"))


def _write(payload: dict) -> None:
    LIBRARY.parent.mkdir(parents=True, exist_ok=True)
    LIBRARY.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def list_clones() -> list[dict]:
    return list(_read().get("clones") or [])


def get_clone(clone_id: str) -> dict | None:
    for item in list_clones():
        if item.get("id") == clone_id:
            return item
    return None


def clone_ref_path(clone_id: str) -> Path:
    return VOICE_DIR / "clones" / clone_id / "ref.wav"


def add_clone(name: str, src: Path, prompt_text: str = "", source: str = "self") -> dict:
    text = (prompt_text or "").strip()
    if not text:
        raise ValueError("请填写这段音视频里实际说的文字，克隆才准确。")
    if len(text) < 8:
        raise ValueError("对应文字太短，请尽量写全这段里说的内容（建议 8 字以上）。")
    kind = source if source in {"self", "other"} else "self"
    clone_id = uuid4().hex[:10]
    dest = clone_ref_path(clone_id)
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        to_wav_16k(src, dest)
    except Exception as exc:
        if dest.exists():
            dest.unlink(missing_ok=True)
        raise RuntimeError("无法从这份音视频提取声音，请换一段清晰的人声材料再试。") from exc
    if not dest.exists() or dest.stat().st_size < 800:
        dest.unlink(missing_ok=True)
        raise RuntimeError("参考音太短或没有人声，请用 6–20 秒清晰口播。")
    level = mean_volume_db(dest)
    if level is not None and level < -45:
        dest.unlink(missing_ok=True)
        raise RuntimeError(
            "参考音几乎没有声音。请改选系统麦克风（不要用 Iriun / 立体声混音等虚拟麦）后重录，或换一段有人声的音视频。"
        )
    item = {
        "id": clone_id,
        "name": name.strip() or ("他人声音" if kind == "other" else "克隆声音"),
        "engine": "spark",
        "gender": "克隆",
        "style": "他人" if kind == "other" else "本人",
        "kind": "clone",
        "source": kind,
        "prompt_text": text,
        "created_at": _now(),
    }
    data = _read()
    clones = list(data.get("clones") or [])
    clones.append(item)
    data["clones"] = clones
    _write(data)
    return item


def delete_clone(clone_id: str) -> bool:
    data = _read()
    clones = [item for item in data.get("clones") or [] if item.get("id") != clone_id]
    if len(clones) == len(data.get("clones") or []):
        return False
    data["clones"] = clones
    _write(data)
    folder = VOICE_DIR / "clones" / clone_id
    if folder.exists():
        for path in folder.glob("*"):
            path.unlink()
        folder.rmdir()
    return True


def all_voices() -> list[dict]:
    presets = [
        {
            "id": item["id"],
            "name": item["name"],
            "gender": item["gender"],
            "style": item["style"],
            "engine": "spark",
            "kind": "preset",
        }
        for item in SPARK_PRESETS
    ]
    clones = [
        {
            "id": item["id"],
            "name": item["name"],
            "gender": item.get("gender") or "克隆",
            "style": item.get("style") or ("他人" if item.get("source") == "other" else "本人"),
            "engine": "spark",
            "kind": "clone",
            "source": item.get("source") or "self",
        }
        for item in list_clones()
    ]
    edge = [{**item, "engine": "edge", "kind": "edge"} for item in VOICES]
    return presets + clones + edge


def resolve_voice(voice_id: str) -> dict:
    live = canonical_edge_voice(voice_id)
    for item in VOICES:
        if item["id"] == live:
            return {**item, "engine": "edge", "kind": "edge"}
    preset = get_spark_preset(voice_id)
    if preset:
        return preset
    clone = get_clone(voice_id)
    if clone:
        return {
            **clone,
            "engine": "spark",
            "kind": "clone",
            "ref_wav": str(clone_ref_path(clone["id"])),
        }
    raise KeyError(voice_id)


def is_known_voice(voice_id: str) -> bool:
    try:
        resolve_voice(voice_id)
        return True
    except KeyError:
        return False


def fallback_voice() -> str:
    return default_voice()
