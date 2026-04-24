import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException

from db import get_conn
from models.quest import QuestCreate, QuestOut, QuestUpdate
from models.session import SessionOut
from services.active_session import find_active_session
from services.utils import calculate_quest_duration, parse_iso, utcnow_iso_z

router = APIRouter()


# ─── Quests CRUD ─────────────────────────────────────────────────────────────

@router.get("/api/quests", response_model=list[QuestOut])
def list_quests(
    area: Optional[str] = None,
    status: Optional[str] = None,
    project_id: Optional[str] = None,
    deliverable_id: Optional[str] = None,
):
    """Lista quests (work items). Filtros por área, status, projeto e entregável."""
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

        if project_id or deliverable_id:
            sql += " ORDER BY sort_order ASC"
        else:
            sql += (
                " ORDER BY CASE priority"
                " WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,"
                " deadline ASC NULLS LAST"
            )
        rows = conn.execute(sql, params).fetchall()

        sessions = conn.execute(
            "SELECT quest_id, started_at, ended_at FROM quest_sessions WHERE ended_at IS NOT NULL"
        ).fetchall()
        worked_sec: dict[str, int] = {}
        for s in sessions:
            try:
                st = parse_iso(s["started_at"]).timestamp()
                en = parse_iso(s["ended_at"]).timestamp()
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


@router.post("/api/quests", response_model=QuestOut, status_code=201)
def create_quest(body: QuestCreate):
    """project_id e deliverable_id obrigatórios. Valida que pertencem ao mesmo projeto."""
    quest_id = str(uuid.uuid4())[:8]
    now = utcnow_iso_z()
    with get_conn() as conn:
        project = conn.execute(
            "SELECT id FROM projects WHERE id = ?", (body.project_id,)
        ).fetchone()
        if not project:
            raise HTTPException(422, detail=f"Project '{body.project_id}' not found")
        deliv = conn.execute(
            "SELECT project_id FROM deliverables WHERE id = ?",
            (body.deliverable_id,),
        ).fetchone()
        if not deliv:
            raise HTTPException(422, detail=f"Deliverable '{body.deliverable_id}' not found")
        if deliv["project_id"] != body.project_id:
            raise HTTPException(422, detail="O entregável escolhido não pertence a esse projeto.")
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


@router.patch("/api/quests/{quest_id}", response_model=QuestOut)
def update_quest(quest_id: str, body: QuestUpdate):
    """Atualiza quest. Não expõe campos de projeto (esses vão em /api/projects)."""
    fields: dict = {}
    for field_name in body.model_fields_set:
        fields[field_name] = getattr(body, field_name)
    if not fields:
        raise HTTPException(400, detail="Nothing to update")
    fields["updated_at"] = utcnow_iso_z()
    with get_conn() as conn:
        if "deliverable_id" in fields and fields["deliverable_id"] is None:
            raise HTTPException(422, detail="Quest precisa estar amarrada a um entregável.")
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
                        422, detail="O entregável escolhido não pertence a esse projeto.",
                    )

        TERMINAL = ("done", "cancelled")
        if "status" in fields:
            current = conn.execute("SELECT status FROM quests WHERE id = ?", (quest_id,)).fetchone()
            prev_status = current["status"] if current else None
            new_status = fields["status"]
            if new_status in TERMINAL and prev_status not in TERMINAL:
                fields["completed_at"] = utcnow_iso_z()
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
    with get_conn() as conn2:
        sessions = conn2.execute(
            "SELECT started_at, ended_at FROM quest_sessions WHERE quest_id = ? AND ended_at IS NOT NULL",
            (quest_id,),
        ).fetchall()
    total_sec = 0
    for s in sessions:
        try:
            st = parse_iso(s["started_at"]).timestamp()
            en = parse_iso(s["ended_at"]).timestamp()
            if en > st:
                total_sec += int(en - st)
        except Exception:
            continue
    d["worked_minutes"] = total_sec // 60
    return d


@router.delete("/api/quests/{quest_id}", status_code=204)
def delete_quest(quest_id: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM quests WHERE id = ?", (quest_id,))
        conn.commit()
    return None


@router.post("/api/quests/reorder")
def reorder_quests(body: dict):
    """Reorder por sort_order."""
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


# ─── Quest Sessions ──────────────────────────────────────────────────────────

@router.get("/api/quests/{quest_id}/sessions", response_model=list[SessionOut])
def list_sessions(quest_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM quest_sessions WHERE quest_id = ? ORDER BY session_num ASC",
            (quest_id,),
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/quests/{quest_id}/sessions/start", response_model=SessionOut, status_code=201)
def start_session(quest_id: str):
    now = utcnow_iso_z()
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


@router.post("/api/quests/{quest_id}/sessions/pause", response_model=SessionOut)
def pause_session(quest_id: str):
    now = utcnow_iso_z()
    with get_conn() as conn:
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


@router.post("/api/quests/{quest_id}/sessions/resume", response_model=SessionOut, status_code=201)
def resume_session(quest_id: str):
    now = utcnow_iso_z()
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
