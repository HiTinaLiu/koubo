from __future__ import annotations

import json
import os
import platform
import shutil
import tarfile
import tempfile
import threading
import urllib.request
import zipfile
from pathlib import Path

from backend.applog import get_logger
from backend.config import (
    BUNDLE_MODELS,
    CATALOG_PATH,
    CDN_BASE,
    ENGINE_ROOT,
    HF_ENDPOINT,
    PACKAGED,
    REMOTION_DIR,
    USER_FFMPEG_DIR,
    USER_MODELS,
    USER_NODE_DIR,
    python_bin,
    refresh_tool_paths,
    spark_model_dir,
    tool_path,
    whisper_model_dir,
)

NODE_MIRROR = os.getenv("NODE_MIRROR", "https://npmmirror.com/mirrors/node")
NODE_VERSION = os.getenv("KOUBO_NODE_VERSION", "v20.18.1")
GH_MIRROR = os.getenv("KOUBO_GH_MIRROR", "https://ghfast.top/").rstrip("/") + "/"

log = get_logger("models")
_lock = threading.Lock()
_state: dict[str, dict] = {}


def _catalog() -> dict:
    if CATALOG_PATH.exists():
        return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    return {
        "cdn_base": CDN_BASE,
        "hf_endpoint": HF_ENDPOINT,
        "packages": _default_packages(),
    }


def _default_packages() -> list[dict]:
    return [
        {
            "id": "whisper-base",
            "name": "转写模型",
            "summary": "faster-whisper-base，安装包会内置；缺失时可从国内镜像补下。",
            "optional": False,
            "bundled": True,
            "size_hint": "约 140 MB",
            "hf_repo": "Systran/faster-whisper-base",
            "zip_path": "faster-whisper-base.zip",
            "dest": "faster-whisper-base",
            "marker": "model.bin",
            "kind": "model",
        },
        {
            "id": "spark-tts",
            "name": "克隆配音组件",
            "summary": "Spark-TTS 权重。克隆要用约 1.2 GB 的 Wav2Vec 编码器，安装后会转成半精度并去掉说明图。不装也能用微软在线配音和提词器。",
            "optional": True,
            "bundled": False,
            "size_hint": "约 3.1 GB，精简后约 2.5 GB",
            "hf_repo": "SparkAudio/Spark-TTS-0.5B",
            "zip_path": "spark-tts-0.5b.zip",
            "dest": "Spark-TTS-0.5B",
            "marker": "LLM/model.safetensors",
            "needs_torch": True,
            "kind": "model",
        },
    ]


def _builtin_tools() -> list[dict]:
    return [
        {
            "id": "ffmpeg",
            "kind": "tool",
            "name": "ffmpeg 转码",
            "summary": "抽音、转码、成片都需要。安装包应内置；缺失时可下载到本机用户目录。",
            "optional": False,
            "bundled": True,
            "size_hint": "约 80 MB",
        },
        {
            "id": "node",
            "kind": "tool",
            "name": "Node 运行时",
            "summary": "Remotion 成片需要。安装包应内置；缺失时可在此下载。",
            "optional": False,
            "bundled": True,
            "size_hint": "约 30 MB",
        },
        {
            "id": "remotion",
            "kind": "tool",
            "name": "成片渲染器",
            "summary": "Remotion 依赖。安装包会带上；若缺失且目录可写，会执行 npm install。",
            "optional": False,
            "bundled": True,
            "size_hint": "约 200 MB",
        },
    ]


def _packages() -> list[dict]:
    catalog = _catalog()
    listed = list(catalog.get("packages") or _default_packages())
    ids = {str(item.get("id")) for item in listed}
    return [item for item in _builtin_tools() if item["id"] not in ids] + listed


def torch_ready() -> bool:
    try:
        import importlib.util

        return importlib.util.find_spec("torch") is not None
    except Exception:
        return False


def ffmpeg_ready() -> bool:
    return bool(tool_path("ffmpeg") and tool_path("ffprobe"))


def node_ready() -> bool:
    return bool(tool_path("node"))


def remotion_ready() -> bool:
    name = "remotion.cmd" if os.name == "nt" else "remotion"
    return (REMOTION_DIR / "node_modules" / ".bin" / name).exists()


