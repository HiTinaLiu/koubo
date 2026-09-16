from __future__ import annotations

import json
import re
from collections.abc import Callable

from openai import OpenAI

from backend.applog import get_logger
from backend.keywords import clean_keywords, fill_keywords
from backend.rewrite import profile_prompt, resolve_genre, resolve_platform
from backend.schemas import Script, ScriptPlan
from backend.settings_store import open_llm, prompt_text

log = get_logger("llm")
Progress = Callable[[str, int], None]

FILLERS = [
    "嗯+",
    "啊+",
    "呃+",
    "那个",
    "就是说",
    "然后呢",
    "怎么说呢",
    "对吧",
    "你知道吧",
    "反正就是",
]

PLATFORM_CTA = {
    "douyin": "关注我，评论区说说你怎么看。",
    "xiaohongshu": "收藏这条，用得到再看。",
    "weixin": "觉得有用，转给需要的人。",
    "bilibili": "觉得有用就三连，下条拆更细。",
    "youtube_shorts": "觉得有用就关注，下条继续。",
    "instagram_reels": "先收藏，用得到再看。",
    "tiktok": "对的就关注，下条继续拆。",
    "linkedin": "你怎么看，欢迎讨论。",
}


def _extract_json(text: str) -> dict:
    raw = text.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            return json.loads(raw[start : end + 1])
        raise


def compose_narration(hook: str, body: list[str], cta: str, fallback: str = "") -> str:
    chunks: list[str] = []
    for part in [hook, *body, cta]:
        text = str(part).strip()
        if not text:
            continue
        if text[-1] not in "。！？!?":
            text += "。"
        chunks.append(text)
    return "".join(chunks) or fallback.strip()


def _letters(text: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fff]+", "", text or "")


def compose_spoken(topic: str, hook: str, body: list[str], cta: str, fallback: str = "") -> str:
    topic_text = (topic or "").strip()
    hook_text = (hook or "").strip()
    topic_key = _letters(topic_text)
    hook_key = _letters(hook_text)
    if topic_key and hook_key and (hook_key == topic_key or hook_key.startswith(topic_key)):
        return compose_narration(hook_text, body, cta, fallback)
    if topic_text:
        lead = [hook_text] if hook_text else []
        return compose_narration(topic_text, lead + list(body), cta, fallback)
    return compose_narration(hook_text, body, cta, fallback)


def _as_list(value) -> list[str]:
    if isinstance(value, str):
        return [line.strip() for line in re.split(r"[。！？\n]", value) if line.strip()]
    if not value:
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _plan_from_data(data: dict | None) -> ScriptPlan:
    raw = data or {}
    return ScriptPlan(
        angle=str(raw.get("angle") or "").strip()[:40],
        audience=str(raw.get("audience") or "").strip()[:40],
        hook_plan=str(raw.get("hook_plan") or "").strip()[:80],
        beats=_as_list(raw.get("beats"))[:16],
        cta_plan=str(raw.get("cta_plan") or "").strip()[:60],
        tone=str(raw.get("tone") or "").strip()[:24],
        platform_fit=str(raw.get("platform_fit") or "").strip()[:80],
        must_keep=_as_list(raw.get("must_keep"))[:12],
        avoid=_as_list(raw.get("avoid"))[:8],
    )


def _normalize(
    data: dict,
    transcript: str,
    engine: str,
    genre: str = "",
    platform: str = "",
    plan: ScriptPlan | None = None,
) -> Script:
    body = data.get("body") or []
    if isinstance(body, str):
        body = [line.strip() for line in re.split(r"[。！？\n]", body) if line.strip()]
    body = [str(item).strip() for item in body if str(item).strip()]
    hook = str(data.get("hook") or "").strip()
    cta = str(data.get("cta") or "").strip()
    narration = compose_narration(hook, body, cta, str(data.get("narration") or ""))
    notes = data.get("notes") or []
    if isinstance(notes, str):
        notes = [notes]
    script = Script(
        topic=str(data.get("topic") or "未命名主题").strip()[:24],
        cleaned_transcript=str(data.get("cleaned_transcript") or transcript).strip(),
        hook=hook[:48],
        body=body[:60],
        cta=cta[:36],
        narration=narration,
        engine=engine,  # type: ignore[arg-type]
        notes=[str(item).strip() for item in notes if str(item).strip()][:3],
        genre=genre,
        platform=platform,
        plan=plan,
    )
    words = clean_keywords(data.get("keywords"), script)
    if words:
        script.keywords = words
        script.keyword_engine = "llm" if engine == "llm" else "heuristic"
        return script
    return fill_keywords(script)


def _clip(text: str, limit: int) -> str:
    clean = text.strip("，、 ")
    if len(clean) <= limit:
        return clean
    window = clean[:limit]
    for sep in "，、 ":
        idx = window.rfind(sep)
        if idx >= 6:
            return window[:idx]
    return window


