from __future__ import annotations

import time

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.applog import get_logger
from backend.errors import explain_error

log = get_logger("http")
_QUIET_PATHS = {"/api/ping", "/api/health"}


def install_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            log.exception("请求异常 %s %s", request.method, request.url.path)
            raise
        elapsed_ms = (time.perf_counter() - start) * 1000
        path = request.url.path
        status = response.status_code
        if path in _QUIET_PATHS and status < 400:
            return response
        line = "%s %s -> %s (%.0fms)" % (request.method, path, status, elapsed_ms)
        if status >= 500:
            log.error(line)
        elif status >= 400:
            log.warning(line)
        else:
            log.info(line)
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        log.warning("参数错误 %s %s %s", request.method, request.url.path, exc.errors())
        return await request_validation_exception_handler(request, exc)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        if exc.status_code >= 500:
            log.error("HTTP %s %s %s: %s", exc.status_code, request.method, request.url.path, exc.detail)
        else:
            log.warning("HTTP %s %s %s: %s", exc.status_code, request.method, request.url.path, exc.detail)
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(Exception)
    async def unhandled_error(request: Request, exc: Exception):
        log.exception("未处理异常 %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": explain_error(exc)})
