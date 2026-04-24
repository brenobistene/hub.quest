"""Pydantic models para Task (to-do one-off)."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, field_validator

from .common import validate_priority


class TaskOut(BaseModel):
    id: str
    title: str
    scheduled_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    done: bool = False
    completed_at: Optional[str] = None
    sort_order: int = 0
    priority: str = "critical"
    description: Optional[str] = None


class TaskCreate(BaseModel):
    title: str
    priority: str
    scheduled_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    description: Optional[str] = None

    @field_validator("priority")
    @classmethod
    def _check_priority(cls, v):
        return validate_priority(v)


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    scheduled_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    done: Optional[bool] = None
    priority: Optional[str] = None
    description: Optional[str] = None

    @field_validator("priority")
    @classmethod
    def _check_priority(cls, v):
        return validate_priority(v)


TASK_COLUMNS = (
    "id, title, scheduled_date, start_time, end_time, duration_minutes, "
    "done, completed_at, sort_order, priority, description"
)


def row_to_task(row) -> dict:
    """Converte sqlite3.Row em dict com `done` booleano."""
    d = dict(row)
    d["done"] = bool(d.get("done"))
    return d
