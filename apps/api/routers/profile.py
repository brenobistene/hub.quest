from fastapi import APIRouter, HTTPException

from db import get_conn
from models.profile import ProfileOut, ProfileUpdate
from services.utils import utcnow_iso_z

router = APIRouter()


@router.get("/api/profile", response_model=ProfileOut)
def get_profile():
    with get_conn() as conn:
        row = conn.execute(
            "SELECT name, role, avatar_url FROM user_profile WHERE id = 1"
        ).fetchone()
        if not row:
            conn.execute(
                "INSERT INTO user_profile(id, name, role, avatar_url) VALUES (1, '', '', '')"
            )
            conn.commit()
            return {"name": "", "role": "", "avatar_url": ""}
    return dict(row)


@router.patch("/api/profile", response_model=ProfileOut)
def update_profile(body: ProfileUpdate):
    fields: dict = {}
    for name in body.model_fields_set:
        fields[name] = getattr(body, name)
    if not fields:
        raise HTTPException(400, detail="Nothing to update")
    fields["updated_at"] = utcnow_iso_z()
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
