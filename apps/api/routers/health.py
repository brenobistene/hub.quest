"""Endpoints do módulo Hub Health — v0.

Cobre Domain, Item, Record e Settings. Métricas (cidadãs de primeira classe
pra Build consumir) entram em fase próxima.

Filosofia rigorosa de "observação > julgamento": nenhum endpoint cobra
registro, premia constância ou pune ausência. Ver docs/hub-health/PLAN.md.
"""
from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

from db import get_conn
from models.health import (
    DomainCreate,
    DomainOut,
    DomainUpdate,
    ItemCreate,
    ItemOut,
    ItemUpdate,
    RecordCreate,
    RecordOut,
    RecordUpdate,
    SettingsOut,
    SettingsUpdate,
)
from services.utils import utcnow_iso_z

router = APIRouter(prefix="/api/health", tags=["health"])


# ─── Templates suportados (validação de payload por template) ─────────────

VALID_TEMPLATES = {
    "janela_qualidade",
    "atividade_tipo",
    "refeicao_2modos",
    "consumo_vontade",
    "metrica_simples",
    "evento_escala",
}


def _validate_payload(template: str, payload: dict[str, Any], item_id: Optional[int]) -> None:
    """Valida que o payload bate com o template do domínio. Lança 422 em erro.

    Mantém validação simples — só campos obrigatórios e formato básico.
    Validações semânticas mais ricas (ranges, formatos custom) podem entrar
    depois quando virarem necessidade real.
    """
    if template == "janela_qualidade":
        if "hora_inicio" not in payload or "hora_fim" not in payload:
            raise HTTPException(422, detail="janela_qualidade exige hora_inicio e hora_fim")
        for k in ("hora_inicio", "hora_fim"):
            v = payload[k]
            if not isinstance(v, str) or len(v) != 5 or v[2] != ":":
                raise HTTPException(422, detail=f"{k} deve ser HH:MM, recebido: {v!r}")
        q = payload.get("qualidade")
        if q is not None and (not isinstance(q, int) or q < 1 or q > 5):
            raise HTTPException(422, detail="qualidade deve ser int 1-5 ou null")
        tipo = payload.get("tipo", "noturno")
        if tipo not in ("noturno", "cochilo"):
            raise HTTPException(422, detail="tipo deve ser 'noturno' ou 'cochilo'")

    elif template == "atividade_tipo":
        if item_id is None:
            raise HTTPException(422, detail="atividade_tipo exige item_id")
        d = payload.get("duracao_min")
        if not isinstance(d, int) or d < 0:
            raise HTTPException(422, detail="duracao_min obrigatório (int ≥ 0)")
        i = payload.get("intensidade")
        if i is not None and (not isinstance(i, int) or i < 1 or i > 5):
            raise HTTPException(422, detail="intensidade deve ser int 1-5 ou null")

    elif template == "refeicao_2modos":
        # 2 modos: dieta (item_id + comeu) ou livre (item_id null + descricao)
        if item_id is None:
            desc = payload.get("descricao")
            if not isinstance(desc, str) or not desc.strip():
                raise HTTPException(
                    422,
                    detail="modo livre (sem item_id) exige descricao não-vazia",
                )
        else:
            comeu = payload.get("comeu", True)
            if not isinstance(comeu, bool):
                raise HTTPException(422, detail="comeu deve ser bool")

    elif template == "consumo_vontade":
        if item_id is None:
            raise HTTPException(422, detail="consumo_vontade exige item_id")
        q = payload.get("quantidade")
        if not isinstance(q, (int, float)) or q < 0:
            raise HTTPException(422, detail="quantidade obrigatória (≥ 0)")
        v = payload.get("vontade")
        if v is not None and (not isinstance(v, int) or v < 1 or v > 5):
            raise HTTPException(422, detail="vontade deve ser int 1-5 ou null")

    elif template == "metrica_simples":
        if item_id is None:
            raise HTTPException(422, detail="metrica_simples exige item_id")
        v = payload.get("valor")
        if not isinstance(v, (int, float)):
            raise HTTPException(422, detail="valor obrigatório (numérico)")

    elif template == "evento_escala":
        e = payload.get("escala")
        if not isinstance(e, int) or e < 1 or e > 5:
            raise HTTPException(422, detail="escala obrigatória (int 1-5)")

    else:
        raise HTTPException(422, detail=f"Template desconhecido: {template!r}")


