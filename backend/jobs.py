from __future__ import annotations

import json
import os
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from backend.applog import get_logger
from backend.config import DATA_DIR, REMOTION_DIR
from backend.settings_store import llm_ready
from backend.schemas import WORKING_STATUSES, Job, JobHistoryItem, JobView, Review, Script, Timeline, Transcript, VisualDeck

log = get_logger("jobs")
TAKE_VIDEO = {".webm", ".mp4", ".mov", ".mkv"}

DATA_DIR.mkdir(parents=True, exist_ok=True)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def job_dir(job_id: str) -> Path:
    return DATA_DIR / job_id


def _read_json(path: Path):
    if not path.exists():
        return None
    last_error: Exception | None = None
    for attempt in range(12):
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError as exc:
            last_error = exc
            time.sleep(0.025 * (attempt + 1))
            continue
        if not raw.strip():
            time.sleep(0.025 * (attempt + 1))
            continue
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            last_error = exc
            time.sleep(0.025 * (attempt + 1))
    if last_error:
        raise last_error
    return None


def _replace_file(src: Path, dest: Path) -> None:
    last_error: Exception | None = None
    for attempt in range(8):
        try:
            os.replace(src, dest)
            return
        except PermissionError as exc:
            last_error = exc
            time.sleep(0.02 * (attempt + 1))
    if last_error:
        raise last_error


def unlink_quietly(path: Path) -> bool:
    try:
        path.unlink(missing_ok=True)
        return True
    except OSError as exc:
        log.warning("无法删除占用中的文件 %s: %s", path, exc)
        return False


