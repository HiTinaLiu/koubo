from __future__ import annotations

import json
from threading import Lock
from uuid import uuid4

from openai import OpenAI

from backend.config import DATA_ROOT
from backend.prompts import DEFAULT_PROMPTS, PROMPT_META

SETTINGS_PATH = DATA_ROOT / "settings.json"
_lock = Lock()

PROVIDERS = [
    {
        "id": "deepseek",
        "region": "cn",
        "name": "DeepSeek",
        "hint": "国内常用，OpenAI 兼容",
        "base_url": "https://api.deepseek.com/v1",
        "models": ["deepseek-v4-flash", "deepseek-v4-pro"],
    },
    {
        "id": "qwen",
        "region": "cn",
        "name": "通义千问",
        "hint": "阿里云 DashScope 兼容模式",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "models": [
            "qwen3.8-flash",
            "qwen3.7-plus",
            "qwen3.8-max",
            "qwen-plus",
            "qwen-turbo",
            "qwen-max",
            "qwen-long",
        ],
    },
    {
        "id": "siliconflow",
        "region": "cn",
        "name": "硅基流动",
        "hint": "可跑 DeepSeek / Qwen 等开源模型",
        "base_url": "https://api.siliconflow.cn/v1",
        "models": [
            "deepseek-ai/DeepSeek-V3.2",
            "deepseek-ai/DeepSeek-V3",
            "Qwen/Qwen3-32B",
            "Qwen/Qwen3-8B",
            "Qwen/Qwen2.5-72B-Instruct",
        ],
    },
    {
        "id": "zhipu",
        "region": "cn",
        "name": "智谱 GLM",
        "hint": "智谱开放平台",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "models": [
            "glm-4.7-flash",
            "glm-4.6",
            "glm-5",
            "glm-5.3",
            "glm-4-flash-250414",
            "glm-4-plus",
        ],
    },
    {
        "id": "moonshot",
        "region": "cn",
        "name": "Kimi / 月之暗面",
        "hint": "长文本口播改稿较稳",
        "base_url": "https://api.moonshot.cn/v1",
        "models": ["kimi-k3", "kimi-k2.6", "kimi-k2.7-code"],
    },
    {
        "id": "doubao",
        "region": "cn",
        "name": "豆包 / 火山方舟",
        "hint": "模型名常是接入点 ID，可手改",
        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
        "models": ["doubao-pro-32k", "doubao-lite-32k"],
    },
    {
        "id": "baichuan",
        "region": "cn",
        "name": "百川",
        "hint": "OpenAI 兼容",
        "base_url": "https://api.baichuan-ai.com/v1",
        "models": ["Baichuan4", "Baichuan3-Turbo"],
    },
    {
        "id": "minimax",
        "region": "cn",
        "name": "MiniMax",
        "hint": "OpenAI 兼容",
        "base_url": "https://api.minimax.chat/v1",
        "models": ["MiniMax-M2.5", "MiniMax-M2.1", "MiniMax-Text-01"],
    },
    {
        "id": "yi",
        "region": "cn",
        "name": "零一万物",
        "hint": "OpenAI 兼容",
        "base_url": "https://api.lingyiwanwu.com/v1",
        "models": ["yi-lightning", "yi-large"],
    },
    {
        "id": "stepfun",
        "region": "cn",
        "name": "阶跃星辰",
        "hint": "OpenAI 兼容",
        "base_url": "https://api.stepfun.com/v1",
        "models": ["step-2-16k", "step-1-8k"],
    },
    {
        "id": "spark",
        "region": "cn",
        "name": "讯飞星火",
        "hint": "星火 HTTP 兼容接口",
        "base_url": "https://spark-api-open.xf-yun.com/v1",
        "models": ["generalv3.5", "4.0Ultra"],
    },
    {
        "id": "openai",
        "region": "intl",
        "name": "OpenAI",
        "hint": "官方接口，需国际网络",
        "base_url": "https://api.openai.com/v1",
        "models": [
            "gpt-5-mini",
            "gpt-5",
            "gpt-4.1-mini",
            "gpt-4.1",
            "gpt-4o-mini",
            "gpt-4o",
        ],
    },
    {
        "id": "openrouter",
        "region": "intl",
        "name": "OpenRouter",
        "hint": "一个 Key 换多家模型",
        "base_url": "https://openrouter.ai/api/v1",
        "models": [
            "openai/gpt-5-mini",
            "anthropic/claude-sonnet-4.5",
            "google/gemini-3.6-flash",
            "deepseek/deepseek-chat",
        ],
    },
    {
        "id": "gemini",
        "region": "intl",
        "name": "Google Gemini",
        "hint": "官方 OpenAI 兼容入口",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "models": [
            "gemini-3.8-flash",
            "gemini-3.6-flash",
            "gemini-3.5-flash",
            "gemini-3.1-pro-preview",
        ],
    },
    {
        "id": "groq",
        "region": "intl",
        "name": "Groq",
        "hint": "速度快，适合改稿试跑",
        "base_url": "https://api.groq.com/openai/v1",
        "models": ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"],
    },
    {
        "id": "together",
        "region": "intl",
        "name": "Together AI",
        "hint": "开源模型托管",
        "base_url": "https://api.together.xyz/v1",
        "models": ["meta-llama/Llama-3.3-70B-Instruct-Turbo"],
    },
    {
        "id": "mistral",
        "region": "intl",
        "name": "Mistral",
        "hint": "欧洲常用",
        "base_url": "https://api.mistral.ai/v1",
        "models": ["mistral-small-latest", "mistral-large-latest"],
    },
    {
        "id": "custom",
        "region": "custom",
        "name": "自定义",
        "hint": "任意 OpenAI 兼容地址",
        "base_url": "",
        "models": [],
    },
]

