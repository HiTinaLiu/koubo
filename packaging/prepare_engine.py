"""Assemble extraResources/engine for the Windows / Mac installer.

Does not copy Spark weights, torch, user data, or the other OS's binaries.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from urllib.request import urlretrieve

ROOT = Path(__file__).resolve().parent.parent
ENGINE = ROOT / "packaging" / "engine"
PIP_INDEX = os.getenv("PIP_INDEX_URL", "https://pypi.tuna.tsinghua.edu.cn/simple")
NODE_MIRROR = os.getenv("NODE_MIRROR", "https://npmmirror.com/mirrors/node")
NODE_VERSION = os.getenv("KOUBO_NODE_VERSION", "v20.18.1")

IGNORE = shutil.ignore_patterns(
    "__pycache__",
    "*.pyc",
    ".DS_Store",
    ".git",
    ".venv",
    "out",
    "public/jobs",
    "*.log",
)


def _copy(src: Path, dest: Path, *, ignore=None) -> None:
    if not src.exists():
        raise FileNotFoundError(src)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        shutil.copytree(src, dest, dirs_exist_ok=True, ignore=ignore or IGNORE)
    else:
        shutil.copy2(src, dest)


def _platform_tag(system: str, arch: str) -> str:
    if system == "win32":
        return "win-x64" if arch in {"x64", "amd64"} else f"win-{arch}"
    if system == "darwin":
        return "mac-arm64" if arch in {"arm64", "aarch64"} else "mac-x64"
    return f"{system}-{arch}"


def _node_url(tag: str) -> str:
    if tag == "win-x64":
        name = f"node-{NODE_VERSION}-win-x64.zip"
    elif tag == "mac-arm64":
        name = f"node-{NODE_VERSION}-darwin-arm64.tar.gz"
    elif tag == "mac-x64":
        name = f"node-{NODE_VERSION}-darwin-x64.tar.gz"
    else:
        raise RuntimeError(f"不支持的平台：{tag}")
    return f"{NODE_MIRROR}/{NODE_VERSION}/{name}"


def _extract_node(archive: Path, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    if archive.suffix == ".zip":
        with zipfile.ZipFile(archive) as zf:
            zf.extractall(dest)
        nested = next(dest.glob("node-*/node.exe"), None)
        if nested:
            shutil.copy2(nested, dest / "node.exe")
        return
    import tarfile

    with tarfile.open(archive) as tf:
        tf.extractall(dest)
    nested = next(dest.glob("node-*/bin/node"), None)
    if nested:
        bin_dir = dest / "bin"
        bin_dir.mkdir(exist_ok=True)
        shutil.copy2(nested, bin_dir / "node")
        os.chmod(bin_dir / "node", 0o755)


def copy_ffmpeg(dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    names = ("ffmpeg", "ffprobe")
    copied = False
    for name in names:
        found = shutil.which(name) or shutil.which(f"{name}.exe")
        if not found:
            continue
        target = dest / Path(found).name
        shutil.copy2(found, target)
        copied = True
    url = os.getenv("KOUBO_FFMPEG_URL", "").strip()
    if copied or not url:
        return
    archive = dest / "ffmpeg-download.bin"
    print("下载 ffmpeg…")
    urlretrieve(url, archive)
    if archive.suffix == ".zip" or zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as zf:
            zf.extractall(dest)
        archive.unlink(missing_ok=True)


def npm_ci(remotion: Path) -> None:
    env = os.environ.copy()
    env.setdefault("npm_config_registry", "https://registry.npmmirror.com")
    env.setdefault("PUPPETEER_DOWNLOAD_BASE_URL", "https://cdn.npmmirror.com/binaries/chrome-for-testing")
    npm = "npm.cmd" if os.name == "nt" else "npm"
    subprocess.check_call([npm, "install", "--omit=dev"], cwd=remotion, env=env)


def make_venv(engine: Path) -> None:
    venv = engine / "python"
    python = sys.executable
    subprocess.check_call([python, "-m", "venv", str(venv)])
    if os.name == "nt":
        pip = venv / "Scripts" / "pip.exe"
        py = venv / "Scripts" / "python.exe"
    else:
        pip = venv / "bin" / "pip"
        py = venv / "bin" / "python"
    subprocess.check_call(
        [str(pip), "install", "-r", str(ROOT / "requirements.txt"), "-i", PIP_INDEX],
    )
    print(f"Python 运行时：{py}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-python", action="store_true")
    parser.add_argument("--skip-node", action="store_true")
    parser.add_argument("--skip-remotion-install", action="store_true")
    parser.add_argument("--system", default=sys.platform)
    parser.add_argument("--arch", default="arm64" if sys.platform == "darwin" else "x64")
    args = parser.parse_args()
    tag = _platform_tag(args.system, args.arch)
    print(f"组装引擎目录 {ENGINE} （{tag}）")
    if ENGINE.exists():
        shutil.rmtree(ENGINE)
    ENGINE.mkdir(parents=True)

    _copy(ROOT / "backend", ENGINE / "backend")
    _copy(ROOT / "sparktts", ENGINE / "sparktts")
    _copy(ROOT / "requirements.txt", ENGINE / "requirements.txt")
    _copy(ROOT / "requirements-spark.txt", ENGINE / "requirements-spark.txt")
    _copy(ROOT / "packaging" / "models.json", ENGINE / "models.json")
    (ENGINE / "packaging").mkdir(exist_ok=True)
    _copy(ROOT / "packaging" / "models.json", ENGINE / "packaging" / "models.json")

    web_dist = ROOT / "web" / "dist"
    if web_dist.exists():
        _copy(web_dist, ENGINE / "web" / "dist")
    else:
        print("警告：还没有 web/dist，请先在 web/ 执行 npm run build")

    remotion_src = ROOT / "remotion"
    remotion_dest = ENGINE / "remotion"
    _copy(
        remotion_src,
        remotion_dest,
        ignore=shutil.ignore_patterns(
            "__pycache__",
            "node_modules",
            "out",
            ".git",
            "public/jobs",
        ),
    )
    (remotion_dest / "public" / "jobs").mkdir(parents=True, exist_ok=True)
    if not args.skip_remotion_install:
        npm_ci(remotion_dest)

    whisper = ROOT / "pretrained_models" / "faster-whisper-base"
    if (whisper / "model.bin").exists():
        _copy(whisper, ENGINE / "pretrained_models" / "faster-whisper-base")
    else:
        print("警告：未找到 faster-whisper-base，安装包将依赖模型商店补下")

    copy_ffmpeg(ENGINE / "ffmpeg")

    if not args.skip_node:
        url = _node_url(tag)
        print(f"下载 Node {url}")
        archive = ENGINE / Path(url).name
        urlretrieve(url, archive)
        _extract_node(archive, ENGINE / "node")
        archive.unlink(missing_ok=True)

    if not args.skip_python:
        make_venv(ENGINE)

    print("完成。不要把 Spark-TTS 或 data/ 打进安装包。")
    print("下一步：cd web && npm run pack:win  或  npm run pack:mac")


if __name__ == "__main__":
    main()
