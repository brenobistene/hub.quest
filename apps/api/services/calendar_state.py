"""Estado global do Google Calendar — singleton inicializado no startup.

Mantido num módulo próprio pra rotas poderem importar sem depender do
main.py (que importa as rotas). Evita ciclos de import.
"""
from __future__ import annotations

import os
from typing import Any, Optional

from dotenv import load_dotenv


load_dotenv()

GOOGLE_CALENDAR_ENABLED = os.getenv("GOOGLE_CALENDAR_ENABLED", "false").lower() == "true"
GOOGLE_CALENDAR_ID = os.getenv("GOOGLE_CALENDAR_ID", "primary")


class _CalendarRef:
    """Holder simples pro singleton. Rotas fazem `calendar_state.svc` pra ler."""
    svc: Optional[Any] = None


calendar_state = _CalendarRef()


def init_calendar_service() -> None:
    """Tenta autenticar no Google Calendar se habilitado. Falha silenciosa
    com log — o app continua funcionando sem GCal se as credenciais faltarem."""
    if not GOOGLE_CALENDAR_ENABLED:
        return
    try:
        from calendar_service import GoogleCalendarService, build_google_calendar_settings_from_env
        settings = build_google_calendar_settings_from_env()
        svc = GoogleCalendarService(settings)
        svc.authenticate(interactive=False)
        calendar_state.svc = svc
        print("Google Calendar service initialized and authenticated")
    except Exception as e:
        import traceback
        print(f"Calendar service unavailable: {e}")
        traceback.print_exc()
        calendar_state.svc = None
