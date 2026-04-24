from fastapi import APIRouter

from services.calendar_state import GOOGLE_CALENDAR_ENABLED, calendar_state
from services.meta import API_VERSION, SERVICE_NAME

router = APIRouter()


@router.get("/api/health")
@router.get("/health")
def health():
    return {
        "ok": True,
        "service": SERVICE_NAME,
        "version": API_VERSION,
        "google_calendar_enabled": GOOGLE_CALENDAR_ENABLED,
        "google_calendar_authenticated": calendar_state.svc is not None,
    }
