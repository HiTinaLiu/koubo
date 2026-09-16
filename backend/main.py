from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.api import register_routes
from backend.api.middleware import install_middleware
from backend.applog import setup_logging
from backend.config import DATA_DIR, DATA_ROOT, LOG_FILE, WEB_DIST
from backend.jobs import recover_interrupted_jobs

log = setup_logging()

CORS_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:5179",
    "http://localhost:5179",
    "http://127.0.0.1:5288",
    "http://localhost:5288",
    "http://127.0.0.1:8777",
    "http://localhost:8777",
]


def create_app() -> FastAPI:
    application = FastAPI(title="口播场记")
    application.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_middleware(application)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DATA_ROOT.mkdir(parents=True, exist_ok=True)

    @application.on_event("startup")
    def _startup() -> None:
        log.info("后端启动 log=%s", LOG_FILE)
        recover_interrupted_jobs()

    register_routes(application)
    if (WEB_DIST / "assets").is_dir():
        application.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")
    return application


app = create_app()