# 已下线 / 对新用户不可用的模型 → 当前推荐 ID（读配置时自动改写并落盘）
DEPRECATED_MODELS = {
    "deepseek-chat": "deepseek-v4-flash",
    "deepseek-reasoner": "deepseek-v4-pro",
    "gemini-2.0-flash": "gemini-3.6-flash",
    "gemini-2.0-flash-001": "gemini-3.6-flash",
    "gemini-2.0-flash-lite": "gemini-3.5-flash-lite",
    "gemini-2.5-flash": "gemini-3.6-flash",
    "gemini-2.5-flash-lite": "gemini-3.5-flash-lite",
    "google/gemini-2.0-flash-001": "google/gemini-3.6-flash",
    "google/gemini-2.5-flash": "google/gemini-3.6-flash",
    "moonshot-v1-8k": "kimi-k3",
    "moonshot-v1-32k": "kimi-k3",
    "moonshot-v1-128k": "kimi-k3",
    "moonshot-v1-auto": "kimi-k3",
    "kimi-k2-0711-preview": "kimi-k3",
    "kimi-k2-0905-preview": "kimi-k3",
    "kimi-k2-turbo-preview": "kimi-k3",
    "kimi-k2.5": "kimi-k3",
    "kimi-k2-thinking": "kimi-k3",
    "glm-4-flash": "glm-4.7-flash",
    "glm-4-air": "glm-4.5-air",
    "anthropic/claude-sonnet-4": "anthropic/claude-sonnet-4.5",
}

_PROVIDER_HOSTS = (
    ("deepseek.com", "deepseek"),
    ("dashscope.aliyuncs.com", "qwen"),
    ("siliconflow.cn", "siliconflow"),
    ("bigmodel.cn", "zhipu"),
    ("moonshot.cn", "moonshot"),
    ("volces.com", "doubao"),
    ("baichuan-ai.com", "baichuan"),
    ("minimax.chat", "minimax"),
    ("lingyiwanwu.com", "yi"),
    ("stepfun.com", "stepfun"),
    ("xf-yun.com", "spark"),
    ("openai.com", "openai"),
    ("openrouter.ai", "openrouter"),
    ("generativelanguage.googleapis.com", "gemini"),
    ("groq.com", "groq"),
    ("together.xyz", "together"),
    ("mistral.ai", "mistral"),
)


def infer_provider(url: str) -> str:
    host = (url or "").lower()
    for token, provider in _PROVIDER_HOSTS:
        if token in host:
            return provider
    return "custom"


def migrate_model_id(model: str) -> str:
    """把已下线或对新用户不可用的模型名改成当前推荐 ID。"""
    name = str(model or "").strip()
    if name.startswith("models/"):
        name = name[len("models/") :]
    return DEPRECATED_MODELS.get(name, name)


