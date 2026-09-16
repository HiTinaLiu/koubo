from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.api.dto import SettingsActivateBody, SettingsResetBody, SettingsSaveBody, SettingsTestBody
from backend.errors import explain_error
from backend.settings_store import (
    activate_llm_profile,
    delete_llm_profile,
    public_settings,
    reset_prompts,
    save_settings,
    test_llm,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
def get_settings():
    return public_settings()


@router.put("")
def put_settings(body: SettingsSaveBody):
    return save_settings(body.model_dump())


@router.post("/reset")
def reset_settings(body: SettingsResetBody | None = None):
    scope = (body.scope if body else "all") or "all"
    return reset_prompts(scope)


@router.post("/test")
def ping_llm(body: SettingsTestBody | None = None):
    try:
        return test_llm((body.model_dump() if body else None) or {})
    except Exception as exc:
        raise HTTPException(400, explain_error(exc, where="连接大模型失败")) from exc


@router.post("/cleanup")
def cleanup_workspace():
    from backend.cleanup import purge_junk

    return purge_junk()


@router.post("/llm/activate")
def activate_llm(body: SettingsActivateBody):
    try:
        return activate_llm_profile(body.id)
    except RuntimeError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.delete("/llm/{profile_id}")
def remove_llm(profile_id: str):
    try:
        return delete_llm_profile(profile_id)
    except RuntimeError as exc:
        raise HTTPException(404, str(exc)) from exc
