import re
import unicodedata

from fastapi import APIRouter, HTTPException

from db import get_conn
from models.area import AreaCreate, AreaOut, AreaUpdate

router = APIRouter()


def slugify(text: str) -> str:
    """Lowercase, strip accents, replace non-alphanumeric with hyphens."""
    nfkd = unicodedata.normalize("NFKD", text)
    ascii_only = "".join(c for c in nfkd if not unicodedata.combining(c))
    s = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_only).strip("-").lower()
    return s or "area"


@router.get("/api/areas", response_model=list[AreaOut])
def list_areas():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT slug, name, description, color, sort_order FROM areas ORDER BY sort_order, name"
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/areas", response_model=AreaOut, status_code=201)
def create_area(body: AreaCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, detail="name is required")

    base_slug = slugify(body.slug or name)
    with get_conn() as conn:
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


@router.patch("/api/areas/{slug}", response_model=AreaOut)
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


@router.delete("/api/areas/{slug}", status_code=204)
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
