"""Pydantic models para Area."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class AreaOut(BaseModel):
    slug: str
    name: str
    description: Optional[str] = None
    color: str
    sort_order: int = 0


class AreaCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    slug: Optional[str] = None  # if omitted, derived from name


class AreaUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
