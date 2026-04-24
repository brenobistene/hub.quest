import uuid
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException

from db import get_conn
from models.project import PROJECT_COLUMNS, ProjectCreate, ProjectOut, ProjectUpdate
from services.calendar_state import calendar_state
from services.utils import utcnow_iso_z

router = APIRouter()


@router.get("/api/projects", response_model=list[ProjectOut])
def list_projects(area: Optional[str] = None, status: Optional[str] = None):
    """Lista projetos. Filtros opcionais por área e status."""
    sql = f"SELECT {PROJECT_COLUMNS} FROM projects WHERE 1=1"
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


@router.get("/api/projects/deliverables-summary")
def deliverables_summary(area: Optional[str] = None):
    """Resumo em massa de entregáveis por projeto — evita N+1 do frontend.

    Retorna {project_id: {total, done}} para cada projeto (opcionalmente
    filtrado por área). Usado pela lista de projetos pra calcular a barra
    de progresso sem precisar buscar deliverables por projeto um-a-um.
    """
    sql = (
        "SELECT d.project_id, "
        "       COUNT(*) AS total, "
        "       SUM(CASE WHEN d.done = 1 THEN 1 ELSE 0 END) AS done "
        "FROM deliverables d "
        "JOIN projects p ON p.id = d.project_id "
        "WHERE 1=1"
    )
    params: list = []
    if area is not None:
        sql += " AND p.area_slug = ?"
        params.append(area)
    sql += " GROUP BY d.project_id"
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return {r["project_id"]: {"total": r["total"], "done": r["done"] or 0} for r in rows}


@router.get("/api/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: str):
    with get_conn() as conn:
        row = conn.execute(
            f"SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
    if not row:
        raise HTTPException(404, detail="Project not found")
    return dict(row)


@router.post("/api/projects", response_model=ProjectOut, status_code=201)
def create_project(body: ProjectCreate):
    title = body.title.strip()
    if not title:
        raise HTTPException(400, detail="title is required")
    project_id = str(uuid.uuid4())[:8]
    now = utcnow_iso_z()
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
            f"SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
    return dict(row)


@router.patch("/api/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: str, body: ProjectUpdate):
    fields: dict = {}
    for name in body.model_fields_set:
        fields[name] = getattr(body, name)
    if not fields:
        raise HTTPException(400, detail="Nothing to update")

    with get_conn() as conn:
        existing = conn.execute(
            "SELECT status, archived_at FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
        if not existing:
            raise HTTPException(404, detail="Project not found")

        if "status" in fields:
            if fields["status"] == "done" and existing["status"] != "done":
                fields["completed_at"] = utcnow_iso_z()
            elif fields["status"] != "done" and existing["status"] == "done":
                fields["completed_at"] = None

        fields["updated_at"] = utcnow_iso_z()
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [project_id]
        conn.execute(f"UPDATE projects SET {set_clause} WHERE id = ?", values)

        if "area_slug" in fields:
            conn.execute(
                "UPDATE quests SET area_slug = ? WHERE project_id = ?",
                (fields["area_slug"], project_id),
            )

        # Ao arquivar, fecha qualquer sessão ativa das quests desse projeto —
        # evita que o banner continue rodando timer de uma quest que sumiu
        # das views. Só dispara na transição (era ativo, vira arquivado).
        if (
            "archived_at" in fields
            and fields["archived_at"]
            and not existing["archived_at"]
        ):
            now = utcnow_iso_z()
            conn.execute(
                """UPDATE quest_sessions
                   SET ended_at = ?
                   WHERE ended_at IS NULL
                     AND quest_id IN (SELECT id FROM quests WHERE project_id = ?)""",
                (now, project_id),
            )

        conn.commit()

        # Sync opcional do Google Calendar em mudanças de deadline.
        cal_svc = calendar_state.svc
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
            f"SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
    return dict(row)


@router.delete("/api/projects/{project_id}", status_code=204)
def delete_project(project_id: str):
    """ON DELETE CASCADE remove deliverables e quests filhas."""
    with get_conn() as conn:
        res = conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        if res.rowcount == 0:
            raise HTTPException(404, detail="Project not found")
        conn.commit()
    return None
