"""Pydantic models para Routine + RoutineSession."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, field_validator

from .common import validate_days_of_week, validate_priority


class RoutineOut(BaseModel):
    id: str
    title: str
    recurrence: str
    day_of_week: Optional[int] = None
    days_of_week: Optional[str] = None
    day_of_month: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    estimated_minutes: Optional[int] = None
    calendar_event_id: Optional[str] = None
    done: bool = False
    priority: str = "critical"
    description: Optional[str] = None


class RoutineCreate(BaseModel):
    title: str
    recurrence: str
    priority: str  # obrigatório na criação
    days_of_week: Optional[str] = None
    day_of_month: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    estimated_minutes: Optional[int] = None
    description: Optional[str] = None

    @field_validator("days_of_week")
    @classmethod
    def _days_of_week(cls, v):
        return validate_days_of_week(v)

    @field_validator("priority")
    @classmethod
    def _priority(cls, v):
        return validate_priority(v)


class RoutineUpdate(BaseModel):
    title: Optional[str] = None
    recurrence: Optional[str] = None
    days_of_week: Optional[str] = None
    day_of_month: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    estimated_minutes: Optional[int] = None
    priority: Optional[str] = None
    description: Optional[str] = None

    @field_validator("days_of_week")
    @classmethod
    def _days_of_week(cls, v):
        return validate_days_of_week(v)

    @field_validator("priority")
    @classmethod
    def _priority(cls, v):
        return validate_priority(v)


class RoutineSessionOut(BaseModel):
    id: int
    routine_id: str
    date: str
    session_num: int
    started_at: str
    ended_at: Optional[str] = None
