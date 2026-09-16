from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

from dotenv import load_dotenv


def _env_path(name: str) -> Path | None:
    raw = os.getenv(name, "").strip()
    return Path(raw) if raw else None


def _exe(name: str) -> str:
    if sys.platform == "win32" and not name.endswith(".exe"):
        return f"{name}.exe"
    return name


ENGINE_ROOT = (_env_path("KOUBO_ENGINE") or Path(__file__).resolve().parent.parent).resolve()
USER_DATA = (_env_path("KOUBO_USER_DATA") or ENGINE_ROOT).resolve()
PACKAGED = bool(os.getenv("KOUBO_ENGINE"))
ROOT = ENGINE_ROOT

load_dotenv(ENGINE_ROOT / ".env")
load_dotenv(USER_DATA / ".env", override=True)

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
os.environ.setdefault("PIP_INDEX_URL", "https://pypi.tuna.tsinghua.edu.cn/simple")
os.environ.setdefault("PIP_EXTRA_INDEX_URL", "https://mirrors.aliyun.com/pytorch-wheels/cpu")

DATA_ROOT = USER_DATA / "data"
DATA_DIR = DATA_ROOT / "jobs"
VOICE_DIR = DATA_ROOT / "voices"
LIBRARY_DIR = DATA_ROOT / "library"
ASSET_DIR = DATA_ROOT / "assets"
PREVIEW_DIR = DATA_ROOT / "voice_previews"
LOG_DIR = USER_DATA / "logs"
LOG_FILE = LOG_DIR / "server.log"
BUNDLE_MODELS = ENGINE_ROOT / "pretrained_models"
USER_MODELS = USER_DATA / "models" if PACKAGED else BUNDLE_MODELS
REMOTION_DIR = ENGINE_ROOT / "remotion"
WEB_DIST = ENGINE_ROOT / "web" / "dist"
FFMPEG_DIR = ENGINE_ROOT / "ffmpeg"
NODE_DIR = ENGINE_ROOT / "node"
TOOLS_DIR = USER_DATA / "tools"
USER_FFMPEG_DIR = TOOLS_DIR / "ffmpeg"
USER_NODE_DIR = TOOLS_DIR / "node"
CATALOG_PATH = ENGINE_ROOT / "packaging" / "models.json"
if not CATALOG_PATH.exists():
    CATALOG_PATH = ENGINE_ROOT / "models.json"

CDN_BASE = os.getenv("KOUBO_CDN", "").strip().rstrip("/")
HF_ENDPOINT = os.getenv("HF_ENDPOINT", "https://hf-mirror.com").rstrip("/")

EDGE_TTS_VOICE = os.getenv("EDGE_TTS_VOICE", "zh-CN-XiaoxiaoNeural").strip()
API_HOST = os.getenv("API_HOST", "127.0.0.1")
API_PORT = int(os.getenv("API_PORT", "8777"))


def _marker_dir(candidates: list[Path], marker: str, fallback: Path) -> Path:
    for path in candidates:
        if (path / marker).exists():
            return path
    return fallback


def whisper_model_dir() -> Path:
    bundled = BUNDLE_MODELS / "faster-whisper-base"
    user = USER_MODELS / "faster-whisper-base"
    return _marker_dir([bundled, user], "model.bin", bundled)


def spark_model_dir() -> Path:
    user = USER_MODELS / "Spark-TTS-0.5B"
    bundled = BUNDLE_MODELS / "Spark-TTS-0.5B"
    return _marker_dir([user, bundled], "LLM/model.safetensors", user)


WHISPER_MODEL_DIR = whisper_model_dir()
SPARK_MODEL_DIR = spark_model_dir()


def _prepend_path(folder: Path) -> None:
    if not folder.exists():
        return
    current = os.environ.get("PATH", "")
    prefix = str(folder)
    if prefix.lower() in current.lower().split(os.pathsep):
        return
    os.environ["PATH"] = prefix + os.pathsep + current


def ffmpeg_roots() -> list[Path]:
    return [FFMPEG_DIR, USER_FFMPEG_DIR]


def node_roots() -> list[Path]:
    return [NODE_DIR, USER_NODE_DIR]


def tool_path_prefixes() -> list[str]:
    parts: list[str] = []
    seen: set[str] = set()
    for root in [*ffmpeg_roots(), *node_roots()]:
        candidates = [root, root / "bin", *root.glob("*/bin")]
        for folder in candidates:
            if not folder.is_dir():
                continue
            key = str(folder)
            if key.lower() in seen:
                continue
            seen.add(key.lower())
            parts.append(key)
    return parts


def refresh_tool_paths() -> None:
    for folder in tool_path_prefixes():
        _prepend_path(Path(folder))


refresh_tool_paths()


def tool_path(name: str) -> str | None:
    unix = name
    if unix.endswith(".exe") or unix.endswith(".cmd"):
        unix = unix.rsplit(".", 1)[0]
    exe = _exe(unix)
    cmd = f"{unix}.cmd"
    for root in ffmpeg_roots():
        direct = root / exe
        if direct.exists():
            return str(direct)
        nested = next(root.glob(f"*/bin/{exe}"), None)
        if nested and nested.exists():
            return str(nested)
    for root in node_roots():
        for candidate in (
            root / exe,
            root / unix,
            root / cmd,
            root / "bin" / exe,
            root / "bin" / unix,
            root / "bin" / cmd,
        ):
            if candidate.exists():
                return str(candidate)
    return shutil.which(name) or shutil.which(unix) or shutil.which(cmd)


def python_bin() -> str:
    env = os.getenv("PYTHON", "").strip()
    if env:
        return env
    if sys.platform == "win32":
        for candidate in (
            ENGINE_ROOT / "python" / "python.exe",
            ENGINE_ROOT / "python" / "Scripts" / "python.exe",
        ):
            if candidate.exists():
                return str(candidate)
    else:
        for candidate in (
            ENGINE_ROOT / "python" / "bin" / "python3",
            ENGINE_ROOT / "python" / "bin" / "python",
        ):
            if candidate.exists():
                return str(candidate)
    return sys.executable
