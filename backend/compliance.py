from __future__ import annotations

import json
import re

from backend.keywords import clean_keywords
from backend.rewrite import resolve_platform
from backend.schemas import Script
from backend.services.scripting import compose_narration
from backend.settings_store import llm_ready, open_llm, prompt_text

PROTECTED = (
    "第一步",
    "第二步",
    "第三步",
    "第四步",
    "第五步",
    "最后",
    "最近",
    "最终",
    "最初",
    "最多",
    "最少",
    "最新",
)

REPLACEMENTS: tuple[tuple[str, str], ...] = (
    ("稳赚不赔", "仅供参考"),
    ("保证赚钱", "不构成收益承诺"),
    ("药到病除", "因人而异"),
    ("无效退款", "支持售后沟通"),
    ("立即见效", "因人而异"),
    ("立刻见效", "因人而异"),
    ("马上见效", "因人而异"),
    ("100%有效", "因人而异"),
    ("百分之百", "大多数情况"),
    ("无副作用", "因人而异"),
    ("永久有效", "长期可用"),
    ("永不反弹", "尽量维持"),
    ("彻底根治", "明显改善"),
    ("彻底消除", "明显改善"),
    ("唯一正品", "正品渠道"),
    ("祖传秘方", "自己的做法"),
    ("世界第一", "表现突出"),
    ("全球第一", "表现突出"),
    ("全网第一", "很多人在用"),
    ("销量第一", "销量靠前"),
    ("第一品牌", "常见选择"),
    ("国家级认证", "相关资质"),
    ("最权威", "可核对来源"),
    ("全网最低", "价格比较友好"),
    ("史上最低", "最近优惠"),
    ("史上最强", "这次比较突出"),
    ("绝对安全", "相对稳妥"),
    ("绝对有效", "因人而异"),
    ("包治百病", "个人体验"),
    ("根治", "改善"),
    ("包治", "调理"),
    ("包过", "帮你准备"),
    ("保本", "风险自负"),
    ("必涨", "可能波动"),
    ("稳赚", "仅供参考"),
    ("国家级", "行业里常见"),
    ("世界级", "水准不错"),
    ("独一无二", "有自己的特点"),
    ("永久", "长期"),
    ("万能", "比较通用"),
    ("绝对", "尽量"),
    ("顶尖", "进阶"),
    ("顶级", "进阶"),
    ("极致", "尽量做好"),
    ("最佳", "更合适"),
    ("最优", "更合适"),
    ("最好", "更合适"),
    ("最高级", "进阶"),
    ("最便宜", "价格友好"),
    ("最低价", "价格友好"),
    ("最强", "更突出"),
    ("最快", "更省时间"),
    ("最全", "比较完整"),
    ("最有效", "更管用"),
    ("第一名", "名次靠前"),
)

_ZUI = re.compile(r"最(?!近|后|终|初|多|少)")


def _extract_json(text: str) -> dict:
    raw = (text or "").strip()
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


def _mask(text: str) -> tuple[str, list[str]]:
    held: list[str] = []
    out = text or ""
    for item in PROTECTED:
        token = f"\x00{len(held)}\x00"
        if item in out:
            out = out.replace(item, token)
            held.append(item)
    return out, held


def _unmask(text: str, held: list[str]) -> str:
    out = text
    for index, item in enumerate(held):
        out = out.replace(f"\x00{index}\x00", item)
    return out


def find_hits(text: str) -> list[str]:
    masked, _held = _mask(text or "")
    hits: list[str] = []
    for src, _dst in REPLACEMENTS:
        if src in masked and src not in hits:
            hits.append(src)
    if _ZUI.search(masked):
        hits.append("最")
    return hits


def rewrite_text(text: str) -> tuple[str, list[str]]:
    source = text or ""
    masked, held = _mask(source)
    changed: list[str] = []
    out = masked
    for src, dst in REPLACEMENTS:
        if src in out:
            out = out.replace(src, dst)
            changed.append(f"{src}→{dst}")
    out, n = _ZUI.subn("很", out)
    if n:
        changed.append("最→很")
    return _unmask(out, held), changed


def _blob(script: Script) -> str:
    return "".join([script.topic, script.hook, script.cta, script.narration, *script.body, *script.keywords])


def _note(text: str, notes: list[str]) -> list[str]:
    kept = [item for item in notes if not str(item).startswith("极限词")]
    return [text, *kept][:6]


