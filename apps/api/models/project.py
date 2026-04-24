"""Pydantic models para Project (container estratégico)."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class ProjectOut(BaseModel):
    id: str
    title: str
    area_slug: str
    status: str
    priority: str
    deadline: Optional[str] = None
    notes: Optional[str] = None
    calendar_event_id: Optional[str] = None
    completed_at: Optional[str] = None
    archived_at: Optional[str] = None
    sort_order: int = 0


class ProjectCreate(BaseModel):
    title: str
    area_slug: str
    priority: str = "critical"
    status: str = "pending"
    deadline: Optional[str] = None
    notes: Optional[str] = None


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    area_slug: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    deadline: Optional[str] = None
    notes: Optional[str] = None
    calendar_event_id: Optional[str] = None
    completed_at: Optional[str] = None
    # archived_at = ISO string pra arquivar, None pra desarquivar. Sentinel
    # é detectado via `model_fields_set` no router.
    archived_at: Optional[str] = None


# Lista de colunas para SELECTs consistentes
PROJECT_COLUMNS = """id, title, area_slug, status, priority, deadline, notes,
                     calendar_event_id, completed_at, archived_at, sort_order"""
