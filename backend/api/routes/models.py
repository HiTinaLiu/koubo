from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.models_store import engine_status, remove_package, start_install

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("")
def models_status():
    return engine_status()


@router.post("/{package_id}/install")
def models_install(package_id: str):
    try:
        return start_install(package_id)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.delete("/{package_id}")
def models_remove(package_id: str):
    try:
        return remove_package(package_id)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