def _tool_ready(package_id: str) -> bool:
    if package_id == "ffmpeg":
        return ffmpeg_ready()
    if package_id == "node":
        return node_ready()
    if package_id == "remotion":
        return remotion_ready()
    return False


def _tool_dest(package_id: str) -> Path:
    if package_id == "ffmpeg":
        return USER_FFMPEG_DIR
    if package_id == "node":
        return USER_NODE_DIR
    return REMOTION_DIR


def _pkg_dest(item: dict) -> Path:
    if item.get("kind") == "tool" or item["id"] in {"ffmpeg", "node", "remotion"}:
        return _tool_dest(str(item["id"]))
    rel = str(item.get("dest") or item["id"])
    marker = str(item.get("marker") or "")
    bundled = BUNDLE_MODELS / rel
    user = USER_MODELS / rel
    if marker and (bundled / marker).exists():
        return bundled
    if PACKAGED or item.get("optional"):
        return user
    return bundled


def _pkg_ready(item: dict) -> bool:
    if item.get("kind") == "tool" or item["id"] in {"ffmpeg", "node", "remotion"}:
        return _tool_ready(str(item["id"]))
    marker = str(item.get("marker") or "")
    dest = _pkg_dest(item)
    if marker and (dest / marker).exists():
        return True
    if item["id"] == "whisper-base":
        return (whisper_model_dir() / "model.bin").exists()
    if item["id"] == "spark-tts":
        return (spark_model_dir() / "LLM" / "model.safetensors").exists()
    return False


def _set(package_id: str, **fields) -> dict:
    current = _state.get(package_id) or {"id": package_id, "status": "idle", "progress": 0, "message": ""}
    current.update(fields)
    _state[package_id] = current
    return current


def _cdn_url(item: dict, catalog: dict) -> str:
    explicit = (os.getenv("KOUBO_CDN") or catalog.get("cdn_base") or CDN_BASE or "").strip().rstrip("/")
    zip_path = str(item.get("zip_path") or "").lstrip("/")
    if explicit and zip_path:
        return f"{explicit}/{zip_path}"
    return str(item.get("zip_url") or "").strip()


def engine_status() -> dict:
    catalog = _catalog()
    packages = []
    for item in _packages():
        job = _state.get(item["id"]) or {"status": "idle", "progress": 0, "message": ""}
        ready = _pkg_ready(item)
        torch_ok = torch_ready() if item.get("needs_torch") else True
        packages.append(
            {
                **item,
                "kind": item.get("kind") or "model",
                "ready": ready,
                "torch": torch_ok,
                "installed": ready and torch_ok,
                "status": "ready" if ready and torch_ok and job.get("status") not in {"installing", "error"} else job.get("status") or ("partial" if ready else "missing"),
                "progress": job.get("progress") or (100 if ready and torch_ok else 0),
                "message": job.get("message") or "",
                "dest": str(_pkg_dest(item)),
            }
        )
    return {
        "packaged": PACKAGED,
        "cdn": os.getenv("KOUBO_CDN") or catalog.get("cdn_base") or "",
        "hf_endpoint": catalog.get("hf_endpoint") or HF_ENDPOINT,
        "ffmpeg": ffmpeg_ready(),
        "node": node_ready(),
        "remotion": remotion_ready(),
        "whisper": (whisper_model_dir() / "model.bin").exists(),
        "spark": (spark_model_dir() / "LLM" / "model.safetensors").exists(),
        "torch": torch_ready(),
        "user_models": str(USER_MODELS),
        "packages": packages,
    }


def _download_file(url: str, dest: Path, package_id: str, start: int, span: int) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "koubo-slate/0.1"})
    with urllib.request.urlopen(req, timeout=180) as resp, dest.open("wb") as out:
        total = int(resp.headers.get("Content-Length") or 0)
        read = 0
        while True:
            chunk = resp.read(256 * 1024)
            if not chunk:
                break
            out.write(chunk)
            read += len(chunk)
            if total > 0:
                ratio = min(1.0, read / total)
                _set(package_id, progress=start + int(span * ratio), message=f"正在下载 {dest.name}")


