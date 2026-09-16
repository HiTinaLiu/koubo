from __future__ import annotations

import json
import re

from backend.schemas import Script
from backend.settings_store import llm_ready, open_llm, prompt_text

STOP = set(
    "的了是在和就都也与或及把被让给到从对为这那我你他她它们一个没有不是可以如果因为所以然后而且但是如果还要自己我们你们"
)
HINTS = ("关注", "结论", "方法", "开头", "三秒", "数字", "误区", "关键", "核心")


def _tokens(text: str) -> list[str]:
    clean = re.sub(r"\s+", "", text or "")
    found: list[str] = []
    for item in re.findall(r"[0-9]+%?|[A-Za-z]{2,}|[\u4e00-\u9fff]{2,8}", clean):
        if item in STOP or len(item) < 2:
            continue
        found.append(item)
    return found


def _haystack(script: Script) -> str:
    return "".join([script.topic, script.hook, script.cta, script.narration, *script.body])


def clean_keywords(raw, script: Script, limit: int | None = None) -> list[str]:
    if isinstance(raw, str):
        items = [part.strip() for part in re.split(r"[,，、\s]+", raw) if part.strip()]
    elif isinstance(raw, list):
        items = [str(item).strip() for item in raw if str(item).strip()]
    else:
        items = []
    blob = _haystack(script)
    unique: list[str] = []
    for item in items:
        word = re.sub(r"\s+", "", item)
        if len(word) < 2 or len(word) > 8:
            continue
        if word not in blob:
            continue
        if word not in unique:
            unique.append(word)
        if limit is not None and len(unique) >= limit:
            break
    return unique


def extract_keywords(script: Script, limit: int | None = None) -> list[str]:
    ranked: list[str] = []
    for source in (script.topic, script.hook, script.cta, *script.body, script.narration):
        ranked.extend(_tokens(source))
    for hint in HINTS:
        if hint in (script.narration or "") or hint in (script.hook or ""):
            ranked.append(hint)
    unique: list[str] = []
    for item in ranked:
        if item not in unique:
            unique.append(item)
    unique.sort(key=len, reverse=True)
    return unique[:limit] if limit is not None else unique


def _llm_keywords(script: Script) -> list[str]:
    pair = open_llm()
    if not pair:
        return []
    client, model = pair
    payload = {
        "topic": script.topic,
        "hook": script.hook,
        "body": script.body,
        "cta": script.cta,
        "narration": script.narration,
    }
    response = client.chat.completions.create(
        model=model,
        temperature=0.3,
        messages=[
            {"role": "system", "content": prompt_text("keywords")},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
    )
    content = response.choices[0].message.content or ""
    raw = content.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            return []
        data = json.loads(raw[start : end + 1])
    return clean_keywords(data.get("keywords"), script)


def fill_keywords(script: Script, force: bool = False) -> Script:
    if script.keywords and not force:
        script.keywords = clean_keywords(script.keywords, script) or list(script.keywords)
        return script
    want_llm = force or script.engine == "llm"
    if want_llm and llm_ready():
        try:
            words = _llm_keywords(script)
        except Exception:
            words = []
        if words:
            script.keywords = words
            script.keyword_engine = "llm"
            return script
    script.keywords = extract_keywords(script)
    script.keyword_engine = "heuristic"
    return script


def match_highlights(text: str, keywords: list[str]) -> list[str]:
    return [item for item in keywords if item and item in (text or "")]


_CN_NUM = "一二三四五六七八九"
STEP_MARKERS = (
    [f"第{n}步" for n in [f"十{d}" for d in _CN_NUM] + ["十", *_CN_NUM]]
    + [f"第{n}" for n in [f"十{d}" for d in _CN_NUM] + ["十", *_CN_NUM]]
    + ["首先", "其次", "再次", "最后"]
)


def step_markers_in(text: str) -> list[str]:
    blob = text or ""
    found: list[str] = []
    for item in STEP_MARKERS:
        if item in blob and item not in found:
            found.append(item)
    return found


def caption_highlights(text: str, keywords: list[str] | None = None) -> list[str]:
    keys = match_highlights(text, keywords or [])
    for item in step_markers_in(text):
        if item not in keys:
            keys.append(item)
    return keys
