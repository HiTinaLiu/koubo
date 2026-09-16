from __future__ import annotations

from backend.config import EDGE_TTS_VOICE

# Microsoft 已下线部分中文 Neural 音色；只保留当前仍能合成的。
VOICES = [
    {"id": "zh-CN-XiaoxiaoNeural", "name": "晓晓", "gender": "女", "style": "活泼"},
    {"id": "zh-CN-XiaoyiNeural", "name": "晓伊", "gender": "女", "style": "温柔"},
    {"id": "zh-CN-YunxiaNeural", "name": "云夏", "gender": "女", "style": "娇俏"},
    {"id": "zh-CN-YunxiNeural", "name": "云希", "gender": "男", "style": "青年"},
    {"id": "zh-CN-YunyangNeural", "name": "云扬", "gender": "男", "style": "新闻"},
    {"id": "zh-CN-YunjianNeural", "name": "云健", "gender": "男", "style": "播报"},
    {"id": "zh-CN-liaoning-XiaobeiNeural", "name": "晓北", "gender": "女", "style": "东北"},
    {"id": "zh-CN-shaanxi-XiaoniNeural", "name": "晓妮", "gender": "女", "style": "陕西"},
]

VOICE_ALIASES = {
    "zh-CN-XiaohanNeural": "zh-CN-XiaoyiNeural",
    "zh-CN-XiaomoNeural": "zh-CN-XiaoxiaoNeural",
    "zh-CN-XiaoxuanNeural": "zh-CN-XiaoyiNeural",
    "zh-CN-XiaoruiNeural": "zh-CN-XiaoxiaoNeural",
    "zh-CN-XiaoshuangNeural": "zh-CN-YunxiaNeural",
    "zh-CN-YunhaoNeural": "zh-CN-YunxiNeural",
    "zh-CN-YunyeNeural": "zh-CN-YunjianNeural",
}

PREVIEW_TEXT = "这是口播场记的试听。开头三秒，先把结论说清楚。"
# Spark 在 CPU 上很慢：试听用更短句子，并限制生成长度。
SPARK_PREVIEW_TEXT = "口播场记试听。"
CLONE_PROMPT = "大家好，我是口播场记。今天用我自己的声音做一条短视频。开头三秒先抛结论，不要先介绍自己。把方法讲清楚，最后明确让人关注。"

# Spark 可控合成：不需要参考音。gender / pitch / speed 对应模型标签。
SPARK_PRESETS = [
    {
        "id": "spark-f-natural",
        "name": "星晓",
        "gender": "女",
        "style": "自然",
        "spark_gender": "female",
        "spark_pitch": "moderate",
        "spark_speed": "moderate",
    },
    {
        "id": "spark-f-warm",
        "name": "星柔",
        "gender": "女",
        "style": "温柔",
        "spark_gender": "female",
        "spark_pitch": "low",
        "spark_speed": "low",
    },
    {
        "id": "spark-f-bright",
        "name": "星清",
        "gender": "女",
        "style": "清亮",
        "spark_gender": "female",
        "spark_pitch": "high",
        "spark_speed": "moderate",
    },
    {
        "id": "spark-f-youth",
        "name": "星夏",
        "gender": "女",
        "style": "少年",
        "spark_gender": "female",
        "spark_pitch": "very_high",
        "spark_speed": "moderate",
    },
    {
        "id": "spark-f-quick",
        "name": "星利",
        "gender": "女",
        "style": "利落",
        "spark_gender": "female",
        "spark_pitch": "moderate",
        "spark_speed": "high",
    },
    {
        "id": "spark-m-natural",
        "name": "星朗",
        "gender": "男",
        "style": "自然",
        "spark_gender": "male",
        "spark_pitch": "moderate",
        "spark_speed": "moderate",
    },
    {
        "id": "spark-m-deep",
        "name": "星沉",
        "gender": "男",
        "style": "沉稳",
        "spark_gender": "male",
        "spark_pitch": "low",
        "spark_speed": "low",
    },
    {
        "id": "spark-m-bright",
        "name": "星健",
        "gender": "男",
        "style": "清亮",
        "spark_gender": "male",
        "spark_pitch": "high",
        "spark_speed": "moderate",
    },
    {
        "id": "spark-m-news",
        "name": "星播",
        "gender": "男",
        "style": "播报",
        "spark_gender": "male",
        "spark_pitch": "moderate",
        "spark_speed": "high",
    },
    {
        "id": "spark-m-low",
        "name": "星浑",
        "gender": "男",
        "style": "低沉",
        "spark_gender": "male",
        "spark_pitch": "very_low",
        "spark_speed": "low",
    },
]


def get_spark_preset(voice_id: str) -> dict | None:
    for item in SPARK_PRESETS:
        if item["id"] == voice_id:
            return {
                **item,
                "engine": "spark",
                "kind": "preset",
                "mode": "control",
            }
    return None


def known_edge_voice(voice_id: str) -> bool:
    return any(item["id"] == voice_id for item in VOICES)


def canonical_edge_voice(voice_id: str) -> str:
    if known_edge_voice(voice_id):
        return voice_id
    mapped = VOICE_ALIASES.get(voice_id, "")
    if mapped and known_edge_voice(mapped):
        return mapped
    return voice_id


def default_voice() -> str:
    wanted = canonical_edge_voice(EDGE_TTS_VOICE or VOICES[0]["id"])
    return wanted if known_edge_voice(wanted) else VOICES[0]["id"]
