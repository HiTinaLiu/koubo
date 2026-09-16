from __future__ import annotations

GENRES: dict[str, dict[str, str]] = {
    "knowledge": {
        "name": "知识科普",
        "brief": "只讲一个知识点。结构：结论 → 为什么对 → 一个生活例子 → 可记住的一句话。禁止堆概念、禁止像课堂朗读。",
    },
    "product": {
        "name": "产品介绍",
        "brief": "痛点开场，再说它解决什么、凭什么信、适合谁。不要说明书腔，不要空洞形容词，证据只用来自原文的事实。",
    },
    "opinion": {
        "name": "个人观点",
        "brief": "立场先行，给 1–2 个理由，允许犀利。不人身攻击，不装中立。结尾让观众表态。",
    },
    "news": {
        "name": "新闻资讯",
        "brief": "先说发生了什么，再说为何重要、影响谁。不编造未提供的事实、数字、来源。语气清楚，不煽情。",
    },
    "tutorial": {
        "name": "教程教学",
        "brief": "先说学会能做什么，再按步骤讲，最后补一个易错点。口播要能边听边做，步骤不超过四步。",
    },
    "story": {
        "name": "故事分享",
        "brief": "场景入画 → 转折 → 启示。像讲给朋友听，细节具体，启示只落一句，不要说教。",
    },
    "experience": {
        "name": "经验总结",
        "brief": "先亮踩坑或结果，再给可复制方法。少鸡汤，多「我后来改成怎样做」。",
    },
    "emotion": {
        "name": "情绪/情感",
        "brief": "用具体感受开场，让人觉得被说中。不贩卖焦虑，收在一个出口：被理解、被允许，或一个很小的行动。",
    },
    "marketing": {
        "name": "商业营销",
        "brief": "承诺必须可核对。禁止绝对化疗效、稳赚、第一、国家级。把利益说清楚，把对象说窄，行动要单一。",
    },
    "travel": {
        "name": "探店/旅行",
        "brief": "地点 + 一个难忘细节 + 值不值得去。少清单堆砌，多感官和判断。",
    },
    "personal_ip": {
        "name": "个人IP",
        "brief": "强化人设：我是谁、我信什么、这次经历如何证明。观众要能记住一个标签。少喊口号。",
    },
    "industry": {
        "name": "行业分析",
        "brief": "现象 → 原因 → 你的判断 → 对普通人意味着什么。克制，不装内部消息，不预测神神叨叨。",
    },
}

PLATFORMS: dict[str, dict[str, str]] = {
    "douyin": {
        "name": "抖音",
        "brief": "开头必须有冲突、数字或反常识。短句，信息密。篇幅跟原稿走，不要压成十几秒。CTA 用具体问题引评论，不说外链。",
        "duration": "与原稿相当",
    },
    "xiaohongshu": {
        "name": "小红书",
        "brief": "像跟熟人分享。干货、清单感、可收藏。语气自然，少叫卖。篇幅跟原稿走。CTA 偏收藏/去评区问。",
        "duration": "与原稿相当",
    },
    "weixin": {
        "name": "视频号",
        "brief": "稳、可信、适合转发。少夸张和网络黑话。篇幅跟原稿走。CTA 温和，像提醒家人朋友。",
        "duration": "与原稿相当",
    },
    "bilibili": {
        "name": "B站",
        "brief": "可以讲清楚。允许轻梗，但知识要立住。篇幅跟原稿走，不要为了短视频时限删要点。CTA 可用三连，不要油腻。",
        "duration": "与原稿相当",
    },
    "youtube_shorts": {
        "name": "YouTube Shorts",
        "brief": "开头就要听懂主题。句子短、适合字幕。篇幅跟原稿走。按原文语言写，不强行英文。",
        "duration": "与原稿相当",
    },
    "instagram_reels": {
        "name": "Instagram Reels",
        "brief": "一句金句可截图。节奏干脆，少口头禅。篇幅跟原稿走。按原文语言写。",
        "duration": "与原稿相当",
    },
    "tiktok": {
        "name": "TikTok",
        "brief": "强钩子、快节奏、口语。篇幅跟原稿走。按原文语言写，不硬凑英文潮流词。",
        "duration": "与原稿相当",
    },
    "linkedin": {
        "name": "LinkedIn",
        "brief": "专业克制。洞察 + 可执行建议。少梗、少感叹号堆砌。篇幅跟原稿走。CTA 邀请讨论观点。",
        "duration": "与原稿相当",
    },
}

DEFAULT_GENRE = "knowledge"
DEFAULT_PLATFORM = "douyin"


def resolve_genre(raw: str | None) -> tuple[str, dict[str, str]]:
    from backend.settings_store import genre_brief

    key = (raw or "").strip() or DEFAULT_GENRE
    if key not in GENRES:
        key = DEFAULT_GENRE
    meta = dict(GENRES[key])
    meta["brief"] = genre_brief(key, meta["brief"])
    return key, meta


def resolve_platform(raw: str | None) -> tuple[str, dict[str, str]]:
    from backend.settings_store import platform_brief

    key = (raw or "").strip() or DEFAULT_PLATFORM
    if key not in PLATFORMS:
        key = DEFAULT_PLATFORM
    meta = dict(PLATFORMS[key])
    meta["brief"] = platform_brief(key, meta["brief"])
    return key, meta


def profile_prompt(genre: dict[str, str], platform: dict[str, str]) -> str:
    return (
        f"主题类型：{genre['name']}。{genre['brief']}\n"
        f"发布平台：{platform['name']}，篇幅{platform.get('duration', '与原稿相当')}。"
        f"不要压成短视频时限。{platform['brief']}"
    )