def _hydrate_domain(row) -> dict:
    return {
        **dict(row),
        "usa_itens": bool(row["usa_itens"]),
        "lembrete_ativo": bool(row["lembrete_ativo"]),
        "ativo": bool(row["ativo"]),
    }


def _hydrate_item(row) -> dict:
    return {**dict(row), "arquivado": bool(row["arquivado"])}


def _hydrate_record(row) -> dict:
    return {
        **dict(row),
        "payload": json.loads(row["payload"]) if row["payload"] else {},
    }


# ─── Domain ───────────────────────────────────────────────────────────────

DOMAIN_COLUMNS = (
    "slug, nome, cor, icone, template, usa_itens, lembrete_ativo, "
    "ausencia_threshold_dias, ordem, ativo, criado_em, atualizado_em"
)


@router.get("/domains", response_model=list[DomainOut])
def list_domains(include_inactive: bool = False):
    sql = f"SELECT {DOMAIN_COLUMNS} FROM health_domain"
    if not include_inactive:
        sql += " WHERE ativo = 1"
    sql += " ORDER BY ordem ASC, slug ASC"
    with get_conn() as conn:
        rows = conn.execute(sql).fetchall()
    return [_hydrate_domain(r) for r in rows]


@router.get("/domains/{slug}", response_model=DomainOut)
def get_domain(slug: str):
    with get_conn() as conn:
        row = conn.execute(
            f"SELECT {DOMAIN_COLUMNS} FROM health_domain WHERE slug = ?", (slug,)
        ).fetchone()
        if not row:
            raise HTTPException(404, detail="Domínio não encontrado")
    return _hydrate_domain(row)


@router.post("/domains", response_model=DomainOut, status_code=201)
def create_domain(body: DomainCreate):
    if body.template not in VALID_TEMPLATES:
        raise HTTPException(
            422,
            detail=f"Template inválido. Aceitos: {sorted(VALID_TEMPLATES)}",
        )
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT 1 FROM health_domain WHERE slug = ?", (body.slug,)
        ).fetchone()
        if existing:
            raise HTTPException(409, detail=f"Domínio '{body.slug}' já existe")

        ordem = body.ordem
        if ordem is None:
            row = conn.execute(
                "SELECT COALESCE(MAX(ordem), 0) + 1 AS next_ordem FROM health_domain"
            ).fetchone()
            ordem = row["next_ordem"]

        now = utcnow_iso_z()
        conn.execute(
            "INSERT INTO health_domain"
            "(slug, nome, cor, icone, template, usa_itens, lembrete_ativo,"
            " ausencia_threshold_dias, ordem, criado_em, atualizado_em) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                body.slug,
                body.nome,
                body.cor,
                body.icone,
                body.template,
                int(body.usa_itens),
                int(body.lembrete_ativo),
                body.ausencia_threshold_dias,
                ordem,
                now,
                now,
            ),
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {DOMAIN_COLUMNS} FROM health_domain WHERE slug = ?",
            (body.slug,),
        ).fetchone()
    return _hydrate_domain(row)


@router.patch("/domains/{slug}", response_model=DomainOut)
def update_domain(slug: str, body: DomainUpdate):
    fields: dict = {}
    for name in body.model_fields_set:
        val = getattr(body, name)
        fields[name] = int(val) if isinstance(val, bool) else val
    if not fields:
        raise HTTPException(400, detail="Nada a atualizar")
    fields["atualizado_em"] = utcnow_iso_z()
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with get_conn() as conn:
        cur = conn.execute(
            f"UPDATE health_domain SET {set_clause} WHERE slug = ?",
            [*fields.values(), slug],
        )
        if cur.rowcount == 0:
            raise HTTPException(404, detail="Domínio não encontrado")
        conn.commit()
        row = conn.execute(
            f"SELECT {DOMAIN_COLUMNS} FROM health_domain WHERE slug = ?", (slug,)
        ).fetchone()
    return _hydrate_domain(row)


