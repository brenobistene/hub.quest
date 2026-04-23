from __future__ import annotations

import uuid
import os
import re
import unicodedata
from datetime import date, datetime, timedelta
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

from db import get_conn, init_db

# Load environment variables from .env file
load_dotenv()

# Optional: Google Calendar integration
GOOGLE_CALENDAR_ENABLED = os.getenv('GOOGLE_CALENDAR_ENABLED', 'false').lower() == 'true'
GOOGLE_CALENDAR_ID = os.getenv('GOOGLE_CALENDAR_ID', 'primary')

# Global calendar service instance
cal_svc = None

app = FastAPI(title="Hub Quest API", version="0.1.0")


@app.on_event("startup")
def startup():
    global cal_svc
    init_db()
    if GOOGLE_CALENDAR_ENABLED:
        try:
            from calendar_service import GoogleCalendarService, build_google_calendar_settings_from_env
            settings = build_google_calendar_settings_from_env()
            cal_svc = GoogleCalendarService(settings)
            # Authenticate non-interactively to verify credentials are valid
            cal_svc.authenticate(interactive=False)
            print("Google Calendar service initialized and authenticated")
        except Exception as e:
            import traceback
            print(f"Calendar service unavailable: {e}")
            traceback.print_exc()
            cal_svc = None


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health ──────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"ok": True, "service": "hub-quest-api"}


# ─── Areas ───────────────────────────────────────────────────────────────────

def slugify(text: str) -> str:
    """Lowercase, strip accents, replace non-alphanumeric with hyphens."""
    nfkd = unicodedata.normalize("NFKD", text)
    ascii_only = "".join(c for c in nfkd if not unicodedata.combining(c))
    s = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_only).strip("-").lower()
    return s or "area"


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


@app.get("/api/areas", response_model=list[AreaOut])
def list_areas():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT slug, name, description, color, sort_order FROM areas ORDER BY sort_order, name"
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/areas", response_model=AreaOut, status_code=201)
def create_area(body: AreaCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, detail="name is required")

    base_slug = slugify(body.slug or name)
    with get_conn() as conn:
        # Resolve slug collision by appending a counter
        slug = base_slug
        n = 2
        while conn.execute("SELECT 1 FROM areas WHERE slug = ?", (slug,)).fetchone():
            slug = f"{base_slug}-{n}"
            n += 1

        max_sort = conn.execute("SELECT COALESCE(MAX(sort_order), 0) AS m FROM areas").fetchone()
        sort_order = (max_sort["m"] or 0) + 1
        color = (body.color or "#6b7280").strip()

        conn.execute(
            "INSERT INTO areas(slug, name, description, color, sort_order) VALUES (?, ?, ?, ?, ?)",
            (slug, name, body.description, color, sort_order),
        )
        conn.commit()
        row = conn.execute(
            "SELECT slug, name, description, color, sort_order FROM areas WHERE slug = ?",
            (slug,),
        ).fetchone()
    return dict(row)


@app.patch("/api/areas/{slug}", response_model=AreaOut)
def update_area(slug: str, body: AreaUpdate):
    fields: dict = {}
    for name in body.model_fields_set:
        fields[name] = getattr(body, name)
    if not fields:
        raise HTTPException(400, detail="Nothing to update")

    with get_conn() as conn:
        existing = conn.execute("SELECT slug FROM areas WHERE slug = ?", (slug,)).fetchone()
        if not existing:
            raise HTTPException(404, detail="Area not found")

        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE areas SET {set_clause} WHERE slug = ?",
            [*fields.values(), slug],
        )
        conn.commit()
        row = conn.execute(
            "SELECT slug, name, description, color, sort_order FROM areas WHERE slug = ?",
            (slug,),
        ).fetchone()
    return dict(row)


@app.delete("/api/areas/{slug}", status_code=204)
def delete_area(slug: str):
    with get_conn() as conn:
        existing = conn.execute("SELECT slug FROM areas WHERE slug = ?", (slug,)).fetchone()
        if not existing:
            raise HTTPException(404, detail="Area not found")

        quest_count = conn.execute(
            "SELECT COUNT(*) AS c FROM quests WHERE area_slug = ?",
            (slug,),
        ).fetchone()["c"]
        if quest_count > 0:
            raise HTTPException(
                409,
                detail=f"Área tem {quest_count} quest{'s' if quest_count != 1 else ''} vinculada{'s' if quest_count != 1 else ''}. Mova ou delete antes.",
            )

        conn.execute("DELETE FROM areas WHERE slug = ?", (slug,))
        conn.commit()
    return None


# ─── Projects ────────────────────────────────────────────────────────────────
# Projects são containers estratégicos que agrupam deliverables e quests.
# Antes compartilhavam tabela com quests (eram quests com parent_id NULL); agora
# são entidade própria, com hierarquia explícita: Área > Projeto > Entregável > Quest.

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
    sort_order: int = 0


class ProjectCreate(BaseModel):
    title: str
    area_slug: str
    priority: str = 'critical'  # obrigatório na criação mas tem default
    status: str = 'pending'
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


_PROJECT_COLUMNS = """id, title, area_slug, status, priority, deadline, notes,
                     calendar_event_id, completed_at, sort_order"""


