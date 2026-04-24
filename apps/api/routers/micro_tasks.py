import uuid

from fastapi import APIRouter

from db import get_conn
from models.micro_task import MicroTaskCreate, MicroTaskOut

router = APIRouter()


@router.get("/api/micro-tasks", response_model=list[MicroTaskOut])
def list_micro_tasks():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, title, created_at FROM micro_tasks ORDER BY created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/micro-tasks", response_model=MicroTaskOut, status_code=201)
def create_micro_task(body: MicroTaskCreate):
    micro_id = str(uuid.uuid4())[:8]
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO micro_tasks(id, title) VALUES(?, ?)",
            (micro_id, body.title),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM micro_tasks WHERE id = ?", (micro_id,)).fetchone()
    return dict(row)


@router.delete("/api/micro-tasks/{micro_id}", status_code=204)
def delete_micro_task(micro_id: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM micro_tasks WHERE id = ?", (micro_id,))
        conn.commit()
    return None