@router.delete("/domains/{slug}", status_code=204)
def delete_domain(slug: str):
    """Hard delete. Bloqueia (409) se domínio tem itens ou registros.
    Pra desativar sem perder, use PATCH com `ativo: false`."""
    with get_conn() as conn:
        n_records = conn.execute(
            "SELECT COUNT(*) AS n FROM health_record WHERE domain_slug = ?", (slug,)
        ).fetchone()["n"]
        if n_records > 0:
            raise HTTPException(
                409,
                detail=f"Domínio tem {n_records} registros. Desative com PATCH "
                "ativo:false em vez de deletar.",
            )
        n_items = conn.execute(
            "SELECT COUNT(*) AS n FROM health_item WHERE domain_slug = ?", (slug,)
        ).fetchone()["n"]
        if n_items > 0:
            raise HTTPException(
                409,
                detail=f"Domínio tem {n_items} itens. Delete os itens antes "
                "ou use PATCH ativo:false pra desativar.",
            )
        cur = conn.execute("DELETE FROM health_domain WHERE slug = ?", (slug,))
        if cur.rowcount == 0:
            raise HTTPException(404, detail="Domínio não encontrado")
        conn.commit()


# ─── Item ─────────────────────────────────────────────────────────────────

ITEM_COLUMNS = (
    "id, domain_slug, nome, unidade, horario_esperado, descricao, cor, "
    "arquivado, arquivado_em, ordem, criado_em, atualizado_em"
)


@router.get("/domains/{slug}/items", response_model=list[ItemOut])
def list_items(slug: str, include_archived: bool = False):
    with get_conn() as conn:
        if not conn.execute(
            "SELECT 1 FROM health_domain WHERE slug = ?", (slug,)
        ).fetchone():
            raise HTTPException(404, detail="Domínio não encontrado")
        sql = f"SELECT {ITEM_COLUMNS} FROM health_item WHERE domain_slug = ?"
        if not include_archived:
            sql += " AND arquivado = 0"
        sql += " ORDER BY ordem ASC, id ASC"
        rows = conn.execute(sql, (slug,)).fetchall()
    return [_hydrate_item(r) for r in rows]


@router.post("/domains/{slug}/items", response_model=ItemOut, status_code=201)
def create_item(slug: str, body: ItemCreate):
    with get_conn() as conn:
        domain = conn.execute(
            "SELECT usa_itens FROM health_domain WHERE slug = ?", (slug,)
        ).fetchone()
        if not domain:
            raise HTTPException(404, detail="Domínio não encontrado")
        if not domain["usa_itens"]:
            raise HTTPException(
                422,
                detail=f"Domínio '{slug}' não usa itens (usa_itens=false)",
            )

        ordem = body.ordem
        if ordem is None:
            row = conn.execute(
                "SELECT COALESCE(MAX(ordem), 0) + 1 AS next_ordem "
                "FROM health_item WHERE domain_slug = ? AND arquivado = 0",
                (slug,),
            ).fetchone()
            ordem = row["next_ordem"]

        now = utcnow_iso_z()
        cur = conn.execute(
            "INSERT INTO health_item"
            "(domain_slug, nome, unidade, horario_esperado, descricao, cor,"
            " ordem, criado_em, atualizado_em) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                slug,
                body.nome,
                body.unidade,
                body.horario_esperado,
                body.descricao,
                body.cor,
                ordem,
                now,
                now,
            ),
        )
        new_id = cur.lastrowid
        conn.commit()
        row = conn.execute(
            f"SELECT {ITEM_COLUMNS} FROM health_item WHERE id = ?", (new_id,)
        ).fetchone()
    return _hydrate_item(row)


@router.patch("/items/{item_id}", response_model=ItemOut)
def update_item(item_id: int, body: ItemUpdate):
    fields: dict = {}
    for name in body.model_fields_set:
        fields[name] = getattr(body, name)
    if not fields:
        raise HTTPException(400, detail="Nada a atualizar")
    fields["atualizado_em"] = utcnow_iso_z()
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with get_conn() as conn:
        cur = conn.execute(
            f"UPDATE health_item SET {set_clause} WHERE id = ?",
            [*fields.values(), item_id],
        )
        if cur.rowcount == 0:
            raise HTTPException(404, detail="Item não encontrado")
        conn.commit()
        row = conn.execute(
            f"SELECT {ITEM_COLUMNS} FROM health_item WHERE id = ?", (item_id,)
        ).fetchone()
    return _hydrate_item(row)


