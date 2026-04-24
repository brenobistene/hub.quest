"""Pydantic models para Quest (work item / subtarefa).

Após a refatoração Project/Quest split, quests sempre têm project_id +
deliverable_id — nunca mais existem quests-projeto.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class QuestOut(BaseModel):
    id: str
    project_id: Optional[str] = None
    title: str
    area_slug: str
    status: str
    priority: str
    deadline: Optional[str]
    estimated_minutes: Optional[int]
    next_action: Optional[str]
    description: Optional[str] = None
    deliverable_id: Optional[str] = None
    completed_at: Optional[str] = None
    # Soma de minutos das sessões fechadas (independente de status done/doing).
    # Usado pelo Dashboard pra calcular pressão ("quanto já queimei do budget").
    worked_minutes: int = 0


class QuestCreate(BaseModel):
    title: str
    area_slug: str
    project_id: str
    deliverable_id: str
    status: str = "pending"
    priority: str = "medium"
    deadline: Optional[str] = None
    estimated_minutes: Optional[int] = None
    next_action: Optional[str] = None
    description: Optional[str] = None


class QuestUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    deadline: Optional[str] = None
    estimated_minutes: Optional[int] = None
    next_action: Optional[str] = None
    description: Optional[str] = None
    deliverable_id: Optional[str] = None
    completed_at: Optional[str] = None


QUEST_COLUMNS = """id, project_id, title, area_slug, status, priority, deadline,
                   estimated_minutes, next_action, description, deliverable_id,
                   completed_at, sort_order"""