def _empty() -> dict:
    return {"llm": {}, "prompts": {}, "genres": {}, "platforms": {}}


def _read() -> dict:
    if not SETTINGS_PATH.exists():
        return _empty()
    try:
        raw = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return _empty()
    if not isinstance(raw, dict):
        return _empty()
    return {
        "llm": raw.get("llm") if isinstance(raw.get("llm"), dict) else {},
        "prompts": raw.get("prompts") if isinstance(raw.get("prompts"), dict) else {},
        "genres": raw.get("genres") if isinstance(raw.get("genres"), dict) else {},
        "platforms": raw.get("platforms") if isinstance(raw.get("platforms"), dict) else {},
    }


def _write(payload: dict) -> None:
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _provider_meta(provider_id: str) -> dict:
    return next((item for item in PROVIDERS if item["id"] == provider_id), PROVIDERS[-1])


def _blank_profile() -> dict:
    return {
        "id": "",
        "name": "",
        "provider": "deepseek",
        "base_url": "https://api.deepseek.com/v1",
        "model": "deepseek-v4-flash",
        "api_key": "",
    }


def _coerce_profile(raw, default_id: str = "") -> dict | None:
    if not isinstance(raw, dict):
        return None
    url = str(raw.get("base_url") or "").strip()
    provider = str(raw.get("provider") or infer_provider(url) or "custom")
    return {
        "id": str(raw.get("id") or "").strip() or default_id or uuid4().hex[:10],
        "name": str(raw.get("name") or "").strip(),
        "provider": provider,
        "base_url": url,
        "model": migrate_model_id(str(raw.get("model") or "").strip()),
        "api_key": str(raw.get("api_key") or "").strip(),
    }


def _normalize_llm(raw_llm: dict) -> dict:
    if not isinstance(raw_llm, dict):
        return {"active_id": "", "profiles": []}
    if isinstance(raw_llm.get("profiles"), list):
        profiles = [item for item in (_coerce_profile(row) for row in raw_llm["profiles"]) if item]
        active = str(raw_llm.get("active_id") or "").strip()
        ids = {item["id"] for item in profiles}
        if profiles and active not in ids:
            active = profiles[0]["id"]
        if not profiles:
            active = ""
        return {"active_id": active, "profiles": profiles}
    migrated = _coerce_profile(raw_llm, default_id="default")
    if migrated and (migrated["api_key"] or migrated["model"] or migrated["base_url"]):
        return {"active_id": migrated["id"], "profiles": [migrated]}
    return {"active_id": "", "profiles": []}


def _profile_name(profile: dict) -> str:
    custom = str(profile.get("name") or "").strip()
    if custom:
        return custom
    meta = _provider_meta(str(profile.get("provider") or "custom"))
    model = str(profile.get("model") or "").strip()
    return f"{meta['name']} · {model}" if model else meta["name"]


def _active_profile(state: dict) -> dict:
    active_id = str(state.get("active_id") or "")
    for item in state.get("profiles") or []:
        if item["id"] == active_id:
            return item
    return _blank_profile()


def llm_config() -> dict:
    with _lock:
        raw = _read()
        state = _normalize_llm(raw.get("llm") or {})
        if raw.get("llm") != state:
            raw["llm"] = state
            _write(raw)
    return _active_profile(state)


def llm_ready() -> bool:
    return bool(llm_config().get("api_key"))


def prompt_text(key: str) -> str:
    default = DEFAULT_PROMPTS.get(key) or ""
    with _lock:
        saved = str((_read().get("prompts") or {}).get(key) or "").strip()
    return saved or default


def genre_brief(key: str, fallback: str) -> str:
    with _lock:
        saved = str((_read().get("genres") or {}).get(key) or "").strip()
    return saved or fallback


def platform_brief(key: str, fallback: str) -> str:
    with _lock:
        saved = str((_read().get("platforms") or {}).get(key) or "").strip()
    return saved or fallback


def open_llm():
    cfg = llm_config()
    if not cfg.get("api_key"):
        return None
    client = OpenAI(api_key=cfg["api_key"], base_url=cfg["base_url"] or None)
    return client, cfg["model"]


