from __future__ import annotations

import logging
import os
import sys
from logging.handlers import RotatingFileHandler

from backend.config import LOG_DIR, LOG_FILE

LOGGER_NAME = "koubo"
_ready = False


def setup_logging() -> logging.Logger:
    global _ready
    log = logging.getLogger(LOGGER_NAME)
    if _ready and log.handlers:
        return log
    level_name = (os.getenv("KOUBO_LOG_LEVEL") or "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    log.setLevel(level)
    log.propagate = False
    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    if not any(isinstance(item, logging.StreamHandler) and not isinstance(item, RotatingFileHandler) for item in log.handlers):
        stream = logging.StreamHandler(sys.stderr)
        stream.setFormatter(formatter)
        log.addHandler(stream)
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            LOG_FILE,
            maxBytes=2 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        log.addHandler(file_handler)
    except OSError as exc:
        log.warning("无法写入日志文件 %s：%s", LOG_FILE, exc)
    logging.captureWarnings(True)
    _ready = True
    return log


def get_logger(name: str | None = None) -> logging.Logger:
    setup_logging()
    if not name:
        return logging.getLogger(LOGGER_NAME)
    return logging.getLogger(f"{LOGGER_NAME}.{name}")


def truncate_log_files() -> int:
    setup_logging()
    freed = 0
    log = logging.getLogger(LOGGER_NAME)
    for handler in list(log.handlers):
        if not isinstance(handler, RotatingFileHandler):
            continue
        handler.acquire()
        try:
            stream = handler.stream
            if stream:
                try:
                    pos = stream.tell()
                except OSError:
                    pos = 0
                stream.seek(0)
                stream.truncate()
                stream.flush()
                freed += max(0, pos)
        except OSError:
            pass
        finally:
            handler.release()
    if LOG_DIR.exists():
        for path in LOG_DIR.iterdir():
            if not path.is_file():
                continue
            name = path.name.lower()
            if name == "server.log":
                continue
            if name.startswith("server.log") or name.endswith(".log"):
                try:
                    size = path.stat().st_size
                    path.unlink()
                    freed += size
                except OSError:
                    pass
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    if not LOG_FILE.exists():
        LOG_FILE.write_text("", encoding="utf-8")
    return freed
