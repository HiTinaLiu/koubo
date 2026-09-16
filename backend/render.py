from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from collections.abc import Callable
from pathlib import Path

from backend.applog import get_logger
from backend.config import PACKAGED, REMOTION_DIR, USER_DATA, tool_path, tool_path_prefixes
from backend.jobs import job_dir
from backend.perf import normalize_render_preset, remotion_concurrency, render_encode_args
from backend.schemas import Timeline

Progress = Callable[[int, int, str], None]
logger = get_logger("render")


def _npx() -> str:
    remotion = REMOTION_DIR / "node_modules" / ".bin" / ("remotion.cmd" if os.name == "nt" else "remotion")
    if remotion.exists():
        return str(remotion)
    names = ["npx.cmd", "npx"] if os.name == "nt" else ["npx"]
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    raise RuntimeError("未找到 Remotion，请先在 remotion/ 执行 npm install")


def _render_env() -> dict:
    env = os.environ.copy()
    env.setdefault("PUPPETEER_DOWNLOAD_BASE_URL", "https://cdn.npmmirror.com/binaries/chrome-for-testing")
    env.setdefault("REMOTION_BROWSER_DOWNLOAD", "true")
    extra = list(tool_path_prefixes())
    node = tool_path("node")
    if node:
        extra.append(str(Path(node).parent))
    if extra:
        env["PATH"] = os.pathsep.join(extra + [env.get("PATH", "")])
    cache = USER_DATA / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    env.setdefault("PUPPETEER_CACHE_DIR", str(cache / "chrome"))
    return env


def remotion_public_dir() -> Path:
    path = USER_DATA / "remotion-public" if PACKAGED else REMOTION_DIR / "public"
    path.mkdir(parents=True, exist_ok=True)
    return path


def stage_assets(job_id: str, timeline: Timeline) -> Path:
    src = job_dir(job_id)
    public_job = remotion_public_dir() / "jobs" / job_id
    public_job.mkdir(parents=True, exist_ok=True)
    for leftover in list(public_job.glob("bg.*")) + list(public_job.glob("bgm.*")) + list(public_job.glob("talk.*")) + list(
        public_job.glob("pagebg_*")
    ):
        leftover.unlink(missing_ok=True)
    audio_src = src / timeline.audio
    if audio_src.exists():
        shutil.copyfile(audio_src, public_job / timeline.audio)

    names: list[str] = []
    for name in (timeline.background, timeline.music, timeline.talking_head):
        if name:
            names.append(name)
    for info in (timeline.page_bgs or {}).values():
        if isinstance(info, dict):
            file_name = str(info.get("file") or "").strip()
            if file_name and file_name != "__theme__":
                names.append(file_name)
    for clip in timeline.clips or []:
        params = clip.params if isinstance(getattr(clip, "params", None), dict) else {}
        page_bg = str(params.get("pageBg") or "").strip()
        if page_bg and page_bg != "__theme__":
            names.append(page_bg)

    seen: set[str] = set()
    for name in names:
        if not name or name in seen:
            continue
        seen.add(name)
        media = src / name
        if media.exists():
            shutil.copyfile(media, public_job / name)

    props = {
        "jobId": job_id,
        "audioFile": f"jobs/{job_id}/{timeline.audio}",
        "timeline": timeline.model_dump(),
    }
    props_path = public_job / "props.json"
    payload = json.dumps(props, ensure_ascii=False)
    props_path.write_text(payload, encoding="utf-8")
    (src / "remotion-props.json").write_text(payload, encoding="utf-8")
    return props_path


def _parse_render_progress(line: str) -> tuple[int, int] | None:
    encoded = re.search(r"(?:Encoded|encoded)\s+(\d+)\s*/\s*(\d+)", line)
    if encoded:
        return int(encoded.group(1)), int(encoded.group(2))
    rendered = re.search(r"(?:Rendered|rendered)\s+(\d+)\s*/\s*(\d+)", line)
    if rendered:
        return int(rendered.group(1)), int(rendered.group(2))
    percent = re.search(r"(?:Composition|Rendering).*?(\d{1,3})\s*%", line)
    if percent:
        value = int(percent.group(1))
        return value, 100
    return None


def _render_error(log: list[str]) -> str:
    text = "".join(log).strip()
    if not text:
        return "Remotion 渲染失败"
    # 去掉 ANSI 颜色，便于界面展示
    text = re.sub(r"\x1b\[[0-9;]*m", "", text)
    markers = (
        "Could not load",
        "No frame found",
        "Compositor error",
        "An error occurred while rendering",
        "An error occurred",
        "Error:",
    )
    lower = text.lower()
    cut = -1
    for marker in markers:
        at = lower.rfind(marker.lower())
        if at > cut:
            cut = at
    snippet = text[cut:] if cut >= 0 else text
    # Remotion 有时会把 Windows 中文路径洗成 `/, "");`，补一句可读说明
    if 'Error: /, "");' in snippet or snippet.strip().startswith('Error: /, "");'):
        if "pagebg_" in text.lower() or "staticfile" in lower:
            return "成片素材未就绪（常见于单页背景未拷贝到渲染目录）。请重试成片；若仍失败，到成片页重新生成效果后再渲。"
        return "Remotion 渲染失败（路径信息被截断）。请重试成片；若反复失败，检查背景/出镜视频是否完整。"
    return snippet[-1500:].strip()


def render_video(
    job_id: str,
    timeline: Timeline,
    on_progress: Progress | None = None,
    preset: str = "standard",
) -> Path:
    if not (REMOTION_DIR / "package.json").exists():
        raise RuntimeError("未找到 remotion 项目，请先在 remotion/ 执行 npm install")
    props_path = stage_assets(job_id, timeline)
    dest = job_dir(job_id) / "final.mp4"
    dest.parent.mkdir(parents=True, exist_ok=True)
    public_dir = remotion_public_dir()
    renderer = _npx()
    quality = normalize_render_preset(preset)
    common = [
        "render",
        "src/index.ts",
        "TalkingVideo",
        str(dest),
        f"--props={props_path}",
        f"--public-dir={public_dir}",
        "--timeout=120000",
        "--overwrite",
        f"--concurrency={remotion_concurrency(quality)}",
        *render_encode_args(quality),
    ]
    if renderer.lower().endswith(("remotion", "remotion.cmd", "remotion.exe")):
        command = [renderer, *common]
    else:
        command = [renderer, "remotion", *common]
    process = subprocess.Popen(
        command,
        cwd=str(REMOTION_DIR),
        env=_render_env(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    log: list[str] = []
    assert process.stdout is not None
    for line in process.stdout:
        log.append(line)
        parsed = _parse_render_progress(line)
        if parsed and on_progress:
            done, total = parsed
            on_progress(done, max(total, 1), line.strip())
    code = process.wait(timeout=600)
    if code != 0:
        snippet = _render_error(log)
        logger.error("Remotion 失败 job=%s code=%s\n%s", job_id, code, snippet)
        raise RuntimeError(snippet)
    if not dest.exists():
        raise RuntimeError("Remotion 结束但没有生成成片文件")
    return dest
