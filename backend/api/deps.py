from __future__ import annotations

from fastapi import HTTPException

from backend import jobs
from backend.library import get_item
from backend.schemas import WORKING_STATUSES, Job, LibraryItem


def get_job(job_id: str) -> Job:
    try:
        return jobs.load_job(job_id)
    except FileNotFoundError as exc:
        raise HTTPException(404, "任务不存在") from exc


def require_idle(job: Job) -> None:
    if job.status in WORKING_STATUSES:
        raise HTTPException(409, "任务正在处理中")


def get_library_item(item_id: str) -> LibraryItem:
    item = get_item(item_id)
    if not item:
        raise HTTPException(404, "文稿不存在")
    return item
