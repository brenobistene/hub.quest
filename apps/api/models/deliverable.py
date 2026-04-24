"""Pydantic models para Deliverable (entregável, filho de Project)."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class DeliverableOut(BaseModel):
    id: str
    project_id: str
    title: str
    done: bool
    sort_order: int
    estimated_minutes: Optional[int] = None
    deadline: Optional[str] = None
    # Legado (ainda persiste no DB mas não é mais incrementado).
    minutes_worked: int = 0
    # Soma dinâmica das sessões fechadas das quests done amarradas.
    executed_minutes: int = 0


class DeliverableCreate(BaseModel):
    title: str
    estimated_minutes: Optional[int] = None
    # YYYY-MM-DD, obrigatório (Pydantic devolve 422 se faltar).
    deadline: str


DELIV_COLUMNS = (
    "id, project_id, title, done, sort_order, estimated_minutes, deadline, minutes_worked"
)
