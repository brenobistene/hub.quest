from datetime import datetime
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from services.calendar_state import GOOGLE_CALENDAR_ENABLED

router = APIRouter()


class CalendarEventRequest(BaseModel):
    quest_id: str
    title: str
    start_time: str  # ISO
    end_time: Optional[str] = None


@router.post("/api/calendar/create-event")
def create_calendar_event(body: CalendarEventRequest):
    """Stub — o sync real com Google Calendar acontece via hooks em projects/routines."""
    if not GOOGLE_CALENDAR_ENABLED:
        return {"status": "skipped", "reason": "Google Calendar not enabled"}
    return {
        "status": "created",
        "event_id": f"cal_{body.quest_id}_{int(datetime.utcnow().timestamp())}",
        "title": body.title,
        "start": body.start_time,
    }


@router.post("/api/calendar/update-event")
def update_calendar_event(event_id: str, body: dict):
    if not GOOGLE_CALENDAR_ENABLED:
        return {"status": "skipped", "reason": "Google Calendar not enabled"}
    return {"status": "updated", "event_id": event_id}


@router.delete("/api/calendar/delete-event")
def delete_calendar_event(event_id: str):
    if not GOOGLE_CALENDAR_ENABLED:
        return {"status": "skipped", "reason": "Google Calendar not enabled"}
    return {"status": "deleted", "event_id": event_id}
