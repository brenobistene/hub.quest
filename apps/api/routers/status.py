"""Healthcheck do servidor — status básico pra liveness probes.

Renomeado de `health` pra `status` em 2026-05-09 pra liberar o namespace
`/api/health/*` pro módulo Hub Health (ver decisão #1 do PLAN.md de Health).
"""
from fastapi import APIRouter

from services.calendar_state import GOOGLE_CALENDAR_ENABLED, calendar_state
from services.meta import API_VERSION, SERVICE_NAME

router = APIRouter()


@router.get("/api/status")
@router.get("/status")
def status():
    return {
        "ok": True,
        "service": SERVICE_NAME,
        "version": API_VERSION,
        "google_calendar_enabled": GOOGLE_CALENDAR_ENABLED,
        "google_calendar_authenticated": calendar_state.svc is not None,
    }