@router.post("/items/{item_id}/archive", response_model=ItemOut)
def archive_item(item_id: int):
    """Soft-delete: marca arquivado=1. Preserva FK em registros históricos."""
    now = utcnow_iso_z()
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE health_item SET arquivado = 1, arquivado_em = ?, "
            "atualizado_em = ? WHERE id = ? AND arquivado = 0",
            (now, now, item_id),
        )
        if cur.rowcount == 0:
            existing = conn.execute(
                "SELECT 1 FROM health_item WHERE id = ?", (item_id,)
            ).fetchone()
            if not existing:
                raise HTTPException(404, detail="Item não encontrado")
            # já arquivado — idempotente
        conn.commit()
        row = conn.execute(
            f"SELECT {ITEM_COLUMNS} FROM health_item WHERE id = ?", (item_id,)
        ).fetchone()
    return _hydrate_item(row)


@router.post("/items/{item_id}/unarchive", response_model=ItemOut)
def unarchive_item(item_id: int):
    now = utcnow_iso_z()
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE health_item SET arquivado = 0, arquivado_em = NULL, "
            "atualizado_em = ? WHERE id = ? AND arquivado = 1",
            (now, item_id),
        )
        if cur.rowcount == 0:
            existing = conn.execute(
                "SELECT 1 FROM health_item WHERE id = ?", (item_id,)
            ).fetchone()
            if not existing:
                raise HTTPException(404, detail="Item não encontrado")
        conn.commit()
        row = conn.execute(
            f"SELECT {ITEM_COLUMNS} FROM health_item WHERE id = ?", (item_id,)
        ).fetchone()
    return _hydrate_item(row)


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: int):
    """Hard delete. Bloqueia (409) se item tem registros vinculados.
    Pra esconder sem perder, use POST /items/{id}/archive."""
    with get_conn() as conn:
        n_records = conn.execute(
            "SELECT COUNT(*) AS n FROM health_record WHERE item_id = ?", (item_id,)
        ).fetchone()["n"]
        if n_records > 0:
            raise HTTPException(
                409,
                detail=f"Item tem {n_records} registros. Use archive em vez de delete.",
            )
        cur = conn.execute("DELETE FROM health_item WHERE id = ?", (item_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, detail="Item não encontrado")
        conn.commit()


# ─── Record ───────────────────────────────────────────────────────────────

RECORD_COLUMNS = (
    "id, domain_slug, item_id, data, horario, payload, notas, "
    "criado_em, atualizado_em"
)


@router.get("/domains/{slug}/records", response_model=list[RecordOut])
def list_records(
    slug: str,
    from_: Optional[str] = Query(None, alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    to: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    item_id: Optional[int] = None,
    limit: int = Query(500, ge=1, le=5000),
):
    with get_conn() as conn:
        if not conn.execute(
            "SELECT 1 FROM health_domain WHERE slug = ?", (slug,)
        ).fetchone():
            raise HTTPException(404, detail="Domínio não encontrado")
        sql = f"SELECT {RECORD_COLUMNS} FROM health_record WHERE domain_slug = ?"
        params: list = [slug]
        if from_:
            sql += " AND data >= ?"
            params.append(from_)
        if to:
            sql += " AND data <= ?"
            params.append(to)
        if item_id is not None:
            sql += " AND item_id = ?"
            params.append(item_id)
        sql += " ORDER BY data DESC, horario DESC NULLS LAST, id DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
    return [_hydrate_record(r) for r in rows]


@router.post("/domains/{slug}/records", response_model=RecordOut, status_code=201)
def create_record(slug: str, body: RecordCreate):
    """Cria registro novo. Valida payload contra template do domínio."""
    with get_conn() as conn:
        domain = conn.execute(
            "SELECT template, usa_itens FROM health_domain WHERE slug = ?",
            (slug,),
        ).fetchone()
        if not domain:
            raise HTTPException(404, detail="Domínio não encontrado")

        # Item validation: se usa_itens e item_id passed, deve existir e ser do domínio
        if body.item_id is not None:
            item = conn.execute(
                "SELECT domain_slug FROM health_item WHERE id = ?", (body.item_id,)
            ).fetchone()
            if not item:
                raise HTTPException(404, detail="Item não encontrado")
            if item["domain_slug"] != slug:
                raise HTTPException(
                    422,
                    detail=f"Item não pertence ao domínio '{slug}'",
                )
        elif domain["usa_itens"] and domain["template"] != "refeicao_2modos":
            # refeicao_2modos permite item_id null (modo livre); demais não
            raise HTTPException(
                422,
                detail=f"Domínio '{slug}' exige item_id",
            )

        _validate_payload(domain["template"], body.payload, body.item_id)

        from datetime import date
        data = body.data or date.today().isoformat()
        now = utcnow_iso_z()

        cur = conn.execute(
            "INSERT INTO health_record"
            "(domain_slug, item_id, data, horario, payload, notas,"
            " criado_em, atualizado_em) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                slug,
                body.item_id,
                data,
                body.horario,
                json.dumps(body.payload),
                body.notas,
                now,
                now,
            ),
        )
        new_id = cur.lastrowid
        conn.commit()
        row = conn.execute(
            f"SELECT {RECORD_COLUMNS} FROM health_record WHERE id = ?", (new_id,)
        ).fetchone()
    return _hydrate_record(row)


@router.patch("/records/{record_id}", response_model=RecordOut)
def update_record(record_id: int, body: RecordUpdate):
    with get_conn() as conn:
        record = conn.execute(
            "SELECT domain_slug, item_id, payload FROM health_record WHERE id = ?",
            (record_id,),
        ).fetchone()
        if not record:
            raise HTTPException(404, detail="Registro não encontrado")

        fields: dict = {}
        for name in body.model_fields_set:
            val = getattr(body, name)
            if name == "payload":
                fields[name] = json.dumps(val) if val is not None else None
            else:
                fields[name] = val

        if not fields:
            raise HTTPException(400, detail="Nada a atualizar")

        # Se mudou item_id ou payload, re-valida contra template
        new_item_id = (
            fields["item_id"] if "item_id" in fields else record["item_id"]
        )
        new_payload_str = (
            fields["payload"] if "payload" in fields else record["payload"]
        )
        domain = conn.execute(
            "SELECT template FROM health_domain WHERE slug = ?",
            (record["domain_slug"],),
        ).fetchone()
        new_payload = json.loads(new_payload_str) if new_payload_str else {}
        _validate_payload(domain["template"], new_payload, new_item_id)

        # Validar que o novo item_id pertence ao domínio
        if "item_id" in fields and fields["item_id"] is not None:
            item = conn.execute(
                "SELECT domain_slug FROM health_item WHERE id = ?",
                (fields["item_id"],),
            ).fetchone()
            if not item:
                raise HTTPException(404, detail="Item não encontrado")
            if item["domain_slug"] != record["domain_slug"]:
                raise HTTPException(
                    422,
                    detail="Item não pertence ao domínio do registro",
                )

        fields["atualizado_em"] = utcnow_iso_z()
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE health_record SET {set_clause} WHERE id = ?",
            [*fields.values(), record_id],
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {RECORD_COLUMNS} FROM health_record WHERE id = ?", (record_id,)
        ).fetchone()
    return _hydrate_record(row)