def _public_profile(profile: dict, active_id: str) -> dict:
    return {
        "id": profile["id"],
        "alias": str(profile.get("name") or ""),
        "name": _profile_name(profile),
        "provider": profile["provider"],
        "provider_name": _provider_meta(profile["provider"])["name"],
        "base_url": profile["base_url"],
        "model": profile["model"],
        "api_key_set": bool(profile.get("api_key")),
        "api_key_hint": _hint(profile.get("api_key") or ""),
        "active": bool(profile["id"]) and profile["id"] == active_id,
    }


def _hint(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "已保存"
    return f"{key[:4]}…{key[-4:]}"


def public_settings() -> dict:
    from backend.rewrite import GENRES, PLATFORMS

    with _lock:
        raw = _read()
        state = _normalize_llm(raw.get("llm") or {})
        if raw.get("llm") != state:
            raw["llm"] = state
            _write(raw)
    prompts = []
    for key, meta in PROMPT_META.items():
        current = str((raw.get("prompts") or {}).get(key) or "").strip() or DEFAULT_PROMPTS[key]
        default = DEFAULT_PROMPTS[key]
        prompts.append(
            {
                "id": key,
                "name": meta["name"],
                "hint": meta["hint"],
                "text": current,
                "default": default,
                "dirty": current.strip() != default.strip(),
            }
        )
    genres = []
    for key, meta in GENRES.items():
        current = str((raw.get("genres") or {}).get(key) or "").strip() or meta["brief"]
        genres.append(
            {
                "id": key,
                "name": meta["name"],
                "text": current,
                "default": meta["brief"],
                "dirty": current.strip() != meta["brief"].strip(),
            }
        )
    platforms = []
    for key, meta in PLATFORMS.items():
        current = str((raw.get("platforms") or {}).get(key) or "").strip() or meta["brief"]
        platforms.append(
            {
                "id": key,
                "name": meta["name"],
                "text": current,
                "default": meta["brief"],
                "dirty": current.strip() != meta["brief"].strip(),
            }
        )
    state = _normalize_llm(raw.get("llm") or {})
    active = _active_profile(state)
    return {
        "llm": {
            **_public_profile(active if active.get("id") else {**_blank_profile(), **active}, state["active_id"]),
            "label": _profile_name(active) if active.get("api_key") else "",
        },
        "profiles": [_public_profile(item, state["active_id"]) for item in state["profiles"]],
        "configured": bool(active.get("api_key")),
        "providers": PROVIDERS,
        "prompts": prompts,
        "genres": genres,
        "platforms": platforms,
    }


def _upsert_profile(state: dict, incoming: dict) -> dict:
    profiles = list(state.get("profiles") or [])
    pid = str(incoming.get("id") or "").strip()
    existing = next((item for item in profiles if item["id"] == pid), None) if pid else None
    next_key = str(incoming.get("api_key") or "").strip()
    if not next_key or next_key in {"••••", "********"}:
        next_key = existing["api_key"] if existing else ""
    provider = str(incoming.get("provider") or (existing or {}).get("provider") or "custom")
    url = str(incoming.get("base_url") or "").strip()
    if not url and existing:
        url = existing["base_url"]
    if provider != "custom":
        match = next((item for item in PROVIDERS if item["id"] == provider), None)
        if match and match["base_url"] and not incoming.get("base_url"):
            url = match["base_url"] or url
        if match and match["models"] and not str(incoming.get("model") or "").strip():
            incoming = {**incoming, "model": existing["model"] if existing and existing.get("model") else match["models"][0]}
    model = migrate_model_id(
        str(incoming.get("model") or "").strip() or (existing["model"] if existing else "")
    )
    profile = {
        "id": pid or uuid4().hex[:10],
        "name": str(incoming.get("name") or (existing or {}).get("name") or "").strip(),
        "provider": provider,
        "base_url": url,
        "model": model,
        "api_key": next_key,
    }
    if existing:
        profiles = [profile if item["id"] == profile["id"] else item for item in profiles]
    else:
        profiles.append(profile)
    activate = bool(incoming.get("activate", True))
    ids = {item["id"] for item in profiles}
    if activate:
        active_id = profile["id"]
    else:
        # 仅保存：写入本机，但不把这套设为当前使用
        active_id = str(state.get("active_id") or "")
        if active_id and active_id not in ids:
            active_id = ""
    if activate and active_id not in ids:
        active_id = profiles[0]["id"] if profiles else ""
    return {"active_id": active_id, "profiles": profiles}


def save_settings(body: dict) -> dict:
    with _lock:
        raw = _read()
        raw["llm"] = _normalize_llm(raw.get("llm") or {})
        incoming = body.get("llm") if isinstance(body.get("llm"), dict) else None
        if incoming:
            raw["llm"] = _upsert_profile(raw["llm"], incoming)
        if isinstance(body.get("prompts"), dict):
            prompts = dict(raw.get("prompts") or {})
            for key in DEFAULT_PROMPTS:
                if key in body["prompts"]:
                    text = str(body["prompts"][key] or "").strip()
                    if not text or text == DEFAULT_PROMPTS[key].strip():
                        prompts.pop(key, None)
                    else:
                        prompts[key] = text
            raw["prompts"] = prompts
        if isinstance(body.get("genres"), dict):
            from backend.rewrite import GENRES

            genres = dict(raw.get("genres") or {})
            for key, meta in GENRES.items():
                if key not in body["genres"]:
                    continue
                text = str(body["genres"][key] or "").strip()
                if not text or text == meta["brief"].strip():
                    genres.pop(key, None)
                else:
                    genres[key] = text
            raw["genres"] = genres
        if isinstance(body.get("platforms"), dict):
            from backend.rewrite import PLATFORMS

            platforms = dict(raw.get("platforms") or {})
            for key, meta in PLATFORMS.items():
                if key not in body["platforms"]:
                    continue
                text = str(body["platforms"][key] or "").strip()
                if not text or text == meta["brief"].strip():
                    platforms.pop(key, None)
                else:
                    platforms[key] = text
            raw["platforms"] = platforms
        _write(raw)
    return public_settings()


def reset_prompts(scope: str = "all") -> dict:
    with _lock:
        raw = _read()
        if scope in {"all", "prompts"}:
            raw["prompts"] = {}
        elif scope in DEFAULT_PROMPTS:
            prompts = dict(raw.get("prompts") or {})
            prompts.pop(scope, None)
            raw["prompts"] = prompts
        if scope in {"all", "genres"}:
            raw["genres"] = {}
        if scope in {"all", "platforms"}:
            raw["platforms"] = {}
        from backend.rewrite import GENRES, PLATFORMS

        if scope in GENRES:
            genres = dict(raw.get("genres") or {})
            genres.pop(scope, None)
            raw["genres"] = genres
        if scope in PLATFORMS:
            platforms = dict(raw.get("platforms") or {})
            platforms.pop(scope, None)
            raw["platforms"] = platforms
        _write(raw)
    return public_settings()


def activate_llm_profile(profile_id: str) -> dict:
    pid = str(profile_id or "").strip()
    with _lock:
        raw = _read()
        state = _normalize_llm(raw.get("llm") or {})
        if pid not in {item["id"] for item in state["profiles"]}:
            raise RuntimeError("找不到这套大模型")
        raw["llm"] = {"active_id": pid, "profiles": state["profiles"]}
        _write(raw)
    return public_settings()


def delete_llm_profile(profile_id: str) -> dict:
    pid = str(profile_id or "").strip()
    with _lock:
        raw = _read()
        state = _normalize_llm(raw.get("llm") or {})
        profiles = [item for item in state["profiles"] if item["id"] != pid]
        if len(profiles) == len(state["profiles"]):
            raise RuntimeError("找不到这套大模型")
        active = state["active_id"]
        if active == pid:
            active = profiles[0]["id"] if profiles else ""
        raw["llm"] = {"active_id": active, "profiles": profiles}
        _write(raw)
    return public_settings()


def test_llm(body: dict | None = None) -> dict:
    incoming = body if isinstance(body, dict) else {}
    cfg = llm_config()
    key = str(incoming.get("api_key") or "").strip() or cfg["api_key"]
    url = str(incoming.get("base_url") or "").strip() or cfg["base_url"]
    model = migrate_model_id(str(incoming.get("model") or "").strip() or cfg["model"])
    if not key:
        raise RuntimeError("还没有填写 API Key")
    client = OpenAI(api_key=key, base_url=url, timeout=20.0)
    response = client.chat.completions.create(
        model=model,
        temperature=0,
        messages=[{"role": "user", "content": "只回复：ok"}],
    )
    text = (response.choices[0].message.content or "").strip()
    return {"ok": True, "model": model, "reply": text[:80]}
