from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone

from backend.applog import get_logger
from backend.schemas import PlatformPack, Review, RiskFinding, Script
from backend.settings_store import llm_ready, open_llm, prompt_text

log = get_logger("review")

PLATFORMS = ("douyin", "weixin", "xiaohongshu")
PLATFORM_NAME = {"douyin": "抖音", "weixin": "视频号", "xiaohongshu": "小红书"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def source_hash(script: Script) -> str:
    blob = "|".join([script.topic, script.hook, script.cta, script.narration, *script.body])
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()[:12]


def _text(script: Script) -> str:
    return "".join([script.topic, script.hook, script.cta, script.narration, *script.body])


def _clip(text: str, limit: int) -> str:
    clean = re.sub(r"\s+", "", (text or "").strip())
    if len(clean) <= limit:
        return clean
    window = clean[:limit]
    for sep in "，。！？、 ":
        idx = window.rfind(sep)
        if idx >= 6:
            return window[:idx]
    return window


def _tags(script: Script) -> list[str]:
    tags: list[str] = []
    for item in [*script.keywords, script.topic, "口播", "干货"]:
        word = re.sub(r"\s+", "", str(item))
        if 2 <= len(word) <= 8 and word not in tags:
            tags.append(word)
        if len(tags) >= 8:
            break
    return tags or ["口播", "干货"]


def _packs(script: Script) -> list[PlatformPack]:
    title = _clip(script.topic or script.hook, 18) or "这条口播先看结论"
    caption = (script.narration or "").strip() or f"{script.hook}{script.cta}"
    if len(caption) > 120:
        caption = _clip(caption, 100) + "。"
    if script.cta and script.cta not in caption:
        caption = f"{caption.rstrip('。')}。{script.cta}"
    cover = _clip(script.hook or script.topic, 12)
    tags = _tags(script)
    variants = {
        "douyin": title,
        "weixin": _clip(f"{title}，把方法讲清楚", 20) if len(title) < 14 else title,
        "xiaohongshu": _clip(f"{title}｜方法", 20) if "方法" not in title else title,
    }
    return [
        PlatformPack(
            platform=platform,  # type: ignore[arg-type]
            title=variants[platform],
            caption=caption,
            tags=tags[:6] if platform == "douyin" else tags,
            cover=cover,
        )
        for platform in PLATFORMS
    ]


def heuristic_review(script: Script) -> Review:
    blob = _text(script)
    narration = script.narration or blob
    findings: list[RiskFinding] = []

    def add(code: str, level: str, title: str, detail: str, suggestion: str, platforms: tuple[str, ...] = PLATFORMS):
        findings.append(
            RiskFinding(
                code=code,
                level=level,  # type: ignore[arg-type]
                platforms=list(platforms),  # type: ignore[arg-type]
                title=title,
                detail=detail,
                suggestion=suggestion,
            )
        )

    if re.search(r"(https?://|www\.|\.com|\.cn)", blob, re.I) or re.search(
        r"(加微|加v|加V|微信[：:]|私信领|扫码|二维码)", blob
    ):
        add(
            "contact",
            "block",
            "疑似站外引流",
            "稿子里出现外链、微信号或「私信领取」一类说法。",
            "改成关注、评论区提问，或说「主页看置顶」，不要留联系方式。",
        )
    if re.search(r"1[3-9]\d{9}", blob):
        add(
            "phone",
            "block",
            "含手机号",
            "正文里像有 11 位手机号，平台容易判引流。",
            "删掉号码，改成账号主页或评论区互动。",
        )
    if re.search(r"(稳赚|保本|必涨|包治|根治|药到病除|包过|保证赚钱)", blob):
        add(
            "guarantee",
            "block",
            "效果/收益承诺过满",
            "出现稳赚、包治、保本等绝对承诺。",
            "改成个人经验或「仅供参考」，不要保证结果。",
        )
    if re.search(r"(国家级|世界第一|最权威|唯一正品|祖传秘方)", blob):
        add(
            "absolute",
            "warn",
            "绝对化用词",
            "「第一 / 国家级 / 唯一」一类词在广告法口径里容易被挑。",
            "改成具体数字或可核验的方法，少用最高级。",
        )
    if re.search(r"(治疗癌症|降血糖药|荐股|内部指标|稳赚不赔)", blob):
        add(
            "sensitive",
            "warn",
            "医疗或金融敏感表述",
            "听起来像在治病或荐股。",
            "只讲自己的做法和感受，不要给出诊疗或投资建议。",
        )
    if re.match(r"^(大家好|我是)", (script.hook or "").strip()):
        add(
            "intro",
            "warn",
            "开头在做自我介绍",
            "Hook 以「大家好 / 我是」起手，前三秒容易被划走。",
            "先抛结论、冲突或数字，身份放到后面或不说。",
        )
    cta = script.cta or ""
    stacked = sum(token in f"{cta}{narration}" for token in ("关注", "点赞", "评论", "转发", "收藏"))
    if stacked >= 4:
        add(
            "cta_stack",
            "warn",
            "行动号召堆太满",
            "关注、点赞、评论、转发几乎全要，转化会散。",
            "CTA 只留一个动作，例如「关注我，下条继续讲」。",
        )
    if not (script.cta or "").strip():
        add(
            "no_cta",
            "warn",
            "没有行动号召",
            "口播结尾没有明确动作。",
            "补一句短 CTA，引导关注或评论。",
        )
    if re.search(r"(不看后悔|震惊|速进|不转不是人)", blob):
        add(
            "clickbait",
            "warn",
            "标题党口吻",
            "「震惊 / 不看后悔」在三个平台都容易降权。",
            "用具体结果或方法名做标题。",
        )
    chars = len(re.sub(r"\s+", "", narration))
    source = len(re.sub(r"\s+", "", script.cleaned_transcript or ""))
    if source >= 80 and chars < int(source * 0.55):
        add(
            "too_short",
            "warn",
            "改稿比原稿短太多",
            f"朗读稿约 {chars} 字，原稿约 {source} 字，信息量可能被砍掉了。",
            "按原稿要点补回去，篇幅应与原稿大致相当。",
        )
    elif chars < 36:
        add(
            "too_short",
            "warn",
            "口播过短",
            f"朗读稿约 {chars} 字，信息量不够。",
            "补一句方法和一句 CTA。",
        )

    blocks = sum(1 for item in findings if item.level == "block")
    warns = sum(1 for item in findings if item.level == "warn")
    if blocks:
        verdict = "block"
        summary = "有拦截项，先改稿再发。这不是法律意见，只是常见平台风控提醒。"
    elif warns:
        verdict = "revise"
        summary = "可以成片，但建议按注意项改一版再发。"
    else:
        verdict = "pass"
        summary = "规则检查未发现明显拦截项。仍请你过一遍口播和封面。"
    score = max(0, 100 - blocks * 28 - warns * 8)
    return Review(
        summary=summary,
        score=score,
        verdict=verdict,  # type: ignore[arg-type]
        findings=findings,
        packs=_packs(script),
        engine="heuristic",
        source_hash=source_hash(script),
        created_at=_now(),
    )


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


def _merge_findings(primary: list[RiskFinding], extra: list[RiskFinding]) -> list[RiskFinding]:
    seen = {item.code for item in primary}
    merged = list(primary)
    for item in extra:
        if item.code not in seen:
            merged.append(item)
            seen.add(item.code)
    return merged


def _normalize_packs(raw, fallback: list[PlatformPack]) -> list[PlatformPack]:
    by_id = {item.platform: item for item in fallback}
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            platform = str(item.get("platform") or "")
            if platform not in by_id:
                continue
            tags = item.get("tags") or []
            if isinstance(tags, str):
                tags = [part.strip().lstrip("#") for part in re.split(r"[,，\s]+", tags) if part.strip()]
            by_id[platform] = PlatformPack(  # type: ignore[index]
                platform=platform,  # type: ignore[arg-type]
                title=_clip(str(item.get("title") or by_id[platform].title), 20),
                caption=str(item.get("caption") or by_id[platform].caption).strip()[:180],
                tags=[str(tag).strip().lstrip("#") for tag in tags if str(tag).strip()][:8] or by_id[platform].tags,
                cover=_clip(str(item.get("cover") or by_id[platform].cover), 12),
            )
    return [by_id[platform] for platform in PLATFORMS]


def _message_text(message) -> str:
    content = (getattr(message, "content", None) or "").strip()
    if content:
        return content
    reasoning = (getattr(message, "reasoning_content", None) or "").strip()
    if reasoning:
        return reasoning
    return ""


def _llm_review(script: Script) -> Review | None:
    pair = open_llm()
    if not pair:
        return None
    client, model = pair
    payload = {
        "topic": script.topic,
        "hook": script.hook,
        "body": script.body,
        "cta": script.cta,
        "narration": script.narration,
        "keywords": script.keywords,
    }
    # 发布检查只要结构化 JSON；关闭思考模式，避免空 content / 超时 / 非 JSON。
    response = client.chat.completions.create(
        model=model,
        temperature=0.3,
        messages=[
            {"role": "system", "content": prompt_text("review")},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        extra_body={"thinking": {"type": "disabled"}},
    )
    raw = _message_text(response.choices[0].message)
    if not raw:
        raise RuntimeError("模型返回空内容")
    data = _extract_json(raw)
    findings: list[RiskFinding] = []
    for item in data.get("findings") or []:
        if isinstance(item, str):
            title = item.strip()
            if not title:
                continue
            findings.append(
                RiskFinding(
                    code=title[:32],
                    level="warn",
                    platforms=list(PLATFORMS),  # type: ignore[arg-type]
                    title=title[:40],
                    detail="",
                    suggestion="",
                )
            )
            continue
        if not isinstance(item, dict):
            continue
        level = item.get("level") if item.get("level") in {"block", "warn"} else "warn"
        platforms = [name for name in (item.get("platforms") or PLATFORMS) if name in PLATFORMS] or list(PLATFORMS)
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        findings.append(
            RiskFinding(
                code=str(item.get("code") or title)[:32],
                level=level,  # type: ignore[arg-type]
                platforms=platforms,  # type: ignore[arg-type]
                title=title[:40],
                detail=str(item.get("detail") or "").strip()[:200],
                suggestion=str(item.get("suggestion") or "").strip()[:200],
            )
        )
    base = heuristic_review(script)
    merged = _merge_findings(findings, [item for item in base.findings if item.level == "block"])
    blocks = sum(1 for item in merged if item.level == "block")
    warns = sum(1 for item in merged if item.level == "warn")
    if blocks:
        verdict = "block"
    elif warns:
        verdict = "revise"
    else:
        verdict = "pass"
    summary = str(data.get("summary") or "").strip() or base.summary
    return Review(
        summary=summary[:160],
        score=max(0, 100 - blocks * 28 - warns * 8),
        verdict=verdict,  # type: ignore[arg-type]
        findings=merged,
        packs=_normalize_packs(data.get("packs"), base.packs),
        engine="llm",
        source_hash=source_hash(script),
        created_at=_now(),
    )


def _short_error(exc: Exception) -> str:
    text = str(exc).strip() or exc.__class__.__name__
    text = re.sub(r"\s+", " ", text)
    if len(text) > 120:
        text = text[:117] + "…"
    return text


def build_review(script: Script) -> Review:
    if llm_ready():
        try:
            review = _llm_review(script)
            if review:
                return review
        except Exception as exc:
            log.warning("AI 发布检查失败，改用规则检查：%s", exc)
            fallback = heuristic_review(script)
            fallback.summary = f"AI 检查未成功（{_short_error(exc)}），已改用规则检查。" + fallback.summary
            return fallback
    return heuristic_review(script)


def pack_text(script: Script, review: Review) -> str:
    lines = [
        f"主题：{script.topic}",
        f"检查：{review.summary}",
        f"结论：{review.verdict} · {review.score} 分 · {review.engine}",
        "",
        "口播稿",
        script.narration or "",
        "",
    ]
    if review.findings:
        lines.append("风险项")
        for item in review.findings:
            names = "、".join(PLATFORM_NAME.get(name, name) for name in item.platforms)
            lines.append(f"- [{item.level}] {item.title}（{names}）")
            if item.detail:
                lines.append(f"  {item.detail}")
            if item.suggestion:
                lines.append(f"  建议：{item.suggestion}")
        lines.append("")
    for pack in review.packs:
        lines.append(PLATFORM_NAME.get(pack.platform, pack.platform))
        lines.append(f"标题：{pack.title}")
        lines.append(f"封面：{pack.cover}")
        lines.append(f"简介：{pack.caption}")
        lines.append("话题：" + " ".join(f"#{tag}" for tag in pack.tags))
        lines.append("")
    lines.append("不会自动发布到任何平台。把成片和这份文案复制到各平台后台即可。")
    return "\n".join(lines).strip() + "\n"
