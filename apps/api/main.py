"""Hub Quest API — entrypoint enxuto.

Responsabilidade desse arquivo: criar o app FastAPI, configurar CORS,
registrar o startup (init DB + Google Calendar) e incluir os routers.

Toda lógica de negócio fica em `routers/` (rotas) e `services/` (helpers).
Pydantic models em `models/`.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import init_db
from routers import (
    active_session,
    areas,
    calendar,
    deliverables,
    health,
    micro_tasks,
    profile,
    projects,
    quests,
    routines,
    tasks,
)
from services.calendar_state import init_calendar_service


app = FastAPI(title="Hub Quest API", version="0.1.0")


@app.on_event("startup")
def startup():
    init_db()
    init_calendar_service()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Ordem importa só pra docs/OpenAPI; em runtime o FastAPI resolve por path.
app.include_router(health.router)
app.include_router(areas.router)
app.include_router(projects.router)
app.include_router(deliverables.router)
app.include_router(quests.router)
app.include_router(routines.router)
app.include_router(tasks.router)
app.include_router(active_session.router)
app.include_router(profile.router)
app.include_router(micro_tasks.router)
app.include_router(calendar.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