def script_from_transcript(transcript: str) -> Script:
    text = transcript.strip()
    bits = [part.strip("，、 ") for part in re.split(r"[。！？!?\n]", text) if part.strip("，、 ")]
    if not bits:
        bits = [text or "口播正文"]
    hook = bits[0]
    rest = bits[1:]
    cta = ""
    if rest and any(token in rest[-1] for token in ("关注", "点赞", "评论", "收藏")):
        cta = rest[-1]
        rest = rest[:-1]
    body = rest
    script = Script(
        topic="",
        cleaned_transcript=text,
        hook=hook[:80],
        body=body,
        cta=cta,
        narration=text,
        engine="manual",
        notes=["未使用 AI 改稿。口播稿就是原文，主题词可空，可直接成片。"],
    )
    return script


def heuristic_script(transcript: str, genre: str = "", platform: str = "") -> Script:
    text = transcript.strip()
    for filler in FILLERS:
        text = re.sub(filler, "", text)
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"[，,]{2,}", "，", text)
    bits = [part.strip("，、 ") for part in re.split(r"[。！？!?]", text) if part.strip("，、 ")]
    if not bits:
        bits = [transcript.strip() or "今天分享一个实用方法"]
    genre_id, genre_meta = resolve_genre(genre)
    platform_id, platform_meta = resolve_platform(platform)
    hook = _clip(bits[0], 16)
    if hook[-1:] not in "？！":
        hook = hook.rstrip("。，、") + "！"
    leftover = bits[0][len(_clip(bits[0], 16)) :].strip("，、 ")
    body = ([leftover] if leftover else []) + [item for item in bits[1:]]
    body = [item for item in body if item][:60] or bits[:1]
    cta = PLATFORM_CTA.get(platform_id, "关注我，下条继续讲。")
    plan = ScriptPlan(
        angle=f"按{genre_meta['name']}切入",
        audience=platform_meta["name"],
        hook_plan="用原文首句做结论或冲突",
        beats=bits[:4],
        cta_plan=cta,
        tone=genre_meta["name"],
        platform_fit=platform_meta["brief"][:80],
        must_keep=[],
        avoid=["编造原文没有的事实"],
    )
    return _normalize(
        {
            "topic": bits[0][:12],
            "cleaned_transcript": "。".join(bits) + "。",
            "hook": hook,
            "body": body,
            "cta": cta,
            "notes": [
                f"未配置大模型，当前是「{genre_meta['name']} · {platform_meta['name']}」规则草稿。打开右上角齿轮填写接口后，会先规划结构再写正文。"
            ],
        },
        transcript,
        "heuristic",
        genre_id,
        platform_id,
        plan,
    )


def _chat(client: OpenAI, model: str, system: str, user: str, temperature: float) -> str:
    response = client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return response.choices[0].message.content or ""


def _plan_rewrite(client: OpenAI, model: str, transcript: str, genre: dict, platform: dict) -> ScriptPlan:
    user = f"{profile_prompt(genre, platform)}\n\n原始口播：\n{transcript}"
    content = _chat(client, model, prompt_text("plan"), user, 0.4)
    return _plan_from_data(_extract_json(content))


def _write_rewrite(
    client: OpenAI,
    model: str,
    transcript: str,
    genre: dict,
    platform: dict,
    plan: ScriptPlan,
) -> dict:
    user = (
        f"{profile_prompt(genre, platform)}\n\n"
        f"规划架构：\n{plan.model_dump_json(ensure_ascii=False)}\n\n"
        f"原始口播：\n{transcript}"
    )
    content = _chat(client, model, prompt_text("write"), user, 0.6)
    return _extract_json(content)


def analyze_transcript(
    transcript: str,
    genre: str = "",
    platform: str = "",
    on_progress: Progress | None = None,
) -> Script:
    text = transcript.strip()
    if not text:
        raise ValueError("原文为空，无法改稿")
    genre_id, genre_meta = resolve_genre(genre)
    platform_id, platform_meta = resolve_platform(platform)

    def ping(message: str, progress: int) -> None:
        if on_progress:
            on_progress(message, progress)

    pair = open_llm()
    if not pair:
        return heuristic_script(text, genre_id, platform_id)

    client, model = pair
    plan = ScriptPlan()
    ping("正在规划口播结构…", 28)
    try:
        plan = _plan_rewrite(client, model, text, genre_meta, platform_meta)
    except Exception:
        log.exception("规划口播结构失败，改用规则规划")
        plan = ScriptPlan(
            angle=genre_meta["name"],
            audience=platform_meta["name"],
            hook_plan="用冲突或结论开场",
            beats=[],
            cta_plan="单一行动",
            tone=genre_meta["name"],
            platform_fit=platform_meta["name"],
            avoid=["编造事实"],
        )

    ping("正在按结构写口播正文…", 58)
    try:
        data = _write_rewrite(client, model, text, genre_meta, platform_meta, plan)
        return _normalize(data, text, "llm", genre_id, platform_id, plan)
    except Exception:
        log.exception("写口播正文失败，改用规则草稿")
        fallback = heuristic_script(text, genre_id, platform_id)
        fallback.plan = plan or fallback.plan
        fallback.notes = ["LLM 正文无法解析，已回退规则草稿。", *fallback.notes]
        return fallback