@router.delete("/records/{record_id}", status_code=204)
def delete_record(record_id: int):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM health_record WHERE id = ?", (record_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, detail="Registro não encontrado")
        conn.commit()


# ─── Settings ─────────────────────────────────────────────────────────────

@router.get("/settings", response_model=SettingsOut)
def get_settings():
    with get_conn() as conn:
        row = conn.execute(
            "SELECT lembrete_horas_apos_acordar, dashboard_card_visivel, atualizado_em "
            "FROM health_settings WHERE id = 1"
        ).fetchone()
        if not row:
            now = utcnow_iso_z()
            conn.execute("INSERT INTO health_settings(id) VALUES (1)")
            conn.commit()
            row = conn.execute(
                "SELECT lembrete_horas_apos_acordar, dashboard_card_visivel, atualizado_em "
                "FROM health_settings WHERE id = 1"
            ).fetchone()
    return {
        **dict(row),
        "dashboard_card_visivel": bool(row["dashboard_card_visivel"]),
    }


@router.patch("/settings", response_model=SettingsOut)
def update_settings(body: SettingsUpdate):
    fields: dict = {}
    for name in body.model_fields_set:
        val = getattr(body, name)
        fields[name] = int(val) if isinstance(val, bool) else val
    if not fields:
        raise HTTPException(400, detail="Nada a atualizar")
    fields["atualizado_em"] = utcnow_iso_z()
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with get_conn() as conn:
        conn.execute(
            f"UPDATE health_settings SET {set_clause} WHERE id = 1",
            [*fields.values()],
        )
        conn.commit()
        row = conn.execute(
            "SELECT lembrete_horas_apos_acordar, dashboard_card_visivel, atualizado_em "
            "FROM health_settings WHERE id = 1"
        ).fetchone()
    return {
        **dict(row),
        "dashboard_card_visivel": bool(row["dashboard_card_visivel"]),
    }