def _download_first(urls: list[str], dest: Path, package_id: str, start: int, span: int) -> None:
    last: Exception | None = None
    for url in urls:
        url = (url or "").strip()
        if not url:
            continue
        try:
            _set(package_id, message=f"正在下载 {url.rsplit('/', 1)[-1]}")
            _download_file(url, dest, package_id, start, span)
            return
        except Exception as exc:
            last = exc
            dest.unlink(missing_ok=True)
    raise RuntimeError(str(last).strip() if last else "没有可用的下载地址")


def _copy_named(root: Path, dest: Path, names: tuple[str, ...]) -> None:
    dest.mkdir(parents=True, exist_ok=True)

    def named(name: str) -> str:
        if os.name == "nt" and not name.endswith(".exe"):
            return f"{name}.exe"
        return name

    for name in names:
        found = next(root.rglob(named(name)), None)
        if not found:
            found = next(root.rglob(name), None)
        if not found:
            continue
        target = dest / found.name
        shutil.copy2(found, target)
        if os.name != "nt":
            os.chmod(target, 0o755)


def _extract_archive(archive: Path, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as zf:
            zf.extractall(dest)
        return
    if tarfile.is_tarfile(archive):
        with tarfile.open(archive) as tf:
            tf.extractall(dest)
        return
    raise RuntimeError(f"无法解压：{archive.name}")


def _platform_node_tag() -> str:
    if os.name == "nt":
        return "win-x64"
    machine = platform.machine().lower()
    if "arm" in machine or "aarch" in machine:
        return "darwin-arm64"
    return "darwin-x64"


def _flatten_node(dest: Path) -> None:
    nested = next(dest.glob("node-*"), None)
    if not nested or not nested.is_dir():
        return
    if (dest / "node.exe").exists() or (dest / "bin" / "node").exists():
        return
    for child in nested.iterdir():
        target = dest / child.name
        if target.exists():
            continue
        shutil.move(str(child), str(target))
    shutil.rmtree(nested, ignore_errors=True)


def _install_ffmpeg(package_id: str) -> None:
    if ffmpeg_ready():
        return
    catalog = _catalog()
    explicit = (os.getenv("KOUBO_FFMPEG_URL") or "").strip()
    cdn = (os.getenv("KOUBO_CDN") or catalog.get("cdn_base") or CDN_BASE or "").strip().rstrip("/")
    zip_name = "ffmpeg-win-x64.zip" if os.name == "nt" else f"ffmpeg-{_platform_node_tag()}.zip"
    urls = [
        explicit,
        f"{cdn}/{zip_name}" if cdn else "",
    ]
    if os.name == "nt":
        urls.extend(
            [
                "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
                f"{GH_MIRROR}https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
                "https://mirror.ghproxy.com/https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
            ]
        )
    else:
        urls.extend(
            [
                "https://evermeet.cx/ffmpeg/getrelease/zip",
            ]
        )
    USER_FFMPEG_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="koubo-ffmpeg-") as tmp:
        work = Path(tmp)
        archive = work / "ffmpeg.bin"
        _set(package_id, status="installing", progress=12, message="正在下载 ffmpeg…")
        _download_first(urls, archive, package_id, 12, 55)
        extract = work / "unpack"
        _set(package_id, progress=72, message="正在解压 ffmpeg…")
        _extract_archive(archive, extract)
        _copy_named(extract, USER_FFMPEG_DIR, ("ffmpeg", "ffprobe"))
    if os.name != "nt" and not tool_path("ffprobe"):
        probe_urls = ["https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip"]
        with tempfile.TemporaryDirectory(prefix="koubo-ffprobe-") as tmp:
            work = Path(tmp)
            archive = work / "ffprobe.zip"
            _download_first(probe_urls, archive, package_id, 80, 10)
            extract = work / "unpack"
            _extract_archive(archive, extract)
            _copy_named(extract, USER_FFMPEG_DIR, ("ffprobe",))
    refresh_tool_paths()
    if not ffmpeg_ready():
        raise RuntimeError("已下载但未找到 ffmpeg / ffprobe，请检查解压结果")


