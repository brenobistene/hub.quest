"""Pydantic models para Micro Tasks (inbox de ideias soltas)."""
from __future__ import annotations

from pydantic import BaseModel


class MicroTaskOut(BaseModel):
    id: str
    title: str
    created_at: str


class MicroTaskCreate(BaseModel):
    title: str
