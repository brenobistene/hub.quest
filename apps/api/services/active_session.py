"""Busca a sessão ativa global do usuário (uma só, atravessa quest/task/routine)."""
from __future__ import annotations

from typing import Optional


def find_active_session(
    conn,
    exclude_type: Optional[str] = None,
    exclude_id: Optional[str] = None,
) -> Optional[dict]:
    """Retorna a única sessão ativa (quest/task/routine), ou None.

    `exclude_type`/`exclude_id` permitem pular a sessão da entidade que
    está tentando iniciar/retomar, pra não conflitar consigo mesma.

    Shape de retorno: {type, id, title, started_at}.
    """
    # Quest
    if exclude_type != "quest":
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
            (exclude_id,),
        ).fetchone()
        if row:
            return {"type": "quest", "id": row["id"], "title": row["title"], "started_at": row["started_at"]}

    # Task
    if exclude_type != "task":
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
            (exclude_id,),
        ).fetchone()
        if row:
            return {"type": "task", "id": row["id"], "title": row["title"], "started_at": row["started_at"]}

    # Routine
    if exclude_type != "routine":
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
            (exclude_id,),
        ).fetchone()
        if row:
            return {"type": "routine", "id": row["id"], "title": row["title"], "started_at": row["started_at"]}

    return None
