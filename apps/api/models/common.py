"""Validadores e constantes compartilhadas entre Pydantic models."""
from __future__ import annotations

from typing import Optional


PRIORITIES_VALID = {"critical", "high", "medium", "low"}


def validate_priority(v: Optional[str]) -> Optional[str]:
    """Enum-like check. Accepts None (pra PATCH sem priority); rejeita strings
    fora do conjunto com mensagem explícita."""
    if v is None:
        return v
    if v not in PRIORITIES_VALID:
        raise ValueError(f"priority deve ser um de {sorted(PRIORITIES_VALID)}")
    return v


def validate_days_of_week(v: Optional[str]) -> Optional[str]:
    """days_of_week é string tipo '0,2,4' (0=seg..6=dom). Recusa não-numéricos
    ou fora de range pra não deixar filtros silenciarem bug depois."""
    if v is None or v == "":
        return v
    try:
        parts = [int(p.strip()) for p in v.split(",") if p.strip()]
    except ValueError:
        raise ValueError("days_of_week deve conter apenas inteiros separados por vírgula")
    for p in parts:
        if not (0 <= p <= 6):
            raise ValueError(f"days_of_week fora do range 0-6: {p}")
    return ",".join(str(p) for p in parts)