@app.get("/api/projects", response_model=list[ProjectOut])
def list_projects(area: Optional[str] = None, status: Optional[str] = None):
    """Lista projetos. Filtros opcionais por área e status."""
    sql = f"SELECT {_PROJECT_COLUMNS} FROM projects WHERE 1=1"
    params: list = []
    if area is not None:
        sql += " AND area_slug = ?"
        params.append(area)
    if status is not None:
        sql += " AND status = ?"
        params.append(status)
    sql += " ORDER BY sort_order ASC, created_at ASC"
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: str):
    with get_conn() as conn:
        row = conn.execute(
            f"SELECT {_PROJECT_COLUMNS} FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
    if not row:
        raise HTTPException(404, detail="Project not found")
    return dict(row)


@app.post("/api/projects", response_model=ProjectOut, status_code=201)
def create_project(body: ProjectCreate):
    title = body.title.strip()
    if not title:
        raise HTTPException(400, detail="title is required")
    project_id = str(uuid.uuid4())[:8]
    now = _utcnow_iso_z()
    with get_conn() as conn:
        area = conn.execute("SELECT slug FROM areas WHERE slug = ?", (body.area_slug,)).fetchone()
        if not area:
            raise HTTPException(400, detail=f"area '{body.area_slug}' not found")
        max_sort = conn.execute("SELECT COALESCE(MAX(sort_order), 0) AS m FROM projects").fetchone()
        sort_order = (max_sort["m"] or 0) + 1
        conn.execute(
            """INSERT INTO projects
                 (id, title, area_slug, status, priority, deadline, notes,
                  sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (project_id, title, body.area_slug, body.status, body.priority,
             body.deadline, body.notes, sort_order, now, now),
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {_PROJECT_COLUMNS} FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
    return dict(row)


@app.patch("/api/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: str, body: ProjectUpdate):
    fields: dict = {}
    for name in body.model_fields_set:
        fields[name] = getattr(body, name)
    if not fields:
        raise HTTPException(400, detail="Nothing to update")

    with get_conn() as conn:
        existing = conn.execute(
            "SELECT status FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
        if not existing:
            raise HTTPException(404, detail="Project not found")

        # completed_at tracking on status transitions to/from 'done'
        if "status" in fields:
            if fields["status"] == "done" and existing["status"] != "done":
                fields["completed_at"] = _utcnow_iso_z()
            elif fields["status"] != "done" and existing["status"] == "done":
                fields["completed_at"] = None

        fields["updated_at"] = _utcnow_iso_z()
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [project_id]
        conn.execute(f"UPDATE projects SET {set_clause} WHERE id = ?", values)

        # Se a área mudou, propaga pro area_slug denormalizado das quests filhas
        if "area_slug" in fields:
            conn.execute(
                "UPDATE quests SET area_slug = ? WHERE project_id = ?",
                (fields["area_slug"], project_id),
            )

        conn.commit()

        # Sync do Google Calendar (só se habilitado). Mesma lógica que ficava em
        # update_quest — migrou pra cá porque calendar_event_id é campo de projeto.
        if cal_svc and "deadline" in fields:
            proj_row = conn.execute(
                "SELECT title, deadline, calendar_event_id FROM projects WHERE id = ?",
                (project_id,),
            ).fetchone()
            if proj_row:
                new_deadline = proj_row["deadline"]
                event_id = proj_row["calendar_event_id"]
                if new_deadline:
                    d = date.fromisoformat(new_deadline)
                    d_end = d + timedelta(days=1)
                    if event_id:
                        try:
                            cal_svc.update_event(event_id, summary=proj_row["title"], start_at=d, end_at=d_end)
                        except Exception as e:
                            print(f"Failed to update calendar event: {e}")
                    else:
                        try:
                            ev = cal_svc.create_event(summary=proj_row["title"], start_at=d, end_at=d_end)
                            conn.execute(
                                "UPDATE projects SET calendar_event_id = ? WHERE id = ?",
                                (ev.event_id, project_id),
                            )
                            conn.commit()
                        except Exception as e:
                            print(f"Failed to create calendar event: {e}")
                elif event_id:
                    try:
                        cal_svc.delete_event(event_id)
                        conn.execute(
                            "UPDATE projects SET calendar_event_id = NULL WHERE id = ?",
                            (project_id,),
                        )
                        conn.commit()
                    except Exception as e:
                        print(f"Failed to delete calendar event: {e}")

        row = conn.execute(
            f"SELECT {_PROJECT_COLUMNS} FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
    return dict(row)


@app.delete("/api/projects/{project_id}", status_code=204)
def delete_project(project_id: str):
    """Apaga o projeto. ON DELETE CASCADE remove deliverables e quests dele."""
    with get_conn() as conn:
        res = conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        if res.rowcount == 0:
            raise HTTPException(404, detail="Project not found")
        conn.commit()
    return None


# ─── Quests ──────────────────────────────────────────────────────────────────
# Quests agora são SEMPRE work items (subtarefas) — nunca projetos. Toda quest
# tem `project_id` obrigatório (pertence a um projeto) e `deliverable_id`
# obrigatório na criação (pertence a uma entrega do projeto).

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
    project_id: str  # obrigatório: toda quest pertence a um projeto
    deliverable_id: str  # obrigatório: toda quest pertence a uma entrega
    status: str = 'pending'
    priority: str = 'medium'
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


# ─── Helper Functions ────────────────────────────────────────────────────────

def _parse_iso(dt: str) -> datetime:
    """Parse ISO datetime tolerating 'Z' suffix and missing timezone.
    Legacy rows may be naive; treat them as UTC so arithmetic mixes cleanly."""
    from datetime import timezone
    if dt.endswith("Z"):
        dt = dt[:-1] + "+00:00"
    result = datetime.fromisoformat(dt)
    if result.tzinfo is None:
        result = result.replace(tzinfo=timezone.utc)
    return result


def calculate_quest_duration(conn, quest_id: str) -> int:
    """Calculate total duration in seconds for all sessions of a quest"""
    sessions = conn.execute(
        "SELECT started_at, ended_at FROM quest_sessions WHERE quest_id = ? ORDER BY session_num",
        (quest_id,)
    ).fetchall()

    total_seconds = 0
    for session in sessions:
        if session["started_at"] and session["ended_at"]:
            start = _parse_iso(session["started_at"])
            end = _parse_iso(session["ended_at"])
            total_seconds += int((end - start).total_seconds())

    return total_seconds // 60  # Convert to minutes


def find_active_session(conn, exclude_type: Optional[str] = None, exclude_id: Optional[str] = None) -> Optional[dict]:
    """
    Return the single active session across quest/task/routine, or None.
    exclude_type/exclude_id let a caller skip the session of the entity
    it's trying to start/resume (so its own sessions don't count as conflict).
    Shape: {type, id, title, started_at}
    """
    # Quest
    if not (exclude_type == "quest"):
        row = conn.execute(
            """SELECT qs.quest_id AS id, q.title, qs.started_at
               FROM quest_sessions qs JOIN quests q ON qs.quest_id = q.id
               WHERE qs.ended_at IS NULL LIMIT 1"""
        ).fetchone()
        if row:
            return {"type": "quest", "id": row["id"], "title": row["title"], "started_at": row["started_at"]}
    else:
        row = conn.execute(
            """SELECT qs.quest_id AS id, q.title, qs.started_at
               FROM quest_sessions qs JOIN quests q ON qs.quest_id = q.id
               WHERE qs.ended_at IS NULL AND qs.quest_id != ? LIMIT 1""",
            (exclude_id,)
        ).fetchone()
        if row:
            return {"type": "quest", "id": row["id"], "title": row["title"], "started_at": row["started_at"]}

    # Task
    if not (exclude_type == "task"):
        row = conn.execute(
            """SELECT ts.task_id AS id, t.title, ts.started_at
               FROM task_sessions ts JOIN tasks t ON ts.task_id = t.id
               WHERE ts.ended_at IS NULL LIMIT 1"""
        ).fetchone()
        if row:
            return {"type": "task", "id": row["id"], "title": row["title"], "started_at": row["started_at"]}
    else:
        row = conn.execute(
            """SELECT ts.task_id AS id, t.title, ts.started_at
               FROM task_sessions ts JOIN tasks t ON ts.task_id = t.id
               WHERE ts.ended_at IS NULL AND ts.task_id != ? LIMIT 1""",
            (exclude_id,)
        ).fetchone()
        if row:
            return {"type": "task", "id": row["id"], "title": row["title"], "started_at": row["started_at"]}

    # Routine
    if not (exclude_type == "routine"):
        row = conn.execute(
            """SELECT rs.routine_id AS id, r.title, rs.started_at
               FROM routine_sessions rs JOIN routines r ON rs.routine_id = r.id
               WHERE rs.ended_at IS NULL LIMIT 1"""
        ).fetchone()
        if row:
            return {"type": "routine", "id": row["id"], "title": row["title"], "started_at": row["started_at"]}
    else:
        row = conn.execute(
            """SELECT rs.routine_id AS id, r.title, rs.started_at
               FROM routine_sessions rs JOIN routines r ON rs.routine_id = r.id
               WHERE rs.ended_at IS NULL AND rs.routine_id != ? LIMIT 1""",
            (exclude_id,)
        ).fetchone()
        if row:
            return {"type": "routine", "id": row["id"], "title": row["title"], "started_at": row["started_at"]}

    return None


def _utcnow_iso_z() -> str:
    return datetime.utcnow().isoformat() + "Z"


@app.get("/api/quests", response_model=list[QuestOut])
def list_quests(
    area: Optional[str] = None,
    status: Optional[str] = None,
    project_id: Optional[str] = None,
    deliverable_id: Optional[str] = None,
):
    """Lista quests (work items — subtarefas). Projetos têm endpoint próprio em
    /api/projects. Filtros por área, status, projeto e entregável."""
    with get_conn() as conn:
        sql = """SELECT id, project_id, title, area_slug, status, priority, deadline,
                        estimated_minutes, next_action, description, deliverable_id,
                        completed_at, sort_order
                 FROM quests WHERE 1=1"""
        params: list = []
        if area:
            sql += " AND area_slug = ?"
            params.append(area)
        if status:
            sql += " AND status = ?"
            params.append(status)
        if project_id:
            sql += " AND project_id = ?"
            params.append(project_id)
        if deliverable_id:
            sql += " AND deliverable_id = ?"
            params.append(deliverable_id)

        # Quando filtrando por projeto/entrega, ordena por sort_order (usuário
        # arrastou); senão ordena por prioridade + deadline (triagem geral).
        if project_id or deliverable_id:
            sql += " ORDER BY sort_order ASC"
        else:
            sql += (
                " ORDER BY CASE priority"
                " WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,"
                " deadline ASC NULLS LAST"
            )
        rows = conn.execute(sql, params).fetchall()

        # Bulk fetch worked minutes — soma de sessões fechadas de qualquer quest,
        # independente de status (o Dashboard de pressão precisa desse total
        # pra calcular "quanto já queimei do budget"). Uma query só.
        sessions = conn.execute(
            "SELECT quest_id, started_at, ended_at FROM quest_sessions WHERE ended_at IS NOT NULL"
        ).fetchall()
        worked_sec: dict[str, int] = {}
        for s in sessions:
            try:
                st = _parse_iso(s["started_at"]).timestamp()
                en = _parse_iso(s["ended_at"]).timestamp()
                if en > st:
                    worked_sec[s["quest_id"]] = worked_sec.get(s["quest_id"], 0) + int(en - st)
            except Exception:
                continue

    result = []
    for r in rows:
        d = dict(r)
        d["worked_minutes"] = worked_sec.get(d["id"], 0) // 60
        result.append(d)
    return result


@app.post("/api/quests", response_model=QuestOut, status_code=201)
def create_quest(body: QuestCreate):
    """Cria uma quest (work item). project_id e deliverable_id são obrigatórios
    — toda quest pertence a um projeto e a uma entrega desse projeto."""
    quest_id = str(uuid.uuid4())[:8]
    now = _utcnow_iso_z()
    with get_conn() as conn:
        # Valida que o projeto existe
        project = conn.execute(
            "SELECT id FROM projects WHERE id = ?", (body.project_id,)
        ).fetchone()
        if not project:
            raise HTTPException(
                422, detail=f"Project '{body.project_id}' not found"
            )
        # Valida que o entregável pertence ao projeto
        deliv = conn.execute(
            "SELECT project_id FROM deliverables WHERE id = ?",
            (body.deliverable_id,),
        ).fetchone()
        if not deliv:
            raise HTTPException(
                422, detail=f"Deliverable '{body.deliverable_id}' not found"
            )
        if deliv["project_id"] != body.project_id:
            raise HTTPException(
                422, detail="O entregável escolhido não pertence a esse projeto.",
            )
        conn.execute(
            """INSERT INTO quests
               (id, project_id, title, area_slug, status, priority, deadline,
                estimated_minutes, next_action, description, deliverable_id,
                created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (quest_id, body.project_id, body.title, body.area_slug, body.status,
             body.priority, body.deadline, body.estimated_minutes,
             body.next_action, body.description, body.deliverable_id, now, now),
        )
        conn.commit()
        row = conn.execute(
            """SELECT id, project_id, title, area_slug, status, priority, deadline,
                      estimated_minutes, next_action, description, deliverable_id,
                      completed_at, sort_order
               FROM quests WHERE id = ?""",
            (quest_id,),
        ).fetchone()
    d = dict(row)
    d["worked_minutes"] = 0
    return d


@app.patch("/api/quests/{quest_id}", response_model=QuestOut)
def update_quest(quest_id: str, body: QuestUpdate):
    """Atualiza uma quest (subtarefa). Campos de projeto (notes, calendar_event_id)
    não existem mais aqui — vão no endpoint de projects."""
    fields: dict = {}
    for field_name in body.model_fields_set:
        fields[field_name] = getattr(body, field_name)
    if not fields:
        raise HTTPException(400, detail="Nothing to update")
    fields["updated_at"] = _utcnow_iso_z()
    with get_conn() as conn:
        # Subtarefa sempre tem deliverable — não pode virar `None`.
        if "deliverable_id" in fields and fields["deliverable_id"] is None:
            raise HTTPException(
                422, detail="Quest precisa estar amarrada a um entregável.",
            )
        # Se trocando pra outro deliverable_id, valida que pertence ao
        # mesmo projeto da quest (não pode mudar de projeto por atalho).
        if "deliverable_id" in fields and fields["deliverable_id"]:
            current = conn.execute(
                "SELECT project_id FROM quests WHERE id = ?", (quest_id,)
            ).fetchone()
            if current:
                deliv = conn.execute(
                    "SELECT project_id FROM deliverables WHERE id = ?",
                    (fields["deliverable_id"],),
                ).fetchone()
                if not deliv or deliv["project_id"] != current["project_id"]:
                    raise HTTPException(
                        422,
                        detail="O entregável escolhido não pertence a esse projeto.",
                    )

        # Track status transitions to maintain completed_at. 'done' e 'cancelled'
        # são ambos estados terminais — qualquer transição pra um deles carimba o
        # completed_at; sair de qualquer um limpa.
        TERMINAL = ("done", "cancelled")
        if "status" in fields:
            current = conn.execute("SELECT status FROM quests WHERE id = ?", (quest_id,)).fetchone()
            prev_status = current["status"] if current else None
            new_status = fields["status"]
            if new_status in TERMINAL and prev_status not in TERMINAL:
                fields["completed_at"] = _utcnow_iso_z()
                # Auto-update estimated_minutes to actual duration when completing quest
                if new_status == "done":
                    actual_minutes = calculate_quest_duration(conn, quest_id)
                    if actual_minutes > 0:
                        fields["estimated_minutes"] = actual_minutes
            elif new_status not in TERMINAL and prev_status in TERMINAL:
                fields["completed_at"] = None

        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE quests SET {set_clause} WHERE id = ?",
            [*fields.values(), quest_id],
        )
        conn.commit()

        row = conn.execute(
            """SELECT id, project_id, title, area_slug, status, priority, deadline,
                      estimated_minutes, next_action, description, deliverable_id,
                      completed_at, sort_order
               FROM quests WHERE id = ?""",
            (quest_id,),
        ).fetchone()
    if not row:
        raise HTTPException(404)
    d = dict(row)
    # worked_minutes derivado das sessões fechadas
    with get_conn() as conn2:
        sessions = conn2.execute(
            "SELECT started_at, ended_at FROM quest_sessions WHERE quest_id = ? AND ended_at IS NOT NULL",
            (quest_id,),
        ).fetchall()
    total_sec = 0
    for s in sessions:
        try:
            st = _parse_iso(s["started_at"]).timestamp()
            en = _parse_iso(s["ended_at"]).timestamp()
            if en > st:
                total_sec += int(en - st)
        except Exception:
            continue
    d["worked_minutes"] = total_sec // 60
    return d