def _install_node(package_id: str) -> None:
    if node_ready():
        return
    tag = _platform_node_tag()
    name = f"node-{NODE_VERSION}-{tag}.zip" if tag.startswith("win") else f"node-{NODE_VERSION}-{tag}.tar.gz"
    url = f"{NODE_MIRROR}/{NODE_VERSION}/{name}"
    USER_NODE_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="koubo-node-") as tmp:
        archive = Path(tmp) / name
        _set(package_id, status="installing", progress=12, message="正在下载 Node…")
        _download_file(url, archive, package_id, 12, 60)
        _set(package_id, progress=78, message="正在解压 Node…")
        _extract_archive(archive, USER_NODE_DIR)
        _flatten_node(USER_NODE_DIR)
    node_bin = USER_NODE_DIR / "node.exe" if os.name == "nt" else USER_NODE_DIR / "bin" / "node"
    if node_bin.exists() and os.name != "nt":
        os.chmod(node_bin, 0o755)
    refresh_tool_paths()
    if not node_ready():
        raise RuntimeError("已下载但未找到 node")


def _install_remotion(package_id: str) -> None:
    if remotion_ready():
        return
    if not REMOTION_DIR.exists():
        raise RuntimeError("未找到 remotion 目录，请重新安装应用")
    if not node_ready():
        raise RuntimeError("请先安装 Node 运行时")
    npm = tool_path("npm") or shutil.which("npm.cmd") or shutil.which("npm")
    if not npm:
        raise RuntimeError("找到了 Node，但没有 npm。请重新安装应用，或在本机安装 Node 后再试。")
    try:
        probe = REMOTION_DIR / ".koubo-write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
    except OSError as exc:
        raise RuntimeError("成片目录不可写。请重新安装应用，不要只补 Node。") from exc
    _set(package_id, status="installing", progress=20, message="正在安装 Remotion 依赖…")
    import subprocess

    env = os.environ.copy()
    env.setdefault("npm_config_registry", "https://registry.npmmirror.com")
    env.setdefault("PUPPETEER_DOWNLOAD_BASE_URL", "https://cdn.npmmirror.com/binaries/chrome-for-testing")
    result = subprocess.run(
        [npm, "install", "--omit=dev"],
        cwd=REMOTION_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "npm install 失败").strip()[-800:]
        raise RuntimeError(detail)
    if not remotion_ready():
        raise RuntimeError("npm install 完成，但仍未找到 Remotion 命令")


def _extract_zip(archive: Path, dest: Path, marker: str) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as zf:
        zf.extractall(dest)
    if (dest / marker).exists():
        return
    nested = next((path for path in dest.iterdir() if path.is_dir() and (path / marker).exists()), None)
    if nested and nested != dest:
        for child in nested.iterdir():
            target = dest / child.name
            if target.exists():
                continue
            shutil.move(str(child), str(target))


def _hf_snapshot(repo: str, dest: Path, package_id: str) -> None:
    try:
        from huggingface_hub import snapshot_download
    except ImportError as exc:
        raise RuntimeError("缺少 huggingface_hub，无法从镜像拉取模型") from exc
    dest.mkdir(parents=True, exist_ok=True)
    _set(package_id, message=f"正在从 {HF_ENDPOINT} 拉取 {repo}")
    snapshot_download(
        repo_id=repo,
        local_dir=str(dest),
        endpoint=HF_ENDPOINT,
        resume_download=True,
        ignore_patterns=["src/**", "*.md", "*.png", "*.jpg", "*.jpeg"],
    )


def _install_torch(package_id: str) -> None:
    if torch_ready():
        return
    req = ENGINE_ROOT / "requirements-spark.txt"
    if not req.exists():
        req = ENGINE_ROOT.parent / "requirements-spark.txt"
    if not req.exists():
        raise RuntimeError("找不到 requirements-spark.txt")
    _set(package_id, progress=8, message="正在安装克隆配音运行库（torch）…")
    import subprocess

    command = [
        python_bin(),
        "-m",
        "pip",
        "install",
        "-r",
        str(req),
        "-i",
        os.getenv("PIP_INDEX_URL", "https://pypi.tuna.tsinghua.edu.cn/simple"),
        "--extra-index-url",
        os.getenv("PIP_EXTRA_INDEX_URL", "https://mirrors.aliyun.com/pytorch-wheels/cpu"),
    ]
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "pip 安装失败").strip()[-800:]
        raise RuntimeError(detail)
    try:
        import importlib

        importlib.invalidate_caches()
        importlib.import_module("torch")
    except Exception as exc:
        raise RuntimeError("已安装依赖，但当前进程还加载不到 torch，请重启应用后再试。") from exc


