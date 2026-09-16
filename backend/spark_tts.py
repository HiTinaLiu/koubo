from __future__ import annotations

import gc
import sys
from pathlib import Path
from threading import Lock

from backend.applog import get_logger
from backend.audio import write_wav_pcm
from backend.config import ROOT, spark_model_dir
from backend.errors import explain_error
from backend.perf import whisper_cpu_threads
from backend.voices import CLONE_PROMPT

log = get_logger("spark")
_model = None
_lock = Lock()
_error = ""


def spark_ready() -> dict:
    from backend.models_store import torch_ready

    model_dir = spark_model_dir()
    weights = (model_dir / "LLM" / "model.safetensors").exists()
    has_torch = torch_ready()
    note = "本机无 GPU 时合成会比较慢。内置男女声不需要参考音；克隆可录自己，或上传他人音视频并填写对应文字。"
    if not weights or not has_torch:
        note = "克隆配音是可选组件，请到齿轮配置里从国内镜像下载。不装也能用微软在线配音或提词器。"
    return {
        "weights": weights,
        "torch": has_torch,
        "model_dir": str(model_dir),
        "loaded": _model is not None,
        "error": _error,
        "device": "cpu",
        "note": note,
        "clone_prompt": CLONE_PROMPT,
    }


def get_spark():
    global _model, _error
    status = spark_ready()
    if not status["weights"] or not status.get("torch", True):
        raise RuntimeError("未安装克隆配音组件")
    with _lock:
        if _model is None:
            if str(ROOT) not in sys.path:
                sys.path.insert(0, str(ROOT))
            try:
                import torch

                from sparktts.inference import SparkTTS

                torch.set_num_threads(whisper_cpu_threads())
                _model = SparkTTS(spark_model_dir(), device="cpu")
                _error = ""
            except Exception as exc:
                _error = explain_error(exc, where="Spark 模型加载失败")
                log.exception("Spark 模型加载失败")
                raise
        return _model


def unload_spark() -> bool:
    """Drop in-memory Spark weights so Remotion can use the RAM. Files on disk stay."""
    global _model
    with _lock:
        model = _model
        _model = None
    if model is None:
        return False
    try:
        del model
    except Exception:
        pass
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass
    return True


def synthesize_clone(
    text: str,
    ref_wav: Path,
    dest_wav: Path,
    prompt_text: str = "",
    max_new_tokens: int = 3000,
) -> Path:
    model = get_spark()
    wav = model.inference(
        text=text,
        prompt_speech_path=ref_wav,
        prompt_text=prompt_text or None,
        max_new_tokens=max_new_tokens,
    )
    write_wav_pcm(dest_wav, wav, model.sample_rate)
    return dest_wav


def synthesize_control(
    text: str,
    dest_wav: Path,
    gender: str,
    pitch: str = "moderate",
    speed: str = "moderate",
    max_new_tokens: int = 3000,
) -> Path:
    model = get_spark()
    wav = model.inference(
        text=text,
        gender=gender,
        pitch=pitch or "moderate",
        speed=speed or "moderate",
        max_new_tokens=max_new_tokens,
    )
    write_wav_pcm(dest_wav, wav, model.sample_rate)
    return dest_wav


def synthesize_spark(text: str, dest_wav: Path, profile: dict, max_new_tokens: int = 3000) -> Path:
    if profile.get("spark_gender"):
        return synthesize_control(
            text,
            dest_wav,
            str(profile["spark_gender"]),
            str(profile.get("spark_pitch") or "moderate"),
            str(profile.get("spark_speed") or "moderate"),
            max_new_tokens=max_new_tokens,
        )
    ref = Path(profile.get("ref_wav") or "")
    if not ref.exists():
        raise RuntimeError(f"克隆参考音不存在：{ref}")
    return synthesize_clone(
        text,
        ref,
        dest_wav,
        str(profile.get("prompt_text") or ""),
        max_new_tokens=max_new_tokens,
    )