def _apply_fields(script: Script, topic: str, hook: str, body: list[str], cta: str, narration: str, keywords: list[str] | None) -> Script:
    next_script = script.model_copy(deep=True)
    next_script.topic = topic
    next_script.hook = hook
    next_script.body = [item.strip() for item in body if str(item).strip()] or script.body
    next_script.cta = cta
    next_script.narration = narration or compose_narration(next_script)
    if keywords is not None:
        words = clean_keywords(keywords, next_script)
        if words:
            next_script.keywords = words
    next_script.narration = compose_narration(next_script)
    return next_script


def heuristic_scrub(script: Script) -> tuple[Script, list[str]]:
    topic, t_hits = rewrite_text(script.topic)
    hook, h_hits = rewrite_text(script.hook)
    cta, c_hits = rewrite_text(script.cta)
    body: list[str] = []
    b_hits: list[str] = []
    for line in script.body:
        next_line, hits = rewrite_text(line)
        body.append(next_line)
        b_hits.extend(hits)
    keywords: list[str] = []
    k_hits: list[str] = []
    for word in script.keywords:
        next_word, hits = rewrite_text(word)
        if next_word.strip():
            keywords.append(next_word.strip())
        k_hits.extend(hits)
    changed = list(dict.fromkeys([*t_hits, *h_hits, *c_hits, *b_hits, *k_hits]))
    next_script = _apply_fields(script, topic, hook, body, cta, "", keywords)
    return next_script, changed


def _llm_scrub(script: Script, platform_name: str, platform_brief: str, hits: list[str]) -> tuple[Script, list[str]] | None:
    pair = open_llm()
    if not pair:
        return None
    client, model = pair
    payload = {
        "platform": platform_name,
        "platform_brief": platform_brief,
        "hits": hits,
        "topic": script.topic,
        "hook": script.hook,
        "body": script.body,
        "cta": script.cta,
        "narration": script.narration,
        "keywords": script.keywords,
    }
    response = client.chat.completions.create(
        model=model,
        temperature=0.2,
        messages=[
            {"role": "system", "content": prompt_text("limits")},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
    )
    data = _extract_json(response.choices[0].message.content or "")
    body = data.get("body")
    if isinstance(body, str):
        body = [line.strip() for line in re.split(r"[。！？\n]", body) if line.strip()]
    if not isinstance(body, list):
        body = script.body
    body = [str(item).strip() for item in body if str(item).strip()] or script.body
    changed_raw = data.get("changed") or []
    if isinstance(changed_raw, str):
        changed_raw = [changed_raw]
    changed = [str(item).strip() for item in changed_raw if str(item).strip()]
    next_script = _apply_fields(
        script,
        str(data.get("topic") or script.topic).strip() or script.topic,
        str(data.get("hook") or script.hook).strip(),
        body,
        str(data.get("cta") or script.cta).strip(),
        str(data.get("narration") or "").strip(),
        data.get("keywords") if "keywords" in data else None,
    )
    leftover = find_hits(_blob(next_script))
    if leftover:
        next_script, extra = heuristic_scrub(next_script)
        changed = list(dict.fromkeys([*changed, *extra]))
    return next_script, changed


def scrub_limits(script: Script, platform: str = "") -> tuple[Script, str]:
    platform_id, meta = resolve_platform(platform or script.platform)
    hits = find_hits(_blob(script))
    if not hits:
        next_script = script.model_copy(deep=True)
        next_script.notes = _note("极限词：未发现常见绝对化用语。", script.notes)
        return next_script, "未发现常见极限词。"

    engine_note = "规则替换"
    next_script = script
    changed: list[str] = []
    if llm_ready():
        try:
            llm_result = _llm_scrub(script, meta["name"], meta["brief"], hits)
            if llm_result:
                next_script, changed = llm_result
                engine_note = "AI 校对"
        except Exception:
            next_script, changed = heuristic_scrub(script)
            engine_note = "AI 未成功，已用规则替换"
    if not changed:
        next_script, changed = heuristic_scrub(script)
    if not changed:
        next_script = script.model_copy(deep=True)
        next_script.notes = _note("极限词：未发现常见绝对化用语。", script.notes)
        return next_script, "未发现常见极限词。"

    detail = "、".join(changed[:8])
    next_script.notes = _note(f"极限词：已按{meta['name']}口径{engine_note}：{detail}。", next_script.notes)
    next_script.platform = next_script.platform or platform_id
    return next_script, f"已调整 {len(changed)} 处极限词。"
