"""Pydantic models para o user profile único."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class ProfileOut(BaseModel):
    name: str
    role: str
    avatar_url: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    avatar_url: Optional[str] = None