def _write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    try:
        _replace_file(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def create_job(source: str, voice: str) -> Job:
    job_id = uuid4().hex[:10]
    now = utc_now()
    job = Job(
        id=job_id,
        source=source,  # type: ignore[arg-type]
        voice=voice,
        created_at=now,
        updated_at=now,
        llm_configured=llm_ready(),
    )
    path = job_dir(job_id)
    path.mkdir(parents=True, exist_ok=True)
    save_job(job)
    return job


def save_job(job: Job) -> None:
    job.updated_at = utc_now()
    job.llm_configured = llm_ready()
    _write_json(job_dir(job.id) / "job.json", job.model_dump())


def load_job(job_id: str) -> Job:
    raw = _read_json(job_dir(job_id) / "job.json")
    if not raw:
        raise FileNotFoundError(job_id)
    return Job.model_validate(raw)


def set_status(
    job_id: str,
    status: str,
    message: str = "",
    error: str | None = None,
    progress: int | None = None,
) -> Job:
    job = load_job(job_id)
    job.status = status  # type: ignore[assignment]
    job.step_message = message
    job.error = error
    if progress is not None:
        job.progress = max(0, min(100, int(progress)))
    elif status in {"transcribed", "script_ready", "draft"}:
        job.progress = 0
    elif status == "done":
        job.progress = 100
    save_job(job)
    return job


def save_transcript(job_id: str, transcript: Transcript) -> None:
    _write_json(job_dir(job_id) / "transcript.json", transcript.model_dump())


def load_transcript(job_id: str) -> Transcript | None:
    raw = _read_json(job_dir(job_id) / "transcript.json")
    return Transcript.model_validate(raw) if raw else None


def save_script(job_id: str, script: Script) -> None:
    _write_json(job_dir(job_id) / "script.json", script.model_dump())


def load_script(job_id: str) -> Script | None:
    raw = _read_json(job_dir(job_id) / "script.json")
    return Script.model_validate(raw) if raw else None


def save_timeline(job_id: str, timeline: Timeline) -> None:
    _write_json(job_dir(job_id) / "timeline.json", timeline.model_dump())


def load_timeline(job_id: str) -> Timeline | None:
    raw = _read_json(job_dir(job_id) / "timeline.json")
    return Timeline.model_validate(raw) if raw else None


def save_deck(job_id: str, deck: VisualDeck) -> None:
    _write_json(job_dir(job_id) / "deck.json", deck.model_dump())


def load_deck(job_id: str) -> VisualDeck | None:
    raw = _read_json(job_dir(job_id) / "deck.json")
    return VisualDeck.model_validate(raw) if raw else None


def save_review(job_id: str, review: Review) -> None:
    _write_json(job_dir(job_id) / "review.json", review.model_dump())


def load_review(job_id: str) -> Review | None:
    raw = _read_json(job_dir(job_id) / "review.json")
    return Review.model_validate(raw) if raw else None


def view(job_id: str) -> JobView:
    directory = job_dir(job_id)
    job = load_job(job_id)
    ready = job.status == "done"
    return JobView(
        job=job,
        transcript=load_transcript(job_id),
        script=load_script(job_id),
        timeline=load_timeline(job_id),
        has_final=ready and (directory / "final.mp4").exists(),
        has_audio=(directory / "voice.mp3").exists(),
        has_take=find_take(job_id) is not None,
        has_cover=ready and (directory / "cover.jpg").exists(),
        review=load_review(job_id),
        deck=load_deck(job_id),
    )


def list_jobs(limit: int = 200) -> list[Job]:
    jobs: list[Job] = []
    if not DATA_DIR.exists():
        return jobs
    for path in sorted(DATA_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if not (path / "job.json").exists():
            continue
        try:
            jobs.append(load_job(path.name))
        except Exception:
            continue
        if len(jobs) >= limit:
            break
    return jobs


def _job_title(job_id: str) -> str:
    script = load_script(job_id)
    if script and script.topic.strip():
        return script.topic.strip()[:40]
    if script and script.hook.strip():
        return script.hook.strip()[:40]
    return "未命名成片"


def list_history(limit: int = 200) -> list[JobHistoryItem]:
    items: list[JobHistoryItem] = []
    for job in list_jobs(limit):
        directory = job_dir(job.id)
        items.append(
            JobHistoryItem(
                id=job.id,
                status=job.status,
                title=_job_title(job.id),
                has_final=(directory / "final.mp4").exists(),
                has_audio=(directory / "voice.mp3").exists(),
                has_cover=(directory / "cover.jpg").exists(),
                source=job.source,
                orientation=job.orientation,
                created_at=job.created_at,
                updated_at=job.updated_at,
                step_message=job.step_message,
                error=job.error,
            )
        )
    return items


def delete_job(job_id: str) -> None:
    job = load_job(job_id)
    if job.status in WORKING_STATUSES:
        raise RuntimeError("任务正在处理中，不能删除")
    directory = job_dir(job_id)
    if directory.exists():
        shutil.rmtree(directory, ignore_errors=True)
    public = REMOTION_DIR / "public" / "jobs" / job_id
    if public.exists():
        shutil.rmtree(public, ignore_errors=True)
    rendered = REMOTION_DIR / "out" / f"{job_id}.mp4"
    if rendered.exists():
        rendered.unlink()


def recover_interrupted_jobs() -> None:
    for job in list_jobs():
        if job.status in WORKING_STATUSES:
            log.warning("启动时中断未完成任务 %s status=%s", job.id, job.status)
            set_status(job.id, "failed", "后端已重启", "任务被强制中断，请重试。")


def delete_jobs(job_ids: list[str]) -> tuple[int, list[str]]:
    deleted = 0
    skipped: list[str] = []
    for job_id in job_ids:
        try:
            delete_job(job_id)
            deleted += 1
        except FileNotFoundError:
            skipped.append(job_id)
        except RuntimeError:
            skipped.append(job_id)
    return deleted, skipped


def copy_into(job_id: str, src: Path, name: str) -> Path:
    dest = job_dir(job_id) / name
    shutil.copyfile(src, dest)
    return dest


def list_take_videos(job_id: str) -> list[Path]:
    directory = job_dir(job_id)
    if not directory.exists():
        return []
    found: list[Path] = []
    for path in directory.iterdir():
        if not path.is_file():
            continue
        if path.suffix.lower() not in TAKE_VIDEO:
            continue
        if path.name.startswith(".") or path.name.endswith(".tmp"):
            continue
        if path.name.lower().startswith("take"):
            found.append(path)
    return found


def find_take(job_id: str) -> Path | None:
    items = list_take_videos(job_id)
    if not items:
        return None
    return max(items, key=lambda path: path.stat().st_mtime)


def save_take(job_id: str, suffix: str, data: bytes) -> Path:
    directory = job_dir(job_id)
    directory.mkdir(parents=True, exist_ok=True)
    ext = suffix.lower() if suffix.lower() in TAKE_VIDEO else ".webm"
    tmp = directory / f".take.{uuid4().hex}{ext}"
    tmp.write_bytes(data)
    dest = directory / f"take{ext}"
    path = dest
    try:
        try:
            _replace_file(tmp, dest)
        except OSError:
            path = directory / f"take-{uuid4().hex[:8]}{ext}"
            _replace_file(tmp, path)
    finally:
        unlink_quietly(tmp)
    for leftover in list_take_videos(job_id):
        if leftover.resolve() != path.resolve():
            unlink_quietly(leftover)
    for leftover in directory.glob("talk.*"):
        unlink_quietly(leftover)
    return path
