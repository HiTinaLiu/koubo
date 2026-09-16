from __future__ import annotations

import threading
from collections.abc import Callable
from queue import Queue
from typing import Any

from backend.applog import get_logger
from backend.schemas import WORKING_STATUSES

log = get_logger("queue")

_jobs: Queue[tuple[str | None, Callable[..., None], tuple[Any, ...]]] = Queue()
_lock = threading.Lock()
_started = False
_current_id: str | None = None
_pending: list[str] = []


def _worker() -> None:
    global _current_id
    while True:
        job_id, fn, args = _jobs.get()
        with _lock:
            _current_id = job_id
            if job_id and job_id in _pending:
                _pending.remove(job_id)
        try:
            fn(*args)
        except Exception:
            log.exception("后台任务失败 job=%s fn=%s", job_id, getattr(fn, "__name__", fn))
        finally:
            with _lock:
                _current_id = None
            _jobs.task_done()


def _note_waiting(job_id: str) -> None:
    from backend import jobs

    try:
        job = jobs.load_job(job_id)
        if job.status in WORKING_STATUSES:
            jobs.set_status(
                job_id,
                job.status,
                "本机同时只跑一条重任务，正在排队…",
                progress=job.progress,
            )
    except Exception:
        pass


def submit(fn: Callable[..., None], *args: Any, job_id: str | None = None) -> None:
    """Run transcribe / rewrite / render / model install one at a time."""
    global _started
    with _lock:
        waiting = _current_id is not None or bool(_pending)
        if job_id:
            _pending.append(job_id)
        if not _started:
            threading.Thread(target=_worker, name="koubo-work", daemon=True).start()
            _started = True
    if waiting and job_id:
        _note_waiting(job_id)
    _jobs.put((job_id, fn, args))