@app.delete("/api/quests/{quest_id}", status_code=204)
def delete_quest(quest_id: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM quests WHERE id = ?", (quest_id,))
        conn.commit()
    return None


@app.post("/api/quests/reorder")
def reorder_quests(body: dict):
    """Reorder quests by updating sort_order field"""
    quest_ids = body.get("quest_ids", [])
    if not quest_ids:
        raise HTTPException(400, detail="quest_ids required")

    with get_conn() as conn:
        for index, quest_id in enumerate(quest_ids):
            conn.execute(
                "UPDATE quests SET sort_order = ? WHERE id = ?",
                (index, quest_id),
            )
        conn.commit()
    return {"status": "reordered"}


# ─── Routines ────────────────────────────────────────────────────────────────

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


PRIORITIES_VALID = {"critical", "high", "medium", "low"}

def _validate_priority(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    if v not in PRIORITIES_VALID:
        raise ValueError(f"priority deve ser um de {sorted(PRIORITIES_VALID)}")
    return v


def _validate_days_of_week(v: Optional[str]) -> Optional[str]:
    """days_of_week é uma string tipo '0,2,4' (dias da semana 0=seg..6=dom).
    Recusa valores fora do range ou não-numéricos, evitando que filtros na
    listagem silenciem o problema depois."""
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
        return _validate_days_of_week(v)

    @field_validator("priority")
    @classmethod
    def _priority(cls, v): return _validate_priority(v)


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
        return _validate_days_of_week(v)

    @field_validator("priority")
    @classmethod
    def _priority(cls, v): return _validate_priority(v)


@app.get("/api/routines", response_model=list[RoutineOut])
def list_routines(target: Optional[str] = None):
    from zoneinfo import ZoneInfo
    tz = ZoneInfo("America/Sao_Paulo")
    day = date.fromisoformat(target) if target else datetime.now(tz).date()
    weekday = day.weekday()
    date_str = day.isoformat()

    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM routines ORDER BY start_time ASC NULLS LAST"
        ).fetchall()
        logs = {
            r["routine_id"]
            for r in conn.execute(
                "SELECT routine_id FROM routine_logs WHERE completed_date = ?",
                (date_str,),
            ).fetchall()
        }

    result = []
    for r in rows:
        rec = r["recurrence"]
        if rec == "daily":
            passes = True
        elif rec == "weekdays":
            passes = weekday < 5
        elif rec == "weekly":
            # Support both old day_of_week (single value) and new days_of_week (comma-separated)
            if r["days_of_week"]:
                days = [int(d) for d in r["days_of_week"].split(',') if d.strip()]
                passes = weekday in days
            else:
                passes = r["day_of_week"] == weekday
        elif rec == "monthly":
            passes = r["day_of_month"] == day.day
        else:
            passes = False
        if not passes:
            continue
        d = dict(r)
        d["done"] = r["id"] in logs
        result.append(d)
    return result


@app.post("/api/routines/{routine_id}/toggle", response_model=RoutineOut)
def toggle_routine(routine_id: str, target: Optional[str] = None):
    from zoneinfo import ZoneInfo
    tz = ZoneInfo("America/Sao_Paulo")
    day = date.fromisoformat(target) if target else datetime.now(tz).date()
    date_str = day.isoformat()

    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM routines WHERE id = ?", (routine_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404)
        existing = conn.execute(
            "SELECT id FROM routine_logs WHERE routine_id = ? AND completed_date = ?",
            (routine_id, date_str),
        ).fetchone()
        if existing:
            conn.execute(
                "DELETE FROM routine_logs WHERE routine_id = ? AND completed_date = ?",
                (routine_id, date_str),
            )
            done = False
        else:
            conn.execute(
                "INSERT INTO routine_logs(routine_id, completed_date) VALUES(?,?)",
                (routine_id, date_str),
            )
            done = True
        conn.commit()

    d = dict(row)
    d["done"] = done
    return d


@app.get("/api/routines/completion-stats")
def routine_completion_stats(
    from_: str = Query(..., alias="from", description="Start date YYYY-MM-DD (local)"),
    to_: str = Query(..., alias="to", description="End date YYYY-MM-DD (local, inclusive)"),
):
    """
    Aggregate expected vs completed routine occurrences in a date range.

    For each day in [from_, to_]:
      - Count routines whose recurrence rule matches that weekday/day-of-month
        (and whose created_at is on or before that date, so new routines don't
         penalize past days)
      - Count matching entries in routine_logs
    """
    try:
        start = date.fromisoformat(from_)
        end = date.fromisoformat(to_)
    except ValueError:
        raise HTTPException(400, detail="Invalid date format; expected YYYY-MM-DD")
    if end < start:
        raise HTTPException(400, detail="'to' must be >= 'from'")

    with get_conn() as conn:
        routines = conn.execute(
            "SELECT id, recurrence, day_of_week, days_of_week, day_of_month, created_at FROM routines"
        ).fetchall()
        logs = conn.execute(
            "SELECT routine_id, completed_date FROM routine_logs "
            "WHERE completed_date >= ? AND completed_date <= ?",
            (from_, to_),
        ).fetchall()

    log_set = {(row["routine_id"], row["completed_date"]) for row in logs}

    expected = 0
    completed = 0
    per_routine_expected: dict = {}
    per_routine_completed: dict = {}
    days_count = 0

    current = start
    while current <= end:
        days_count += 1
        date_str = current.isoformat()
        weekday = current.weekday()
        day_of_month = current.day

        for r in routines:
            # Skip routines created after this date (relative to date, not time)
            if r["created_at"]:
                try:
                    created = date.fromisoformat(r["created_at"][:10])
                    if created > current:
                        continue
                except ValueError:
                    pass

            rec = r["recurrence"]
            applies = False
            if rec == "daily":
                applies = True
            elif rec == "weekdays":
                applies = weekday < 5
            elif rec == "weekly":
                if r["days_of_week"]:
                    days = [int(d) for d in r["days_of_week"].split(",") if d.strip()]
                    applies = weekday in days
                elif r["day_of_week"] is not None:
                    applies = r["day_of_week"] == weekday
            elif rec == "monthly":
                applies = r["day_of_month"] == day_of_month

            if not applies:
                continue

            expected += 1
            per_routine_expected[r["id"]] = per_routine_expected.get(r["id"], 0) + 1
            if (r["id"], date_str) in log_set:
                completed += 1
                per_routine_completed[r["id"]] = per_routine_completed.get(r["id"], 0) + 1

        current += timedelta(days=1)

    rate = (completed / expected) if expected > 0 else 0.0
    return {
        "from": from_,
        "to": to_,
        "days": days_count,
        "expected": expected,
        "completed": completed,
        "rate": round(rate, 4),
    }


@app.get("/api/routines/all", response_model=list[RoutineOut])
def list_all_routines():
    """List all routines without date filtering"""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM routines ORDER BY start_time ASC NULLS LAST"
        ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["done"] = False
        result.append(d)
    return result


@app.post("/api/routines", response_model=RoutineOut)
def create_routine(body: RoutineCreate):
    """Create a new routine"""
    import uuid
    routine_id = str(uuid.uuid4())[:8]

    with get_conn() as conn:
        conn.execute("""
            INSERT INTO routines
            (id, title, recurrence, days_of_week, day_of_month, start_time, end_time, estimated_minutes, priority, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            routine_id,
            body.title,
            body.recurrence,
            body.days_of_week,
            body.day_of_month,
            body.start_time,
            body.end_time,
            body.estimated_minutes,
            body.priority,
            body.description,
        ))
        conn.commit()
        row = conn.execute("SELECT * FROM routines WHERE id = ?", (routine_id,)).fetchone()

    d = dict(row)
    d["done"] = False

    # Create calendar event if routine has a time slot
    if cal_svc and body.start_time and body.end_time:
        try:
            from zoneinfo import ZoneInfo
            from datetime import datetime as dt, date as date_cls, timedelta, time

            # Calculate next occurrence of the routine
            today = date_cls.today()

            if body.recurrence == "daily":
                next_date = today
            elif body.recurrence == "weekdays":
                # Find next weekday
                next_date = today
                while next_date.weekday() > 4:  # 5=Sat, 6=Sun
                    next_date += timedelta(days=1)
            elif body.recurrence == "weekly" and body.days_of_week:
                # Find next occurrence of specified day
                target_days = [int(d) for d in body.days_of_week.split(',')]
                next_date = today
                while next_date.weekday() not in target_days:
                    next_date += timedelta(days=1)
            elif body.recurrence == "monthly" and body.day_of_month:
                # Find next occurrence of specified day of month
                next_date = date_cls(today.year, today.month, min(body.day_of_month, 28))
                if next_date < today:
                    # Move to next month
                    if today.month == 12:
                        next_date = date_cls(today.year + 1, 1, min(body.day_of_month, 28))
                    else:
                        next_date = date_cls(today.year, today.month + 1, min(body.day_of_month, 28))
            else:
                next_date = today

            # Parse times and combine with date to create datetime objects
            start_time_obj = dt.strptime(body.start_time, "%H:%M").time()
            end_time_obj = dt.strptime(body.end_time, "%H:%M").time()

            tz = ZoneInfo("America/Sao_Paulo")
            start_dt = dt.combine(next_date, start_time_obj, tzinfo=tz)
            end_dt = dt.combine(next_date, end_time_obj, tzinfo=tz)

            ev = cal_svc.create_event(
                summary=body.title,
                start_at=start_dt,
                end_at=end_dt
            )

            with get_conn() as conn:
                conn.execute("UPDATE routines SET calendar_event_id = ? WHERE id = ?", (ev.event_id, routine_id))
                conn.commit()

            d["calendar_event_id"] = ev.event_id
        except Exception as e:
            print(f"Failed to create calendar event for routine: {e}")

    return d


@app.patch("/api/routines/{routine_id}", response_model=RoutineOut)
def update_routine(routine_id: str, body: RoutineUpdate):
    """Update a routine"""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM routines WHERE id = ?", (routine_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404)

        # Build update query using only fields that were explicitly sent
        # This allows sending null to clear a field (e.g., start_time: null)
        updates = {}
        for field in body.model_fields_set:
            updates[field] = getattr(body, field)

        if updates:
            set_clause = ", ".join([f"{k} = ?" for k in updates.keys()])
            values = list(updates.values()) + [routine_id]
            conn.execute(f"UPDATE routines SET {set_clause} WHERE id = ?", values)
            conn.commit()

        row = conn.execute("SELECT * FROM routines WHERE id = ?", (routine_id,)).fetchone()

    d = dict(row)
    d["done"] = False

    # Update calendar event if routine has a time slot
    if cal_svc and row:
        new_start_time = body.start_time if body.start_time is not None else row['start_time']
        new_end_time = body.end_time if body.end_time is not None else row['end_time']
        new_title = body.title if body.title is not None else row['title']
        event_id = row['calendar_event_id']

        if new_start_time and new_end_time:
            try:
                from zoneinfo import ZoneInfo
                from datetime import datetime as dt, date as date_cls, timedelta, time

                if event_id:
                    # Update existing event
                    start_t = dt.strptime(new_start_time, "%H:%M").time()
                    end_t = dt.strptime(new_end_time, "%H:%M").time()

                    # Use today's date for the event (recurring events in Google Calendar need a start date)
                    today = date_cls.today()
                    tz = ZoneInfo("America/Sao_Paulo")
                    start_dt = dt.combine(today, start_t, tzinfo=tz)
                    end_dt = dt.combine(today, end_t, tzinfo=tz)

                    # Build proper event dict structure for update
                    timezone_name = "America/Sao_Paulo"
                    updates = {
                        'summary': new_title,
                        'start': {
                            'dateTime': start_dt.isoformat(),
                            'timeZone': timezone_name,
                        },
                        'end': {
                            'dateTime': end_dt.isoformat(),
                            'timeZone': timezone_name,
                        },
                    }
                    cal_svc.update_event(event_id, **updates)
                else:
                    # Create new event if no calendar event exists yet
                    today = date_cls.today()
                    start_t = dt.strptime(new_start_time, "%H:%M").time()
                    end_t = dt.strptime(new_end_time, "%H:%M").time()

                    tz = ZoneInfo("America/Sao_Paulo")
                    start_dt = dt.combine(today, start_t, tzinfo=tz)
                    end_dt = dt.combine(today, end_t, tzinfo=tz)

                    ev = cal_svc.create_event(
                        summary=new_title,
                        start_at=start_dt,
                        end_at=end_dt
                    )

                    with get_conn() as conn:
                        conn.execute("UPDATE routines SET calendar_event_id = ? WHERE id = ?", (ev.event_id, routine_id))
                        conn.commit()

                    d["calendar_event_id"] = ev.event_id
            except Exception as e:
                print(f"Failed to update calendar event for routine: {e}")
        elif event_id and (not new_start_time or not new_end_time):
            # Delete event if times were removed
            try:
                cal_svc.delete_event(event_id)
                with get_conn() as conn:
                    conn.execute("UPDATE routines SET calendar_event_id = NULL WHERE id = ?", (routine_id,))
                    conn.commit()
                d["calendar_event_id"] = None
            except Exception as e:
                print(f"Failed to delete calendar event for routine: {e}")

    return d


# ─── Routine Sessions ────────────────────────────────────────────────────

class RoutineSessionOut(BaseModel):
    id: int
    routine_id: str
    date: str
    session_num: int
    started_at: str
    ended_at: Optional[str]


def _today_sp_iso() -> str:
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo("America/Sao_Paulo")).date().isoformat()


@app.get("/api/routines/{routine_id}/sessions", response_model=list[RoutineSessionOut])
def list_routine_sessions(routine_id: str, target: Optional[str] = None):
    sql = "SELECT * FROM routine_sessions WHERE routine_id = ?"
    params: list = [routine_id]
    if target:
        sql += " AND date = ?"
        params.append(target)
    sql += " ORDER BY date ASC, session_num ASC"
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/routines/{routine_id}/sessions/start", response_model=RoutineSessionOut, status_code=201)
def routine_start_session(routine_id: str, target: Optional[str] = None):
    now = _utcnow_iso_z()
    date_str = target or _today_sp_iso()
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM routines WHERE id = ?", (routine_id,)).fetchone():
            raise HTTPException(404, detail="Routine not found")
        active = find_active_session(conn, exclude_type="routine", exclude_id=routine_id)
        if active:
            raise HTTPException(409, detail=active["title"])

        last = conn.execute(
            "SELECT MAX(session_num) AS num FROM routine_sessions WHERE routine_id = ? AND date = ?",
            (routine_id, date_str),
        ).fetchone()
        session_num = (last["num"] or 0) + 1
        conn.execute(
            "INSERT INTO routine_sessions(routine_id, date, session_num, started_at) VALUES (?, ?, ?, ?)",
            (routine_id, date_str, session_num, now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM routine_sessions WHERE routine_id = ? AND date = ? AND session_num = ?",
            (routine_id, date_str, session_num),
        ).fetchone()
    return dict(row)


@app.post("/api/routines/{routine_id}/sessions/pause", response_model=RoutineSessionOut)
def routine_pause_session(routine_id: str, target: Optional[str] = None):
    now = _utcnow_iso_z()
    date_str = target or _today_sp_iso()
    with get_conn() as conn:
        session = conn.execute(
            "SELECT * FROM routine_sessions WHERE routine_id = ? AND date = ? AND ended_at IS NULL ORDER BY session_num DESC LIMIT 1",
            (routine_id, date_str),
        ).fetchone()
        if not session:
            raise HTTPException(404, detail="No active session")
        conn.execute("UPDATE routine_sessions SET ended_at = ? WHERE id = ?", (now, session["id"]))
        conn.commit()
        row = conn.execute("SELECT * FROM routine_sessions WHERE id = ?", (session["id"],)).fetchone()
    return dict(row)


@app.post("/api/routines/{routine_id}/sessions/resume", response_model=RoutineSessionOut, status_code=201)
def routine_resume_session(routine_id: str, target: Optional[str] = None):
    now = _utcnow_iso_z()
    date_str = target or _today_sp_iso()
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM routines WHERE id = ?", (routine_id,)).fetchone():
            raise HTTPException(404, detail="Routine not found")
        active = find_active_session(conn, exclude_type="routine", exclude_id=routine_id)
        if active:
            raise HTTPException(409, detail=active["title"])

        last = conn.execute(
            "SELECT MAX(session_num) AS num FROM routine_sessions WHERE routine_id = ? AND date = ?",
            (routine_id, date_str),
        ).fetchone()
        session_num = (last["num"] or 0) + 1
        conn.execute(
            "INSERT INTO routine_sessions(routine_id, date, session_num, started_at) VALUES (?, ?, ?, ?)",
            (routine_id, date_str, session_num, now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM routine_sessions WHERE routine_id = ? AND date = ? AND session_num = ?",
            (routine_id, date_str, session_num),
        ).fetchone()
    return dict(row)


@app.post("/api/routines/{routine_id}/sessions/stop")
def routine_stop_session(routine_id: str, target: Optional[str] = None):
    """Close any active session for this routine+date and mark the routine as done for that day."""
    now = _utcnow_iso_z()
    date_str = target or _today_sp_iso()
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM routines WHERE id = ?", (routine_id,)).fetchone():
            raise HTTPException(404, detail="Routine not found")
        session = conn.execute(
            "SELECT id FROM routine_sessions WHERE routine_id = ? AND date = ? AND ended_at IS NULL ORDER BY session_num DESC LIMIT 1",
            (routine_id, date_str),
        ).fetchone()
        if session:
            conn.execute("UPDATE routine_sessions SET ended_at = ? WHERE id = ?", (now, session["id"]))
        # Upsert routine_log for the day
        conn.execute(
            "INSERT OR IGNORE INTO routine_logs(routine_id, completed_date) VALUES (?, ?)",
            (routine_id, date_str),
        )
        conn.commit()
    return {"status": "ok", "routine_id": routine_id, "date": date_str, "done": True}


@app.delete("/api/routines/{routine_id}")
def delete_routine(routine_id: str):
    """Delete a routine"""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM routines WHERE id = ?", (routine_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404)

        # Delete calendar event if it exists
        if cal_svc and row['calendar_event_id']:
            try:
                cal_svc.delete_event(row['calendar_event_id'])
            except Exception as e:
                print(f"Failed to delete calendar event for routine: {e}")

        # Delete routine_logs first (cascade)
        conn.execute("DELETE FROM routine_logs WHERE routine_id = ?", (routine_id,))
        # Then delete routine
        conn.execute("DELETE FROM routines WHERE id = ?", (routine_id,))
        conn.commit()

    return {"status": "ok"}


# ─── Quest Sessions ──────────────────────────────────────────────────────────

class SessionOut(BaseModel):
    id: int
    quest_id: str
    session_num: int
    started_at: str
    ended_at: Optional[str]


@app.get("/api/quests/{quest_id}/sessions", response_model=list[SessionOut])
def list_sessions(quest_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM quest_sessions WHERE quest_id = ? ORDER BY session_num ASC",
            (quest_id,),
        ).fetchall()
    return [dict(r) for r in rows]


class ActiveSessionOut(BaseModel):
    type: str  # 'quest' | 'task' | 'routine'
    id: str
    title: str
    area_slug: Optional[str] = None
    started_at: str
    ended_at: Optional[str]
    is_active: bool
    # Breadcrumb pro banner: quando a quest é subtarefa, inclui nome do
    # projeto pai e do entregável. Null nas demais situações.
    parent_title: Optional[str] = None
    deliverable_title: Optional[str] = None
    # Back-compat: old UI might read quest_id
    quest_id: Optional[str] = None


@app.get("/api/sessions/active", response_model=ActiveSessionOut | None)
def get_active_session(
    focused_type: Optional[str] = Query(None),
    focused_id: Optional[str] = Query(None),
):
    """
    Primary: any currently-running session.
    Fallback: if caller provides a focused entity (what the user explicitly
    started last), return its most recent session even if paused — so the banner
    can keep showing it until the user finalizes. Entities that are already
    finalized (quest done, task done, routine logged for the day) don't qualify.
    """
    with get_conn() as conn:
        row = conn.execute(
            """SELECT 'quest' AS type, qs.quest_id AS id, q.title, q.area_slug, qs.started_at, qs.ended_at, qs.id AS sid
               FROM quest_sessions qs JOIN quests q ON qs.quest_id = q.id
               WHERE qs.ended_at IS NULL
               UNION ALL
               SELECT 'task' AS type, ts.task_id AS id, t.title, NULL AS area_slug, ts.started_at, ts.ended_at, ts.id AS sid
               FROM task_sessions ts JOIN tasks t ON ts.task_id = t.id
               WHERE ts.ended_at IS NULL
               UNION ALL
               SELECT 'routine' AS type, rs.routine_id AS id, r.title, NULL AS area_slug, rs.started_at, rs.ended_at, rs.id AS sid
               FROM routine_sessions rs JOIN routines r ON rs.routine_id = r.id
               WHERE rs.ended_at IS NULL
               LIMIT 1"""
        ).fetchone()

        if not row and focused_type and focused_id:
            if focused_type == "quest":
                row = conn.execute(
                    """SELECT 'quest' AS type, qs.quest_id AS id, q.title, q.area_slug, qs.started_at, qs.ended_at, qs.id AS sid
                       FROM quest_sessions qs JOIN quests q ON qs.quest_id = q.id
                       WHERE qs.quest_id = ? AND q.status != 'done'
                       ORDER BY qs.id DESC LIMIT 1""",
                    (focused_id,),
                ).fetchone()
            elif focused_type == "task":
                row = conn.execute(
                    """SELECT 'task' AS type, ts.task_id AS id, t.title, NULL AS area_slug, ts.started_at, ts.ended_at, ts.id AS sid
                       FROM task_sessions ts JOIN tasks t ON ts.task_id = t.id
                       WHERE ts.task_id = ? AND t.done = 0
                       ORDER BY ts.id DESC LIMIT 1""",
                    (focused_id,),
                ).fetchone()
            elif focused_type == "routine":
                row = conn.execute(
                    """SELECT 'routine' AS type, rs.routine_id AS id, r.title, NULL AS area_slug, rs.started_at, rs.ended_at, rs.id AS sid
                       FROM routine_sessions rs
                         JOIN routines r ON rs.routine_id = r.id
                         LEFT JOIN routine_logs rl
                           ON rl.routine_id = rs.routine_id AND rl.completed_date = rs.date
                       WHERE rs.routine_id = ? AND rl.id IS NULL
                       ORDER BY rs.id DESC LIMIT 1""",
                    (focused_id,),
                ).fetchone()

    if not row:
        return None

    parent_title: Optional[str] = None
    deliverable_title: Optional[str] = None
    if row["type"] == "quest":
        with get_conn() as conn:
            ctx = conn.execute(
                """SELECT q.project_id, q.deliverable_id,
                          p.title AS parent_title,
                          d.title AS deliverable_title
                   FROM quests q
                   LEFT JOIN projects p ON p.id = q.project_id
                   LEFT JOIN deliverables d ON d.id = q.deliverable_id
                   WHERE q.id = ?""",
                (row["id"],),
            ).fetchone()
            if ctx:
                parent_title = ctx["parent_title"]
                deliverable_title = ctx["deliverable_title"]

    result = {
        "type": row["type"],
        "id": row["id"],
        "title": row["title"],
        "area_slug": row["area_slug"],
        "started_at": row["started_at"],
        "ended_at": row["ended_at"],
        "is_active": row["ended_at"] is None,
        "parent_title": parent_title,
        "deliverable_title": deliverable_title,
        "quest_id": row["id"] if row["type"] == "quest" else None,
    }
    return result


@app.post("/api/quests/{quest_id}/sessions/start", response_model=SessionOut, status_code=201)
def start_session(quest_id: str):
    now = _utcnow_iso_z()
    with get_conn() as conn:
        active = find_active_session(conn, exclude_type="quest", exclude_id=quest_id)
        if active:
            raise HTTPException(409, detail=active["title"])

        # Find next session number
        last = conn.execute(
            "SELECT MAX(session_num) as num FROM quest_sessions WHERE quest_id = ?",
            (quest_id,),
        ).fetchone()
        session_num = (last["num"] or 0) + 1

        conn.execute(
            "INSERT INTO quest_sessions(quest_id, session_num, started_at) VALUES(?,?,?)",
            (quest_id, session_num, now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM quest_sessions WHERE quest_id = ? AND session_num = ?",
            (quest_id, session_num),
        ).fetchone()
    return dict(row)


@app.post("/api/quests/{quest_id}/sessions/pause", response_model=SessionOut)
def pause_session(quest_id: str):
    now = _utcnow_iso_z()
    with get_conn() as conn:
        # Find active session (no ended_at)
        session = conn.execute(
            "SELECT * FROM quest_sessions WHERE quest_id = ? AND ended_at IS NULL ORDER BY session_num DESC LIMIT 1",
            (quest_id,),
        ).fetchone()
        if not session:
            raise HTTPException(404, detail="No active session")

        conn.execute(
            "UPDATE quest_sessions SET ended_at = ? WHERE id = ?",
            (now, session["id"]),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM quest_sessions WHERE id = ?", (session["id"],)
        ).fetchone()
    return dict(row)


@app.post("/api/quests/{quest_id}/sessions/resume", response_model=SessionOut, status_code=201)
def resume_session(quest_id: str):
    now = _utcnow_iso_z()
    with get_conn() as conn:
        active = find_active_session(conn, exclude_type="quest", exclude_id=quest_id)
        if active:
            raise HTTPException(409, detail=active["title"])

        last = conn.execute(
            "SELECT MAX(session_num) as num FROM quest_sessions WHERE quest_id = ?",
            (quest_id,),
        ).fetchone()
        session_num = (last["num"] or 0) + 1

        conn.execute(
            "INSERT INTO quest_sessions(quest_id, session_num, started_at) VALUES(?,?,?)",
            (quest_id, session_num, now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM quest_sessions WHERE quest_id = ? AND session_num = ?",
            (quest_id, session_num),
        ).fetchone()
    return dict(row)


# ─── Deliverables ───────────────────────────────────────────────────────────
# Deliverables agora são filhos de Project (não mais de Quest). URL base:
# /api/projects/{project_id}/deliverables.

class DeliverableOut(BaseModel):
    id: str
    project_id: str
    title: str
    done: bool
    sort_order: int
    estimated_minutes: Optional[int] = None
    deadline: Optional[str] = None
    # minutes_worked: legado (ainda persiste no DB mas não é mais incrementado).
    minutes_worked: int = 0
    # executed_minutes: soma das sessões fechadas das quests **done**
    # amarradas a este deliverable. Fonte de verdade pro card "X / Y min".
    executed_minutes: int = 0


class DeliverableCreate(BaseModel):
    title: str
    estimated_minutes: Optional[int] = None
    # Deadline é obrigatória. Pydantic retorna 422 automaticamente se faltar
    # ou vier null/vazio. Formato esperado: YYYY-MM-DD.
    deadline: str


def _executed_minutes_for_deliverable(conn, deliv_id: str) -> int:
    """Sum seconds of closed sessions of DONE quests attached to this deliverable."""
    rows = conn.execute(
        """
        SELECT s.started_at, s.ended_at
        FROM quest_sessions s
        JOIN quests q ON q.id = s.quest_id
        WHERE q.deliverable_id = ? AND q.status = 'done'
          AND s.ended_at IS NOT NULL
        """,
        (deliv_id,),
    ).fetchall()
    total_seconds = 0
    for r in rows:
        try:
            start = _parse_iso(r["started_at"])
            end = _parse_iso(r["ended_at"])
            total_seconds += max(0, int((end - start).total_seconds()))
        except Exception:
            continue
    return total_seconds // 60


_DELIV_COLUMNS = (
    "id, project_id, title, done, sort_order, estimated_minutes, deadline, minutes_worked"
)


@app.get("/api/projects/{project_id}/deliverables", response_model=list[DeliverableOut])
def list_deliverables(project_id: str):
    """Lista entregáveis de um projeto com `executed_minutes` já somado.
    Bulk: uma query pros entregáveis, outra pras sessões agrupadas — em vez de
    fazer 1 query por entregável (o antigo N+1)."""
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT {_DELIV_COLUMNS} FROM deliverables "
            "WHERE project_id = ? ORDER BY sort_order ASC",
            (project_id,),
        ).fetchall()
        # Sessões fechadas das quests `done` desse projeto, agregadas por deliverable.
        session_rows = conn.execute(
            """
            SELECT q.deliverable_id AS deliv_id, s.started_at, s.ended_at
            FROM quest_sessions s
            JOIN quests q ON q.id = s.quest_id
            JOIN deliverables d ON d.id = q.deliverable_id
            WHERE d.project_id = ?
              AND q.status = 'done'
              AND s.ended_at IS NOT NULL
            """,
            (project_id,),
        ).fetchall()

    by_deliv: dict[str, int] = {}
    for s in session_rows:
        try:
            start = _parse_iso(s["started_at"])
            end = _parse_iso(s["ended_at"])
            secs = max(0, int((end - start).total_seconds()))
        except Exception:
            continue
        by_deliv[s["deliv_id"]] = by_deliv.get(s["deliv_id"], 0) + secs

    result = []
    for r in rows:
        d = dict(r)
        d["executed_minutes"] = by_deliv.get(d["id"], 0) // 60
        result.append(d)
    return result


@app.post("/api/projects/{project_id}/deliverables", response_model=DeliverableOut, status_code=201)
def create_deliverable(project_id: str, body: DeliverableCreate):
    deliv_id = str(uuid.uuid4())[:8]
    with get_conn() as conn:
        # Valida que o projeto existe
        project = conn.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not project:
            raise HTTPException(404, detail=f"Project '{project_id}' not found")

        max_sort = conn.execute(
            "SELECT MAX(sort_order) as num FROM deliverables WHERE project_id = ?",
            (project_id,),
        ).fetchone()
        sort_order = (max_sort["num"] or 0) + 1

        conn.execute(
            "INSERT INTO deliverables(id, project_id, title, done, sort_order, estimated_minutes, deadline) VALUES(?,?,?,?,?,?,?)",
            (deliv_id, project_id, body.title, 0, sort_order, body.estimated_minutes, body.deadline),
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {_DELIV_COLUMNS} FROM deliverables WHERE id = ?",
            (deliv_id,),
        ).fetchone()
        d = dict(row)
        d["executed_minutes"] = 0  # acabou de criar
    return d


@app.patch("/api/deliverables/{deliv_id}", response_model=DeliverableOut)
def update_deliverable(deliv_id: str, body: dict):
    # Permitir setar deadline=None explicitamente (sentinel {"deadline": None}
    # faz PATCH limpar o campo). Filtra só chaves ausentes do body.
    allowed = {"title", "estimated_minutes", "deadline", "done", "sort_order"}
    fields = {k: v for k, v in body.items() if k in allowed}
    if not fields:
        raise HTTPException(400, detail="Nothing to update")
    # Coerce done bool → int for SQLite.
    if "done" in fields and isinstance(fields["done"], bool):
        fields["done"] = 1 if fields["done"] else 0
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with get_conn() as conn:
        conn.execute(
            f"UPDATE deliverables SET {set_clause} WHERE id = ?",
            [*fields.values(), deliv_id],
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {_DELIV_COLUMNS} FROM deliverables WHERE id = ?",
            (deliv_id,),
        ).fetchone()
        if not row:
            raise HTTPException(404)
        d = dict(row)
        d["executed_minutes"] = _executed_minutes_for_deliverable(conn, deliv_id)
    return d


@app.delete("/api/deliverables/{deliv_id}", status_code=204)
def delete_deliverable(deliv_id: str):
    with get_conn() as conn:
        # Se tem quests amarradas, recusa — o novo modelo não permite quest
        # órfã. O usuário precisa mover ou deletar as quests antes.
        attached = conn.execute(
            "SELECT COUNT(*) AS n FROM quests WHERE deliverable_id = ?",
            (deliv_id,)
        ).fetchone()
        if attached and attached["n"] > 0:
            raise HTTPException(
                409,
                detail=f"Esse entregável tem {attached['n']} quest(s) amarrada(s). Mova ou delete as quests antes.",
            )
        conn.execute("DELETE FROM deliverables WHERE id = ?", (deliv_id,))
        conn.commit()
    return None


@app.post("/api/projects/{project_id}/deliverables/reorder")
def reorder_deliverables(project_id: str, body: dict):
    """Reorder deliverables by updating sort_order field"""
    deliv_ids = body.get("deliv_ids", [])
    if not deliv_ids:
        raise HTTPException(400, detail="deliv_ids required")

    with get_conn() as conn:
        for index, deliv_id in enumerate(deliv_ids):
            conn.execute(
                "UPDATE deliverables SET sort_order = ? WHERE id = ?",
                (index, deliv_id),
            )
        conn.commit()
    return {"status": "reordered"}


# ─── Tasks ───────────────────────────────────────────────────────────────

class TaskOut(BaseModel):
    id: str
    title: str
    scheduled_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    done: bool = False
    completed_at: Optional[str] = None
    sort_order: int = 0
    priority: str = "critical"
    description: Optional[str] = None


class TaskCreate(BaseModel):
    title: str
    priority: str  # obrigatório na criação
    scheduled_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    description: Optional[str] = None

    @field_validator("priority")
    @classmethod
    def _check_priority(cls, v): return _validate_priority(v)


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    scheduled_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    done: Optional[bool] = None
    priority: Optional[str] = None
    description: Optional[str] = None

    @field_validator("priority")
    @classmethod
    def _check_priority(cls, v): return _validate_priority(v)


def _row_to_task(row) -> dict:
    d = dict(row)
    d["done"] = bool(d.get("done"))
    return d


@app.get("/api/tasks", response_model=list[TaskOut])
def list_tasks(
    done: Optional[bool] = None,
    scheduled_date: Optional[str] = Query(None, alias="date"),
):
    sql = "SELECT id, title, scheduled_date, start_time, end_time, duration_minutes, done, completed_at, sort_order, priority, description FROM tasks WHERE 1=1"
    params: list = []
    if done is not None:
        sql += " AND done = ?"
        params.append(1 if done else 0)
    if scheduled_date is not None:
        sql += " AND scheduled_date = ?"
        params.append(scheduled_date)
    sql += " ORDER BY done ASC, scheduled_date ASC NULLS LAST, start_time ASC NULLS LAST, sort_order ASC, created_at ASC"
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_task(r) for r in rows]


@app.post("/api/tasks", response_model=TaskOut, status_code=201)
def create_task(body: TaskCreate):
    title = body.title.strip()
    if not title:
        raise HTTPException(400, detail="title is required")
    task_id = str(uuid.uuid4())[:8]
    with get_conn() as conn:
        max_sort = conn.execute("SELECT COALESCE(MAX(sort_order), 0) AS m FROM tasks").fetchone()
        sort_order = (max_sort["m"] or 0) + 1
        conn.execute(
            """INSERT INTO tasks
               (id, title, scheduled_date, start_time, end_time, duration_minutes, sort_order, priority, description)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (task_id, title, body.scheduled_date, body.start_time, body.end_time, body.duration_minutes, sort_order, body.priority, body.description),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id, title, scheduled_date, start_time, end_time, duration_minutes, done, completed_at, sort_order, priority, description FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()
    return _row_to_task(row)


@app.patch("/api/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: str, body: TaskUpdate):
    fields: dict = {}
    for name in body.model_fields_set:
        fields[name] = getattr(body, name)
    if not fields:
        raise HTTPException(400, detail="Nothing to update")

    with get_conn() as conn:
        existing = conn.execute("SELECT done FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not existing:
            raise HTTPException(404, detail="Task not found")

        # Track completed_at on done transitions
        if "done" in fields:
            new_done = bool(fields["done"])
            fields["done"] = 1 if new_done else 0
            prev_done = bool(existing["done"])
            if new_done and not prev_done:
                fields["completed_at"] = datetime.utcnow().isoformat() + "Z"
            elif not new_done and prev_done:
                fields["completed_at"] = None

        fields["updated_at"] = datetime.utcnow().isoformat() + "Z"
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE tasks SET {set_clause} WHERE id = ?",
            [*fields.values(), task_id],
        )
        conn.commit()
        row = conn.execute(
            "SELECT id, title, scheduled_date, start_time, end_time, duration_minutes, done, completed_at, sort_order, priority, description FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()
    return _row_to_task(row)


@app.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(task_id: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.commit()
    return None


# ─── Task Sessions ───────────────────────────────────────────────────────

class TaskSessionOut(BaseModel):
    id: int
    task_id: str
    session_num: int
    started_at: str
    ended_at: Optional[str]


@app.get("/api/tasks/{task_id}/sessions", response_model=list[TaskSessionOut])
def list_task_sessions(task_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM task_sessions WHERE task_id = ? ORDER BY session_num ASC",
            (task_id,),
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/tasks/{task_id}/sessions/start", response_model=TaskSessionOut, status_code=201)
def task_start_session(task_id: str):
    now = _utcnow_iso_z()
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM tasks WHERE id = ?", (task_id,)).fetchone():
            raise HTTPException(404, detail="Task not found")
        active = find_active_session(conn, exclude_type="task", exclude_id=task_id)
        if active:
            raise HTTPException(409, detail=active["title"])

        last = conn.execute(
            "SELECT MAX(session_num) AS num FROM task_sessions WHERE task_id = ?",
            (task_id,),
        ).fetchone()
        session_num = (last["num"] or 0) + 1

        conn.execute(
            "INSERT INTO task_sessions(task_id, session_num, started_at) VALUES (?, ?, ?)",
            (task_id, session_num, now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM task_sessions WHERE task_id = ? AND session_num = ?",
            (task_id, session_num),
        ).fetchone()
    return dict(row)


@app.post("/api/tasks/{task_id}/sessions/pause", response_model=TaskSessionOut)
def task_pause_session(task_id: str):
    now = _utcnow_iso_z()
    with get_conn() as conn:
        session = conn.execute(
            "SELECT * FROM task_sessions WHERE task_id = ? AND ended_at IS NULL ORDER BY session_num DESC LIMIT 1",
            (task_id,),
        ).fetchone()
        if not session:
            raise HTTPException(404, detail="No active session")
        conn.execute("UPDATE task_sessions SET ended_at = ? WHERE id = ?", (now, session["id"]))
        conn.commit()
        row = conn.execute("SELECT * FROM task_sessions WHERE id = ?", (session["id"],)).fetchone()
    return dict(row)


@app.post("/api/tasks/{task_id}/sessions/resume", response_model=TaskSessionOut, status_code=201)
def task_resume_session(task_id: str):
    now = _utcnow_iso_z()
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM tasks WHERE id = ?", (task_id,)).fetchone():
            raise HTTPException(404, detail="Task not found")
        active = find_active_session(conn, exclude_type="task", exclude_id=task_id)
        if active:
            raise HTTPException(409, detail=active["title"])

        last = conn.execute(
            "SELECT MAX(session_num) AS num FROM task_sessions WHERE task_id = ?",
            (task_id,),
        ).fetchone()
        session_num = (last["num"] or 0) + 1
        conn.execute(
            "INSERT INTO task_sessions(task_id, session_num, started_at) VALUES (?, ?, ?)",
            (task_id, session_num, now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM task_sessions WHERE task_id = ? AND session_num = ?",
            (task_id, session_num),
        ).fetchone()
    return dict(row)


@app.post("/api/tasks/{task_id}/sessions/stop", response_model=TaskOut)
def task_stop_session(task_id: str):
    """Close any active session for this task and mark the task as done."""
    now = _utcnow_iso_z()
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM tasks WHERE id = ?", (task_id,)).fetchone():
            raise HTTPException(404, detail="Task not found")
        session = conn.execute(
            "SELECT id FROM task_sessions WHERE task_id = ? AND ended_at IS NULL ORDER BY session_num DESC LIMIT 1",
            (task_id,),
        ).fetchone()
        if session:
            conn.execute("UPDATE task_sessions SET ended_at = ? WHERE id = ?", (now, session["id"]))
        conn.execute(
            "UPDATE tasks SET done = 1, completed_at = ?, updated_at = ? WHERE id = ?",
            (now, now, task_id),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id, title, scheduled_date, start_time, end_time, duration_minutes, done, completed_at, sort_order, priority, description FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()
    return _row_to_task(row)


@app.post("/api/tasks/{task_id}/toggle", response_model=TaskOut)
def toggle_task(task_id: str):
    with get_conn() as conn:
        row = conn.execute("SELECT done FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            raise HTTPException(404, detail="Task not found")
        new_done = 0 if row["done"] else 1
        now = datetime.utcnow().isoformat() + "Z"
        completed_at = now if new_done else None
        conn.execute(
            "UPDATE tasks SET done = ?, completed_at = ?, updated_at = ? WHERE id = ?",
            (new_done, completed_at, now, task_id),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id, title, scheduled_date, start_time, end_time, duration_minutes, done, completed_at, sort_order, priority, description FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()
    return _row_to_task(row)


# ─── User Profile ────────────────────────────────────────────────────────

class ProfileOut(BaseModel):
    name: str
    role: str
    avatar_url: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    avatar_url: Optional[str] = None


@app.get("/api/profile", response_model=ProfileOut)
def get_profile():
    with get_conn() as conn:
        row = conn.execute(
            "SELECT name, role, avatar_url FROM user_profile WHERE id = 1"
        ).fetchone()
        if not row:
            # Safety net if init_db hasn't seeded yet (shouldn't normally happen)
            conn.execute(
                "INSERT INTO user_profile(id, name, role, avatar_url) VALUES (1, '', '', '')"
            )
            conn.commit()
            return {"name": "", "role": "", "avatar_url": ""}
    return dict(row)


@app.patch("/api/profile", response_model=ProfileOut)
def update_profile(body: ProfileUpdate):
    fields: dict = {}
    for name in body.model_fields_set:
        fields[name] = getattr(body, name)
    if not fields:
        raise HTTPException(400, detail="Nothing to update")
    fields["updated_at"] = datetime.utcnow().isoformat() + "Z"
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with get_conn() as conn:
        conn.execute(
            f"UPDATE user_profile SET {set_clause} WHERE id = 1",
            [*fields.values()],
        )
        conn.commit()
        row = conn.execute(
            "SELECT name, role, avatar_url FROM user_profile WHERE id = 1"
        ).fetchone()
    return dict(row)


# ─── Micro Tasks ──────────────────────────────────────────────────────────

class MicroTaskOut(BaseModel):
    id: str
    title: str
    created_at: str


class MicroTaskCreate(BaseModel):
    title: str


@app.get("/api/micro-tasks", response_model=list[MicroTaskOut])
def list_micro_tasks():
    """List all micro tasks ordered by creation date (newest first)"""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, title, created_at FROM micro_tasks ORDER BY created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/micro-tasks", response_model=MicroTaskOut, status_code=201)
def create_micro_task(body: MicroTaskCreate):
    """Create a new micro task"""
    micro_id = str(uuid.uuid4())[:8]
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO micro_tasks(id, title) VALUES(?, ?)",
            (micro_id, body.title)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM micro_tasks WHERE id = ?", (micro_id,)).fetchone()
    return dict(row)


@app.delete("/api/micro-tasks/{micro_id}", status_code=204)
def delete_micro_task(micro_id: str):
    """Delete a micro task"""
    with get_conn() as conn:
        conn.execute("DELETE FROM micro_tasks WHERE id = ?", (micro_id,))
        conn.commit()
    return None


# ─── Google Calendar Integration ──────────────────────────────────────────

class CalendarEventRequest(BaseModel):
    quest_id: str
    title: str
    start_time: str  # ISO format
    end_time: Optional[str] = None


@app.post("/api/calendar/create-event")
def create_calendar_event(body: CalendarEventRequest):
    """Create a calendar event for a quest session"""
    if not GOOGLE_CALENDAR_ENABLED:
        return {"status": "skipped", "reason": "Google Calendar not enabled"}

    # TODO: Implement Google Calendar API integration
    # This would use the GoogleCalendarService to create an event
    return {
        "status": "created",
        "event_id": f"cal_{body.quest_id}_{int(datetime.utcnow().timestamp())}",
        "title": body.title,
        "start": body.start_time,
    }


@app.post("/api/calendar/update-event")
def update_calendar_event(event_id: str, body: dict):
    """Update a calendar event"""
    if not GOOGLE_CALENDAR_ENABLED:
        return {"status": "skipped", "reason": "Google Calendar not enabled"}

    # TODO: Implement Google Calendar API integration
    return {"status": "updated", "event_id": event_id}


@app.delete("/api/calendar/delete-event")
def delete_calendar_event(event_id: str):
    """Delete a calendar event"""
    if not GOOGLE_CALENDAR_ENABLED:
        return {"status": "skipped", "reason": "Google Calendar not enabled"}

    # TODO: Implement Google Calendar API integration
    return {"status": "deleted", "event_id": event_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
