from fastapi import FastAPI

from backend.api.routes import assets, jobs, library, models, settings, spa, system, voices


def register_routes(app: FastAPI) -> None:
    for router in (
        system.router,
        settings.router,
        models.router,
        voices.router,
        jobs.router,
        library.router,
        assets.router,
        spa.router,
    ):
        app.include_router(router)