def _run_install(package_id: str) -> None:
    item = next((row for row in _packages() if row["id"] == package_id), None)
    if not item:
        raise RuntimeError(f"未知组件：{package_id}")
    dest = _pkg_dest(item)
    marker = str(item.get("marker") or "")
    try:
        if package_id in {"ffmpeg", "node", "remotion"}:
            if package_id == "ffmpeg":
                _install_ffmpeg(package_id)
            elif package_id == "node":
                _install_node(package_id)
            else:
                _install_remotion(package_id)
            refresh_tool_paths()
            if not _tool_ready(package_id):
                raise RuntimeError("安装完成但仍未就绪")
            _set(package_id, status="ready", progress=100, message="已就绪")
            return
        if item.get("needs_torch"):
            _install_torch(package_id)
        if _pkg_ready(item) and (not item.get("needs_torch") or torch_ready()):
            _set(package_id, status="ready", progress=100, message="已就绪")
            return
        USER_MODELS.mkdir(parents=True, exist_ok=True)
        if marker and not (dest / marker).exists():
            url = _cdn_url(item, _catalog())
            if url:
                _set(package_id, status="installing", progress=18, message="正在从国内 CDN 下载…")
                with tempfile.TemporaryDirectory(prefix="koubo-model-") as tmp:
                    archive = Path(tmp) / f"{package_id}.zip"
                    _download_file(url, archive, package_id, 18, 55)
                    _set(package_id, progress=78, message="正在解压…")
                    _extract_zip(archive, dest, marker)
            elif item.get("hf_repo"):
                _set(package_id, status="installing", progress=20, message="CDN 未配置，改走 HuggingFace 国内镜像…")
                _hf_snapshot(str(item["hf_repo"]), dest, package_id)
            else:
                raise RuntimeError("未配置国内 CDN，也没有镜像仓库地址")
        if marker and not (dest / marker).exists():
            raise RuntimeError(f"下载完成但缺少 {marker}")
        if package_id == "spark-tts":
            _set(package_id, progress=92, message="正在精简克隆编码器…")
            from backend.spark_slim import slim_spark_dir

            slim_spark_dir(dest)
        _set(package_id, status="ready", progress=100, message="已就绪")
    except Exception as exc:
        log.exception("组件安装失败 id=%s", package_id)
        _set(package_id, status="error", message=str(exc).strip() or "下载失败")
        raise


def start_install(package_id: str) -> dict:
    with _lock:
        current = _state.get(package_id) or {}
        if current.get("status") == "installing":
            return engine_status()
        item = next((row for row in _packages() if row["id"] == package_id), None)
        if not item:
            raise RuntimeError(f"未知组件：{package_id}")
        if _pkg_ready(item) and (not item.get("needs_torch") or torch_ready()):
            _set(package_id, status="ready", progress=100, message="已就绪")
            return engine_status()
        _set(package_id, status="installing", progress=1, message="准备下载…")
    from backend.work_queue import submit

    submit(_run_install, package_id)
    return engine_status()


def remove_package(package_id: str) -> dict:
    item = next((row for row in _packages() if row["id"] == package_id), None)
    if not item:
        raise RuntimeError(f"未知组件：{package_id}")
    if package_id == "remotion":
        raise RuntimeError("成片渲染器请随应用安装，不能在这里卸载")
    if package_id in {"ffmpeg", "node"}:
        dest = _tool_dest(package_id)
        if dest.exists() and dest.is_dir():
            shutil.rmtree(dest, ignore_errors=True)
        refresh_tool_paths()
        _set(package_id, status="missing" if not _tool_ready(package_id) else "ready", progress=0, message="已卸载本机补装版本")
        return engine_status()
    if not PACKAGED:
        raise RuntimeError("开发目录里的模型请手动管理 pretrained_models")
    if package_id == "spark-tts":
        from backend.spark_tts import unload_spark

        unload_spark()
    dest = _pkg_dest(item)
    if dest.exists() and dest.is_dir():
        shutil.rmtree(dest, ignore_errors=True)
    _set(package_id, status="missing", progress=0, message="已卸载")
    return engine_status()
