from __future__ import annotations

from backend.llm import compose_spoken, script_from_transcript
from backend.schemas import Script


def compose_narration(script: Script) -> str:
    if script.engine == "manual":
        original = (script.narration or script.cleaned_transcript or "").strip()
        if not (script.topic or "").strip():
            return original or compose_spoken(script.topic, script.hook, script.body, script.cta, original)
    return compose_spoken(script.topic, script.hook, script.body, script.cta, script.narration)


def script_from_rewrite(original: str, narration: str, existing: Script | None) -> Script:
    if existing:
        data = existing.model_dump()
        data["narration"] = narration
        return Script.model_validate(data)
    script = script_from_transcript(original or narration)
    script.narration = narration
    script.engine = "manual"
    return script
