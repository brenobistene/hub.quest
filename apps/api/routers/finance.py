"""Hub Finance — endpoints v0 (vertical slice).

CRUD básico de Conta, Categoria, Transação + saldo. Sem pynubank, sem fatura,
sem dívida — essas vêm em fases posteriores. Doc autoritativa:
docs/hub-finance/PLAN.md.

Convenção de paths: /api/finance/<resource>. Mantém isolado dos outros
módulos do Hub Quest e fica claro no swagger/docs.
"""
from __future__ import annotations

import csv
import io
import uuid
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from db import get_conn
from models.finance import (
    AccountCreate,
    AccountOut,
    AccountUpdate,
    ApplyTemplateBody,
    CategorizationRuleCreate,
    CategorizationRuleOut,
    CategorizationRuleUpdate,
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    ClientCreate,
    ClientOut,
    ClientUpdate,
    DebtCreate,
    DebtOut,
    DebtUpdate,
    ImportSummary,
    InvoiceCreate,
    InvoiceOut,
    InvoicePayBody,
    InvoiceUpdate,
    ParcelaCreate,
    ParcelaOut,
    ParcelaUpdate,
    TransactionCreate,
    TransactionOut,
    TransactionUpdate,
)
from services.utils import utcnow_iso_z


router = APIRouter()


def _new_id() -> str:
    return str(uuid.uuid4())[:8]


# ─── Accounts ──────────────────────────────────────────────────────────────

ACCOUNT_COLUMNS = "id, nome, tipo, moeda, origem_dados, sort_order, cotacao_brl"


def _account_with_balance(conn, row) -> dict:
    """Combina row de fin_account com saldo calculado (soma das transações)."""
    d = dict(row)
    saldo_row = conn.execute(
        "SELECT COALESCE(SUM(valor), 0) AS saldo FROM fin_transaction WHERE conta_id = ?",
        (d["id"],),
    ).fetchone()
    d["saldo"] = float(saldo_row["saldo"] or 0)
    return d


@router.get("/api/finance/accounts", response_model=list[AccountOut])
def list_accounts():
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT {ACCOUNT_COLUMNS} FROM fin_account ORDER BY sort_order ASC, created_at ASC"
        ).fetchall()
        return [_account_with_balance(conn, r) for r in rows]


@router.post("/api/finance/accounts", response_model=AccountOut, status_code=201)
def create_account(body: AccountCreate):
    nome = body.nome.strip()
    if not nome:
        raise HTTPException(400, detail="nome é obrigatório")
    account_id = _new_id()
    with get_conn() as conn:
        max_sort = conn.execute(
            "SELECT COALESCE(MAX(sort_order), 0) AS m FROM fin_account"
        ).fetchone()
        sort_order = (max_sort["m"] or 0) + 1
        conn.execute(
            "INSERT INTO fin_account(id, nome, tipo, moeda, origem_dados, sort_order, cotacao_brl) "
            "VALUES(?,?,?,?,?,?,?)",
            (account_id, nome, body.tipo, body.moeda, body.origem_dados, sort_order,
             body.cotacao_brl),
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {ACCOUNT_COLUMNS} FROM fin_account WHERE id = ?",
            (account_id,),
        ).fetchone()
        return _account_with_balance(conn, row)


@router.patch("/api/finance/accounts/{account_id}", response_model=AccountOut)
def update_account(account_id: str, body: AccountUpdate):
    fields: dict = {name: getattr(body, name) for name in body.model_fields_set}
    if not fields:
        raise HTTPException(400, detail="Nada a atualizar")
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM fin_account WHERE id = ?", (account_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, detail="Conta não encontrada")
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE fin_account SET {set_clause} WHERE id = ?",
            [*fields.values(), account_id],
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {ACCOUNT_COLUMNS} FROM fin_account WHERE id = ?",
            (account_id,),
        ).fetchone()
        return _account_with_balance(conn, row)


@router.delete("/api/finance/accounts/{account_id}", status_code=204)
def delete_account(account_id: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM fin_account WHERE id = ?", (account_id,))
        conn.commit()
    return None


@router.post("/api/finance/accounts/reorder", status_code=204)
def reorder_accounts(body: dict):
    """Reordena contas por sort_order. Body: `{"ids": [id1, id2, ...]}` na
    ordem desejada. Atribui sort_order = 1, 2, 3... pra cada id."""
    ids = body.get("ids") or []
    if not isinstance(ids, list) or not all(isinstance(i, str) for i in ids):
        raise HTTPException(400, detail="body precisa de `ids` (lista de strings)")
    with get_conn() as conn:
        for idx, account_id in enumerate(ids, start=1):
            conn.execute(
                "UPDATE fin_account SET sort_order = ? WHERE id = ?",
                (idx, account_id),
            )
        conn.commit()
    return None


@router.get("/api/finance/accounts/{account_id}/usage")
def account_usage(account_id: str):
    """Conta o que tá vinculado a essa conta. Usado pelo modal de delete pra
    avisar quanta coisa será apagada (transações cascateiam, faturas idem).
    """
    with get_conn() as conn:
        if not conn.execute(
            "SELECT 1 FROM fin_account WHERE id = ?", (account_id,)
        ).fetchone():
            raise HTTPException(404, detail="Conta não encontrada")
        tx_count = conn.execute(
            "SELECT COUNT(*) AS n FROM fin_transaction WHERE conta_id = ?",
            (account_id,),
        ).fetchone()["n"]
        invoice_count = conn.execute(
            "SELECT COUNT(*) AS n FROM fin_invoice WHERE cartao_id = ?",
            (account_id,),
        ).fetchone()["n"]
    return {
        "account_id": account_id,
        "transactions": tx_count,
        "invoices": invoice_count,
    }


# ─── Categories ────────────────────────────────────────────────────────────

CATEGORY_COLUMNS = "id, nome, tipo, cor, categoria_pai_id, sort_order, limite_mensal"


@router.get("/api/finance/categories", response_model=list[CategoryOut])
def list_categories(tipo: Optional[str] = Query(None)):
    sql = f"SELECT {CATEGORY_COLUMNS} FROM fin_category"
    params: list = []
    if tipo is not None:
        sql += " WHERE tipo = ?"
        params.append(tipo)
    sql += " ORDER BY sort_order ASC, nome ASC"
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/finance/categories", response_model=CategoryOut, status_code=201)
def create_category(body: CategoryCreate):
    nome = body.nome.strip()
    if not nome:
        raise HTTPException(400, detail="nome é obrigatório")
    cat_id = _new_id()
    with get_conn() as conn:
        max_sort = conn.execute(
            "SELECT COALESCE(MAX(sort_order), 0) AS m FROM fin_category"
        ).fetchone()
        sort_order = (max_sort["m"] or 0) + 1
        conn.execute(
            "INSERT INTO fin_category(id, nome, tipo, cor, categoria_pai_id, sort_order, limite_mensal) "
            "VALUES(?,?,?,?,?,?,?)",
            (cat_id, nome, body.tipo, body.cor, body.categoria_pai_id, sort_order,
             body.limite_mensal),
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {CATEGORY_COLUMNS} FROM fin_category WHERE id = ?",
            (cat_id,),
        ).fetchone()
    return dict(row)


@router.patch("/api/finance/categories/{category_id}", response_model=CategoryOut)
def update_category(category_id: str, body: CategoryUpdate):
    fields: dict = {name: getattr(body, name) for name in body.model_fields_set}
    if not fields:
        raise HTTPException(400, detail="Nada a atualizar")
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM fin_category WHERE id = ?", (category_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, detail="Categoria não encontrada")
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE fin_category SET {set_clause} WHERE id = ?",
            [*fields.values(), category_id],
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {CATEGORY_COLUMNS} FROM fin_category WHERE id = ?",
            (category_id,),
        ).fetchone()
    return dict(row)


@router.delete("/api/finance/categories/{category_id}", status_code=204)
def delete_category(category_id: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM fin_category WHERE id = ?", (category_id,))
        conn.commit()
    return None


# ─── Transactions ──────────────────────────────────────────────────────────

TRANSACTION_COLUMNS = (
    "id, data, valor, descricao, conta_id, categoria_id, origem, notas, "
    "nubank_id, divida_id, parcela_id, fatura_id, created_at, updated_at"
)


@router.get("/api/finance/transactions", response_model=list[TransactionOut])
def list_transactions(
    conta_id: Optional[str] = Query(None),
    categoria_id: Optional[str] = Query(None),
    data_de: Optional[str] = Query(None, description="YYYY-MM-DD inclusive"),
    data_ate: Optional[str] = Query(None, description="YYYY-MM-DD inclusive"),
    limit: int = Query(100, ge=1, le=500),
):
    sql = f"SELECT {TRANSACTION_COLUMNS} FROM fin_transaction WHERE 1=1"
    params: list = []
    if conta_id:
        sql += " AND conta_id = ?"
        params.append(conta_id)
    if categoria_id:
        sql += " AND categoria_id = ?"
        params.append(categoria_id)
    if data_de:
        sql += " AND data >= ?"
        params.append(data_de)
    if data_ate:
        sql += " AND data <= ?"
        params.append(data_ate)
    sql += " ORDER BY data DESC, created_at DESC LIMIT ?"
    params.append(limit)
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/finance/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(body: TransactionCreate):
    descricao = body.descricao.strip()
    if not descricao:
        raise HTTPException(400, detail="descricao é obrigatória")
    tx_id = _new_id()
    with get_conn() as conn:
        # Valida FKs explicitamente — devolve 422 amigável em vez de IntegrityError.
        conta = conn.execute(
            "SELECT id, tipo FROM fin_account WHERE id = ?", (body.conta_id,)
        ).fetchone()
        if not conta:
            raise HTTPException(422, detail="conta_id não existe")
        if body.categoria_id and not conn.execute(
            "SELECT 1 FROM fin_category WHERE id = ?", (body.categoria_id,)
        ).fetchone():
            raise HTTPException(422, detail="categoria_id não existe")
        # Auto-vínculo a parcela: só se for entrada (valor > 0) e usuário não
        # passou parcela_id explícito. Helper devolve None se ambíguo.
        suggested_parcela = _suggest_parcela_by_descricao(conn, descricao, body.valor)
        # Auto-vínculo a fatura: se conta é tipo cartão de crédito e
        # categoria não é transferência (pra não confundir pagamento de
        # fatura com compra), garante fatura aberta e vincula.
        fatura_id: Optional[str] = None
        if conta["tipo"] == "credito":
            cat_tipo = None
            if body.categoria_id:
                row = conn.execute(
                    "SELECT tipo FROM fin_category WHERE id = ?", (body.categoria_id,)
                ).fetchone()
                cat_tipo = row["tipo"] if row else None
            if cat_tipo != "transferencia":
                fatura_id = _ensure_open_invoice(conn, body.conta_id, body.data)
        conn.execute(
            "INSERT INTO fin_transaction(id, data, valor, descricao, conta_id, "
            "categoria_id, origem, notas, parcela_id, fatura_id) "
            "VALUES(?,?,?,?,?,?,?,?,?,?)",
            (
                tx_id, body.data, body.valor, descricao, body.conta_id,
                body.categoria_id, body.origem, body.notas, suggested_parcela,
                fatura_id,
            ),
        )
        if suggested_parcela:
            _maybe_update_parcela_status(conn, suggested_parcela)
        conn.commit()
        row = conn.execute(
            f"SELECT {TRANSACTION_COLUMNS} FROM fin_transaction WHERE id = ?",
            (tx_id,),
        ).fetchone()
    return dict(row)


@router.patch("/api/finance/transactions/{tx_id}", response_model=TransactionOut)
def update_transaction(tx_id: str, body: TransactionUpdate):
    fields: dict = {name: getattr(body, name) for name in body.model_fields_set}
    if not fields:
        raise HTTPException(400, detail="Nada a atualizar")
    with get_conn() as conn:
        prev = conn.execute(
            "SELECT divida_id, parcela_id FROM fin_transaction WHERE id = ?", (tx_id,)
        ).fetchone()
        if not prev:
            raise HTTPException(404, detail="Transação não encontrada")
        if "conta_id" in fields and not conn.execute(
            "SELECT 1 FROM fin_account WHERE id = ?", (fields["conta_id"],)
        ).fetchone():
            raise HTTPException(422, detail="conta_id não existe")
        if "categoria_id" in fields and fields["categoria_id"] and not conn.execute(
            "SELECT 1 FROM fin_category WHERE id = ?", (fields["categoria_id"],)
        ).fetchone():
            raise HTTPException(422, detail="categoria_id não existe")
        if "divida_id" in fields and fields["divida_id"] and not conn.execute(
            "SELECT 1 FROM fin_debt WHERE id = ?", (fields["divida_id"],)
        ).fetchone():
            raise HTTPException(422, detail="divida_id não existe")
        if "parcela_id" in fields and fields["parcela_id"] and not conn.execute(
            "SELECT 1 FROM fin_parcela WHERE id = ?", (fields["parcela_id"],)
        ).fetchone():
            raise HTTPException(422, detail="parcela_id não existe")
        if "fatura_id" in fields and fields["fatura_id"] and not conn.execute(
            "SELECT 1 FROM fin_invoice WHERE id = ?", (fields["fatura_id"],)
        ).fetchone():
            raise HTTPException(422, detail="fatura_id não existe")
        fields["updated_at"] = utcnow_iso_z()
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE fin_transaction SET {set_clause} WHERE id = ?",
            [*fields.values(), tx_id],
        )
        # Recalcula status das dívidas afetadas: tanto a anterior (pode ter
        # ficado active de novo) quanto a nova (pode ter zerado).
        affected_debts: set[str] = set()
        if prev["divida_id"]:
            affected_debts.add(prev["divida_id"])
        new_divida = fields.get("divida_id", prev["divida_id"])
        if new_divida:
            affected_debts.add(new_divida)
        for did in affected_debts:
            _maybe_update_debt_status(conn, did)
        # Mesma lógica pras parcelas afetadas.
        affected_parcelas: set[str] = set()
        if prev["parcela_id"]:
            affected_parcelas.add(prev["parcela_id"])
        new_parcela = fields.get("parcela_id", prev["parcela_id"])
        if new_parcela:
            affected_parcelas.add(new_parcela)
        for pid in affected_parcelas:
            _maybe_update_parcela_status(conn, pid)
        conn.commit()
        row = conn.execute(
            f"SELECT {TRANSACTION_COLUMNS} FROM fin_transaction WHERE id = ?",
            (tx_id,),
        ).fetchone()
    return dict(row)


@router.delete("/api/finance/transactions/{tx_id}", status_code=204)
def delete_transaction(tx_id: str):
    with get_conn() as conn:
        # Pega divida_id e parcela_id antes de deletar pra recalcular status.
        row = conn.execute(
            "SELECT divida_id, parcela_id FROM fin_transaction WHERE id = ?", (tx_id,)
        ).fetchone()
        prev_divida = row["divida_id"] if row else None
        prev_parcela = row["parcela_id"] if row else None
        conn.execute("DELETE FROM fin_transaction WHERE id = ?", (tx_id,))
        if prev_divida:
            # Saldo voltou a subir — se era 'paid_off', volta pra 'active'.
            d = conn.execute(
                f"SELECT {DEBT_COLUMNS} FROM fin_debt WHERE id = ?", (prev_divida,)
            ).fetchone()
            if d:
                enriched = _debt_with_progress(conn, d)
                if d["status"] == "paid_off" and enriched["saldo_devedor"] > 0.01:
                    conn.execute(
                        "UPDATE fin_debt SET status = 'active', updated_at = ? WHERE id = ?",
                        (utcnow_iso_z(), prev_divida),
                    )
        if prev_parcela:
            _maybe_update_parcela_status(conn, prev_parcela)
        conn.commit()
    return None


# ─── Summary ───────────────────────────────────────────────────────────────

# ─── Parcelas (recebimentos esperados de projetos) ───────────────────────

PARCELA_COLUMNS = (
    "id, projeto_id, numero, valor, data_prevista, status, observacao"
)


def _parcela_with_recebimento(conn, row) -> dict:
    """Anexa transacao_recebimento_id (FK reverso via fin_transaction.parcela_id).
    Como é 1:1 (uma parcela é paga por uma transação), pega LIMIT 1.
    """
    d = dict(row)
    tx = conn.execute(
        "SELECT id FROM fin_transaction WHERE parcela_id = ? LIMIT 1",
        (d["id"],),
    ).fetchone()
    d["transacao_recebimento_id"] = tx["id"] if tx else None
    return d


def _maybe_update_parcela_status(conn, parcela_id: str) -> None:
    """Se há transação de entrada (valor > 0) vinculada à parcela, marca como
    'recebido'. Se não há, e estava 'recebido', volta pra 'pendente'.
    Não mexe se status era 'cancelada' (decisão manual)."""
    parcela = conn.execute(
        f"SELECT {PARCELA_COLUMNS} FROM fin_parcela WHERE id = ?", (parcela_id,)
    ).fetchone()
    if not parcela or parcela["status"] == "cancelada":
        return
    has_payment = conn.execute(
        "SELECT 1 FROM fin_transaction WHERE parcela_id = ? AND valor > 0 LIMIT 1",
        (parcela_id,),
    ).fetchone()
    target_status = "recebido" if has_payment else "pendente"
    if parcela["status"] != target_status:
        conn.execute(
            "UPDATE fin_parcela SET status = ?, updated_at = ? WHERE id = ?",
            (target_status, utcnow_iso_z(), parcela_id),
        )


@router.get("/api/finance/parcelas")
def list_all_parcelas(status: Optional[str] = Query(None)):
    """Lista parcelas de todos os projetos. Suporta filtro por status.

    Retorna shape estendido com `projeto_titulo` pra UI mostrar contexto sem
    fazer N+1 queries no frontend (caso típico: select de "vincular a parcela"
    no CategorizeModal).
    """
    sql = (
        f"SELECT fp.id, fp.projeto_id, fp.numero, fp.valor, fp.data_prevista, "
        f"       fp.status, fp.observacao, p.title AS projeto_titulo "
        f"FROM fin_parcela fp JOIN projects p ON p.id = fp.projeto_id"
    )
    params: list = []
    if status:
        sql += " WHERE fp.status = ?"
        params.append(status)
    sql += " ORDER BY fp.data_prevista ASC NULLS LAST, fp.numero ASC"
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
        out = []
        for r in rows:
            d = _parcela_with_recebimento(conn, r)
            d["projeto_titulo"] = r["projeto_titulo"]
            out.append(d)
        return out


@router.get("/api/finance/projects/{project_id}/parcelas", response_model=list[ParcelaOut])
def list_parcelas(project_id: str):
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone():
            raise HTTPException(404, detail="Projeto não encontrado")
        rows = conn.execute(
            f"SELECT {PARCELA_COLUMNS} FROM fin_parcela "
            "WHERE projeto_id = ? ORDER BY numero ASC",
            (project_id,),
        ).fetchall()
        return [_parcela_with_recebimento(conn, r) for r in rows]


@router.post(
    "/api/finance/projects/{project_id}/parcelas",
    response_model=ParcelaOut,
    status_code=201,
)
def create_parcela(project_id: str, body: ParcelaCreate):
    if body.valor <= 0:
        raise HTTPException(400, detail="valor deve ser > 0")
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone():
            raise HTTPException(404, detail="Projeto não encontrado")
        max_num = conn.execute(
            "SELECT COALESCE(MAX(numero), 0) AS m FROM fin_parcela WHERE projeto_id = ?",
            (project_id,),
        ).fetchone()["m"]
        parcela_id = _new_id()
        conn.execute(
            "INSERT INTO fin_parcela(id, projeto_id, numero, valor, data_prevista, observacao) "
            "VALUES(?,?,?,?,?,?)",
            (parcela_id, project_id, (max_num or 0) + 1, body.valor,
             body.data_prevista, body.observacao),
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {PARCELA_COLUMNS} FROM fin_parcela WHERE id = ?", (parcela_id,)
        ).fetchone()
        return _parcela_with_recebimento(conn, row)


@router.post(
    "/api/finance/projects/{project_id}/parcelas/apply-template",
    response_model=list[ParcelaOut],
)
def apply_template(project_id: str, body: ApplyTemplateBody):
    """Cria N parcelas a partir do template + valor_acordado do projeto.

    Apaga TODAS as parcelas pendentes existentes (status='pendente') antes
    de aplicar — protege as recebidas. Útil pra testar templates sem perder
    histórico real.
    """
    with get_conn() as conn:
        proj = conn.execute(
            "SELECT id, valor_acordado FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
        if not proj:
            raise HTTPException(404, detail="Projeto não encontrado")
        valor = proj["valor_acordado"]
        if not valor or valor <= 0:
            raise HTTPException(
                422,
                detail="Defina valor_acordado do projeto antes de gerar parcelas",
            )

        # Quantidades + percentuais por template (informativo).
        if body.template == "a_vista":
            partes = [1.0]
        elif body.template == "50_50":
            partes = [0.5, 0.5]
        elif body.template == "parcelado_3x":
            partes = [1/3, 1/3, 1/3]
        elif body.template == "parcelado_4x":
            partes = [0.25, 0.25, 0.25, 0.25]
        else:  # custom — cria 1 parcela vazia, usuário edita
            partes = [1.0]

        # Datas previstas: se data_inicio veio, distribui mensalmente.
        from datetime import date as _date
        from calendar import monthrange
        datas: list[Optional[str]] = []
        if body.data_inicio:
            try:
                d0 = _date.fromisoformat(body.data_inicio)
            except ValueError:
                raise HTTPException(400, detail="data_inicio inválida (use YYYY-MM-DD)")
            for i in range(len(partes)):
                # Avança i meses, capping no último dia do mês destino.
                month = d0.month + i
                year = d0.year + (month - 1) // 12
                month = ((month - 1) % 12) + 1
                day = min(d0.day, monthrange(year, month)[1])
                datas.append(_date(year, month, day).isoformat())
        else:
            datas = [None] * len(partes)

        # Apaga só pendentes — preserva recebidas.
        conn.execute(
            "DELETE FROM fin_parcela WHERE projeto_id = ? AND status = 'pendente'",
            (project_id,),
        )
        # Renumera começando após as recebidas existentes.
        max_num = conn.execute(
            "SELECT COALESCE(MAX(numero), 0) AS m FROM fin_parcela WHERE projeto_id = ?",
            (project_id,),
        ).fetchone()["m"] or 0

        # Arredondamento pra 2 casas + ajuste do último pra zerar a soma.
        valores = [round(valor * p, 2) for p in partes]
        # Corrige drift de arredondamento na última parcela.
        if valores:
            valores[-1] = round(valor - sum(valores[:-1]), 2)

        new_rows = []
        for i, (v, d) in enumerate(zip(valores, datas)):
            pid = _new_id()
            conn.execute(
                "INSERT INTO fin_parcela(id, projeto_id, numero, valor, data_prevista) "
                "VALUES(?,?,?,?,?)",
                (pid, project_id, max_num + i + 1, v, d),
            )
            new_rows.append(pid)

        # Salva o template no projeto pra UI lembrar.
        conn.execute(
            "UPDATE projects SET forma_pagamento_template = ?, updated_at = ? WHERE id = ?",
            (body.template, utcnow_iso_z(), project_id),
        )
        conn.commit()

        rows = conn.execute(
            f"SELECT {PARCELA_COLUMNS} FROM fin_parcela "
            "WHERE projeto_id = ? ORDER BY numero ASC",
            (project_id,),
        ).fetchall()
        return [_parcela_with_recebimento(conn, r) for r in rows]


@router.patch("/api/finance/parcelas/{parcela_id}", response_model=ParcelaOut)
def update_parcela(parcela_id: str, body: ParcelaUpdate):
    fields: dict = {name: getattr(body, name) for name in body.model_fields_set}
    if not fields:
        raise HTTPException(400, detail="Nada a atualizar")
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM fin_parcela WHERE id = ?", (parcela_id,)).fetchone():
            raise HTTPException(404, detail="Parcela não encontrada")
        fields["updated_at"] = utcnow_iso_z()
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE fin_parcela SET {set_clause} WHERE id = ?",
            [*fields.values(), parcela_id],
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {PARCELA_COLUMNS} FROM fin_parcela WHERE id = ?", (parcela_id,)
        ).fetchone()
        return _parcela_with_recebimento(conn, row)


@router.delete("/api/finance/parcelas/{parcela_id}", status_code=204)
def delete_parcela(parcela_id: str):
    with get_conn() as conn:
        # Limpa vínculo de transações antes (FK ALTER não suporta SET NULL).
        conn.execute("UPDATE fin_transaction SET parcela_id = NULL WHERE parcela_id = ?", (parcela_id,))
        conn.execute("DELETE FROM fin_parcela WHERE id = ?", (parcela_id,))
        conn.commit()
    return None


# ─── Invoices (faturas de cartão de crédito) ─────────────────────────────

INVOICE_COLUMNS = (
    "id, cartao_id, mes_referencia, data_fechamento, data_vencimento, "
    "data_pagamento, status"
)


def _invoice_with_total(conn, row) -> dict:
    """Combina row de fin_invoice com total computado e contagem de transações."""
    d = dict(row)
    agg = conn.execute(
        "SELECT COALESCE(SUM(-valor), 0) AS total, COUNT(*) AS n "
        "FROM fin_transaction WHERE fatura_id = ? AND valor < 0",
        (d["id"],),
    ).fetchone()
    d["total"] = float(agg["total"] or 0)
    d["transacoes_count"] = int(agg["n"] or 0)
    return d


def _ensure_open_invoice(conn, cartao_id: str, ref_date: str) -> str:
    """Garante que existe fatura ABERTA pro cartão. Se não há, cria uma com
    `mes_referencia` = mês de `ref_date` (YYYY-MM-DD). Retorna o id da fatura.

    Usado no INSERT de transação numa conta de crédito — vincula a compra
    à fatura aberta automaticamente.
    """
    existing = conn.execute(
        "SELECT id FROM fin_invoice WHERE cartao_id = ? AND status = 'aberta' LIMIT 1",
        (cartao_id,),
    ).fetchone()
    if existing:
        return existing["id"]
    invoice_id = _new_id()
    mes_ref = ref_date[:7] if len(ref_date) >= 7 else ref_date
    conn.execute(
        "INSERT INTO fin_invoice(id, cartao_id, mes_referencia) VALUES(?,?,?)",
        (invoice_id, cartao_id, mes_ref),
    )
    return invoice_id


@router.get("/api/finance/invoices", response_model=list[InvoiceOut])
def list_invoices(
    cartao_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    sql = f"SELECT {INVOICE_COLUMNS} FROM fin_invoice WHERE 1=1"
    params: list = []
    if cartao_id:
        sql += " AND cartao_id = ?"
        params.append(cartao_id)
    if status:
        sql += " AND status = ?"
        params.append(status)
    sql += " ORDER BY mes_referencia DESC, created_at DESC"
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
        return [_invoice_with_total(conn, r) for r in rows]


@router.post("/api/finance/invoices", response_model=InvoiceOut, status_code=201)
def create_invoice(body: InvoiceCreate):
    with get_conn() as conn:
        if not conn.execute(
            "SELECT 1 FROM fin_account WHERE id = ? AND tipo = 'credito'",
            (body.cartao_id,),
        ).fetchone():
            raise HTTPException(422, detail="cartao_id inválido (precisa ser conta tipo='credito')")
        invoice_id = _new_id()
        conn.execute(
            "INSERT INTO fin_invoice(id, cartao_id, mes_referencia, "
            "data_fechamento, data_vencimento) VALUES(?,?,?,?,?)",
            (invoice_id, body.cartao_id, body.mes_referencia,
             body.data_fechamento, body.data_vencimento),
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {INVOICE_COLUMNS} FROM fin_invoice WHERE id = ?", (invoice_id,)
        ).fetchone()
        return _invoice_with_total(conn, row)


@router.patch("/api/finance/invoices/{invoice_id}", response_model=InvoiceOut)
def update_invoice(invoice_id: str, body: InvoiceUpdate):
    fields: dict = {name: getattr(body, name) for name in body.model_fields_set}
    if not fields:
        raise HTTPException(400, detail="Nada a atualizar")
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM fin_invoice WHERE id = ?", (invoice_id,)).fetchone():
            raise HTTPException(404, detail="Fatura não encontrada")
        fields["updated_at"] = utcnow_iso_z()
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE fin_invoice SET {set_clause} WHERE id = ?",
            [*fields.values(), invoice_id],
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {INVOICE_COLUMNS} FROM fin_invoice WHERE id = ?", (invoice_id,)
        ).fetchone()
        return _invoice_with_total(conn, row)


@router.delete("/api/finance/invoices/{invoice_id}", status_code=204)
def delete_invoice(invoice_id: str):
    with get_conn() as conn:
        # Limpa vínculo das transações antes (FK ALTER não suporta SET NULL).
        conn.execute("UPDATE fin_transaction SET fatura_id = NULL WHERE fatura_id = ?", (invoice_id,))
        conn.execute("DELETE FROM fin_invoice WHERE id = ?", (invoice_id,))
        conn.commit()
    return None


@router.post("/api/finance/invoices/{invoice_id}/close", response_model=InvoiceOut)
def close_invoice(invoice_id: str):
    """Fecha a fatura — não aceita mais novas compras. Próxima compra no
    cartão cria nova fatura aberta automaticamente. Status muda
    'aberta' → 'fechada'. Pra pagar, use POST /pay."""
    with get_conn() as conn:
        row = conn.execute(
            f"SELECT {INVOICE_COLUMNS} FROM fin_invoice WHERE id = ?", (invoice_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, detail="Fatura não encontrada")
        if row["status"] != "aberta":
            raise HTTPException(409, detail=f"Fatura não está aberta (status atual: {row['status']})")
        conn.execute(
            "UPDATE fin_invoice SET status = 'fechada', "
            "data_fechamento = COALESCE(data_fechamento, ?), updated_at = ? "
            "WHERE id = ?",
            (utcnow_iso_z()[:10], utcnow_iso_z(), invoice_id),
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {INVOICE_COLUMNS} FROM fin_invoice WHERE id = ?", (invoice_id,)
        ).fetchone()
        return _invoice_with_total(conn, row)


@router.post("/api/finance/invoices/{invoice_id}/pay", response_model=InvoiceOut)
def pay_invoice(invoice_id: str, body: InvoicePayBody):
    """Paga uma fatura: cria 2 transações com categoria 'Transferência
    Interna' (saída da CC, entrada no cartão) e marca a fatura como paga.

    Após pagamento, as compras vinculadas viram despesa do mês de
    `data_pagamento` no resumo mensal (regra de competência).
    """
    with get_conn() as conn:
        invoice = conn.execute(
            f"SELECT {INVOICE_COLUMNS} FROM fin_invoice WHERE id = ?", (invoice_id,)
        ).fetchone()
        if not invoice:
            raise HTTPException(404, detail="Fatura não encontrada")
        if invoice["status"] == "paga":
            raise HTTPException(409, detail="Fatura já está paga")
        if not conn.execute(
            "SELECT 1 FROM fin_account WHERE id = ?", (body.conta_pagamento_id,)
        ).fetchone():
            raise HTTPException(422, detail="conta_pagamento_id não existe")
        # Total da fatura — precisa ter ao menos algo pra pagar.
        enriched = _invoice_with_total(conn, invoice)
        total = enriched["total"]
        if total <= 0:
            raise HTTPException(422, detail="Fatura sem compras pra pagar")
        # Acha categoria 'Transferência Interna' (deve existir do seed).
        trans_cat = conn.execute(
            "SELECT id FROM fin_category WHERE tipo = 'transferencia' LIMIT 1"
        ).fetchone()
        trans_cat_id = trans_cat["id"] if trans_cat else None
        # Lança transações: saída na CC + entrada no cartão (zera saldo do cartão).
        conn.execute(
            "INSERT INTO fin_transaction(id, data, valor, descricao, conta_id, "
            "categoria_id, origem, notas) VALUES(?,?,?,?,?,?,?,?)",
            (_new_id(), body.data_pagamento, -total,
             f"Pagamento fatura {invoice['mes_referencia']}",
             body.conta_pagamento_id, trans_cat_id, "manual", None),
        )
        conn.execute(
            "INSERT INTO fin_transaction(id, data, valor, descricao, conta_id, "
            "categoria_id, origem, notas) VALUES(?,?,?,?,?,?,?,?)",
            (_new_id(), body.data_pagamento, total,
             f"Pagamento fatura {invoice['mes_referencia']}",
             invoice["cartao_id"], trans_cat_id, "manual", None),
        )
        # Marca fatura como paga.
        conn.execute(
            "UPDATE fin_invoice SET status = 'paga', data_pagamento = ?, "
            "updated_at = ? WHERE id = ?",
            (body.data_pagamento, utcnow_iso_z(), invoice_id),
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {INVOICE_COLUMNS} FROM fin_invoice WHERE id = ?", (invoice_id,)
        ).fetchone()
        return _invoice_with_total(conn, row)


# ─── Clients ───────────────────────────────────────────────────────────────

CLIENT_COLUMNS = "id, nome, cpf_cnpj, notas, sort_order"


@router.get("/api/finance/clients", response_model=list[ClientOut])
def list_clients():
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT {CLIENT_COLUMNS} FROM fin_client ORDER BY sort_order ASC, nome ASC"
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/finance/clients", response_model=ClientOut, status_code=201)
def create_client(body: ClientCreate):
    nome = body.nome.strip()
    if not nome:
        raise HTTPException(400, detail="nome é obrigatório")
    client_id = _new_id()
    with get_conn() as conn:
        max_sort = conn.execute(
            "SELECT COALESCE(MAX(sort_order), 0) AS m FROM fin_client"
        ).fetchone()["m"]
        conn.execute(
            "INSERT INTO fin_client(id, nome, cpf_cnpj, notas, sort_order) VALUES(?,?,?,?,?)",
            (client_id, nome, body.cpf_cnpj, body.notas, (max_sort or 0) + 1),
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {CLIENT_COLUMNS} FROM fin_client WHERE id = ?", (client_id,)
        ).fetchone()
    return dict(row)


@router.patch("/api/finance/clients/{client_id}", response_model=ClientOut)
def update_client(client_id: str, body: ClientUpdate):
    fields: dict = {name: getattr(body, name) for name in body.model_fields_set}
    if not fields:
        raise HTTPException(400, detail="Nada a atualizar")
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM fin_client WHERE id = ?", (client_id,)).fetchone():
            raise HTTPException(404, detail="Cliente não encontrado")
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE fin_client SET {set_clause}, updated_at = ? WHERE id = ?",
            [*fields.values(), utcnow_iso_z(), client_id],
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {CLIENT_COLUMNS} FROM fin_client WHERE id = ?", (client_id,)
        ).fetchone()
    return dict(row)


@router.delete("/api/finance/clients/{client_id}", status_code=204)
def delete_client(client_id: str):
    with get_conn() as conn:
        # FK em projects.cliente_id é nullable mas declarativa não foi adicionada
        # via ALTER. Limpa manualmente pra evitar refs danglings.
        conn.execute("UPDATE projects SET cliente_id = NULL WHERE cliente_id = ?", (client_id,))
        conn.execute("DELETE FROM fin_client WHERE id = ?", (client_id,))
        conn.commit()
    return None


def _suggest_parcela_by_descricao(conn, descricao: str, valor: float) -> Optional[str]:
    """Auto-vínculo de receita a parcela: se CPF/CNPJ de algum cliente
    aparece na descrição (matching só dígitos pra tolerar formatação) E o
    valor da transação bate com alguma parcela pendente de projetos desse
    cliente, devolve o id da parcela.

    Quando há múltiplas parcelas com valor exato (caso comum em template
    50/50 ou parcelado_Nx), escolhe a com `data_prevista` mais antiga —
    cronologicamente é a próxima a ser paga. Usuário pode reatribuir
    manualmente no CategorizeModal se errar.
    """
    if not descricao or valor <= 0:
        return None
    desc_digits = "".join(ch for ch in descricao if ch.isdigit())
    if not desc_digits:
        return None
    clients = conn.execute(
        "SELECT id, cpf_cnpj FROM fin_client WHERE cpf_cnpj IS NOT NULL AND cpf_cnpj != ''"
    ).fetchall()
    matched_client_ids: list[str] = []
    for c in clients:
        cpf_digits = "".join(ch for ch in (c["cpf_cnpj"] or "") if ch.isdigit())
        if cpf_digits and cpf_digits in desc_digits:
            matched_client_ids.append(c["id"])
    if not matched_client_ids:
        return None
    placeholders = ",".join("?" * len(matched_client_ids))
    # Ordena por data_prevista (NULLS LAST), depois numero — pega a "próxima"
    # parcela pendente com valor exato.
    candidates = conn.execute(
        f"SELECT fp.id, fp.valor FROM fin_parcela fp "
        f"JOIN projects p ON p.id = fp.projeto_id "
        f"WHERE p.cliente_id IN ({placeholders}) AND fp.status = 'pendente' "
        f"ORDER BY fp.data_prevista ASC NULLS LAST, fp.numero ASC",
        matched_client_ids,
    ).fetchall()
    for c in candidates:
        if abs(c["valor"] - valor) < 0.01:
            return c["id"]
    return None


# ─── Debts ─────────────────────────────────────────────────────────────────

DEBT_COLUMNS = (
    "id, descricao, valor_total_original, parcela_mensal, data_inicio, "
    "categoria_id, status, sort_order"
)


def _debt_with_progress(conn, row) -> dict:
    """Combina row de fin_debt com campos computados (saldo/parcelas/progresso).

    valor_pago = soma absoluta das transações com divida_id = row.id E valor < 0
    (transação positiva vinculada a uma dívida não amortiza — seria estorno).
    saldo_devedor = max(0, total - pago).
    """
    d = dict(row)
    pago_row = conn.execute(
        "SELECT COALESCE(SUM(-valor), 0) AS pago, COUNT(*) AS n "
        "FROM fin_transaction WHERE divida_id = ? AND valor < 0",
        (d["id"],),
    ).fetchone()
    valor_pago = float(pago_row["pago"] or 0)
    parcelas_pagas = int(pago_row["n"] or 0)
    total = float(d["valor_total_original"] or 0)
    saldo = max(0.0, total - valor_pago)
    parcela = d.get("parcela_mensal")
    parcelas_restantes = (
        max(0, int((saldo + (parcela or 0) - 0.01) // (parcela or 1)))
        if parcela else None
    )
    progresso_pct = 0.0 if total <= 0 else min(100.0, round((valor_pago / total) * 100, 1))
    d["valor_pago"] = valor_pago
    d["saldo_devedor"] = saldo
    d["parcelas_pagas"] = parcelas_pagas
    d["parcelas_restantes"] = parcelas_restantes
    d["progresso_pct"] = progresso_pct
    return d


def _maybe_update_debt_status(conn, debt_id: str) -> None:
    """Se saldo zerou e status era 'active', muda pra 'paid_off'.
    Idempotente: chamadas com saldo > 0 não mexem em nada."""
    row = conn.execute(
        f"SELECT {DEBT_COLUMNS} FROM fin_debt WHERE id = ?", (debt_id,)
    ).fetchone()
    if not row:
        return
    enriched = _debt_with_progress(conn, row)
    if enriched["status"] == "active" and enriched["saldo_devedor"] <= 0.01:
        conn.execute(
            "UPDATE fin_debt SET status = 'paid_off', updated_at = ? WHERE id = ?",
            (utcnow_iso_z(), debt_id),
        )


@router.get("/api/finance/debts", response_model=list[DebtOut])
def list_debts(status: Optional[str] = Query(None)):
    sql = f"SELECT {DEBT_COLUMNS} FROM fin_debt"
    params: list = []
    if status:
        sql += " WHERE status = ?"
        params.append(status)
    sql += " ORDER BY sort_order ASC, created_at ASC"
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
        return [_debt_with_progress(conn, r) for r in rows]


@router.post("/api/finance/debts", response_model=DebtOut, status_code=201)
def create_debt(body: DebtCreate):
    desc = body.descricao.strip()
    if not desc:
        raise HTTPException(400, detail="descricao é obrigatória")
    if body.valor_total_original <= 0:
        raise HTTPException(400, detail="valor_total_original deve ser > 0")
    debt_id = _new_id()
    with get_conn() as conn:
        if body.categoria_id and not conn.execute(
            "SELECT 1 FROM fin_category WHERE id = ?", (body.categoria_id,)
        ).fetchone():
            raise HTTPException(422, detail="categoria_id não existe")
        max_sort = conn.execute(
            "SELECT COALESCE(MAX(sort_order), 0) AS m FROM fin_debt"
        ).fetchone()["m"]
        conn.execute(
            "INSERT INTO fin_debt(id, descricao, valor_total_original, "
            "parcela_mensal, data_inicio, categoria_id, sort_order) "
            "VALUES(?,?,?,?,?,?,?)",
            (
                debt_id, desc, body.valor_total_original, body.parcela_mensal,
                body.data_inicio, body.categoria_id, (max_sort or 0) + 1,
            ),
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {DEBT_COLUMNS} FROM fin_debt WHERE id = ?", (debt_id,)
        ).fetchone()
        return _debt_with_progress(conn, row)


@router.patch("/api/finance/debts/{debt_id}", response_model=DebtOut)
def update_debt(debt_id: str, body: DebtUpdate):
    fields: dict = {name: getattr(body, name) for name in body.model_fields_set}
    if not fields:
        raise HTTPException(400, detail="Nada a atualizar")
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM fin_debt WHERE id = ?", (debt_id,)).fetchone():
            raise HTTPException(404, detail="Dívida não encontrada")
        if "categoria_id" in fields and fields["categoria_id"] and not conn.execute(
            "SELECT 1 FROM fin_category WHERE id = ?", (fields["categoria_id"],)
        ).fetchone():
            raise HTTPException(422, detail="categoria_id não existe")
        fields["updated_at"] = utcnow_iso_z()
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE fin_debt SET {set_clause} WHERE id = ?",
            [*fields.values(), debt_id],
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {DEBT_COLUMNS} FROM fin_debt WHERE id = ?", (debt_id,)
        ).fetchone()
        return _debt_with_progress(conn, row)


@router.delete("/api/finance/debts/{debt_id}", status_code=204)
def delete_debt(debt_id: str):
    with get_conn() as conn:
        # FK em fin_transaction.divida_id é nullable, mas não tem ON DELETE
        # SET NULL declarado (foi adicionado via ALTER que não suporta FK
        # action). Fazemos manualmente: limpa vínculos antes.
        conn.execute("UPDATE fin_transaction SET divida_id = NULL WHERE divida_id = ?", (debt_id,))
        conn.execute("DELETE FROM fin_debt WHERE id = ?", (debt_id,))
        conn.commit()
    return None


# ─── Categorization Rules ─────────────────────────────────────────────────

CATEGORIZATION_RULE_COLUMNS = "id, pattern, categoria_id, times_matched, created_at"


def _apply_rules(conn, descricao: str) -> Optional[str]:
    """Roda regras de categorização contra uma descrição (lower-case substring).
    Primeira que bater ganha. Devolve `categoria_id` ou `None` se nada bateu.
    Incrementa `times_matched` quando bate (uso/debug).
    """
    descricao_lower = (descricao or "").lower()
    if not descricao_lower:
        return None
    rules = conn.execute(
        "SELECT id, pattern, categoria_id FROM fin_categorization_rule"
    ).fetchall()
    for r in rules:
        pat = (r["pattern"] or "").lower().strip()
        if pat and pat in descricao_lower:
            conn.execute(
                "UPDATE fin_categorization_rule SET times_matched = times_matched + 1 WHERE id = ?",
                (r["id"],),
            )
            return r["categoria_id"]
    return None


@router.get("/api/finance/categorization-rules", response_model=list[CategorizationRuleOut])
def list_categorization_rules():
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT {CATEGORIZATION_RULE_COLUMNS} FROM fin_categorization_rule "
            "ORDER BY times_matched DESC, created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@router.post(
    "/api/finance/categorization-rules",
    response_model=CategorizationRuleOut,
    status_code=201,
)
def create_categorization_rule(body: CategorizationRuleCreate):
    pattern = body.pattern.strip()
    if not pattern:
        raise HTTPException(400, detail="pattern é obrigatório")
    with get_conn() as conn:
        if not conn.execute(
            "SELECT 1 FROM fin_category WHERE id = ?", (body.categoria_id,)
        ).fetchone():
            raise HTTPException(422, detail="categoria_id não existe")
        rule_id = _new_id()
        conn.execute(
            "INSERT INTO fin_categorization_rule(id, pattern, categoria_id) "
            "VALUES(?,?,?)",
            (rule_id, pattern, body.categoria_id),
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {CATEGORIZATION_RULE_COLUMNS} FROM fin_categorization_rule WHERE id = ?",
            (rule_id,),
        ).fetchone()
    return dict(row)


@router.patch(
    "/api/finance/categorization-rules/{rule_id}",
    response_model=CategorizationRuleOut,
)
def update_categorization_rule(rule_id: str, body: CategorizationRuleUpdate):
    fields: dict = {name: getattr(body, name) for name in body.model_fields_set}
    if not fields:
        raise HTTPException(400, detail="Nada a atualizar")
    with get_conn() as conn:
        if not conn.execute(
            "SELECT 1 FROM fin_categorization_rule WHERE id = ?", (rule_id,)
        ).fetchone():
            raise HTTPException(404, detail="Regra não encontrada")
        if "pattern" in fields:
            patt = (fields["pattern"] or "").strip()
            if not patt:
                raise HTTPException(400, detail="pattern não pode ser vazio")
            fields["pattern"] = patt
        if "categoria_id" in fields and not conn.execute(
            "SELECT 1 FROM fin_category WHERE id = ?", (fields["categoria_id"],)
        ).fetchone():
            raise HTTPException(422, detail="categoria_id não existe")
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE fin_categorization_rule SET {set_clause} WHERE id = ?",
            [*fields.values(), rule_id],
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {CATEGORIZATION_RULE_COLUMNS} FROM fin_categorization_rule WHERE id = ?",
            (rule_id,),
        ).fetchone()
    return dict(row)


@router.delete("/api/finance/categorization-rules/{rule_id}", status_code=204)
def delete_categorization_rule(rule_id: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM fin_categorization_rule WHERE id = ?", (rule_id,))
        conn.commit()
    return None


@router.get("/api/finance/categorization-rules/{rule_id}/preview-backfill")
def preview_backfill_rule(rule_id: str):
    """Conta quantas transações já lançadas batem com o pattern dessa regra.
    Devolve total + quantas estão sem categoria + amostra de descrições, pra
    UI decidir se mostra confirmação ou não.
    """
    with get_conn() as conn:
        rule = conn.execute(
            "SELECT pattern FROM fin_categorization_rule WHERE id = ?",
            (rule_id,),
        ).fetchone()
        if not rule:
            raise HTTPException(404, detail="Regra não encontrada")
        pattern = (rule["pattern"] or "").strip()
        if not pattern:
            return {"matches_total": 0, "matches_uncategorized": 0, "sample": []}
        like = f"%{pattern.lower()}%"
        total = conn.execute(
            "SELECT COUNT(*) AS n FROM fin_transaction WHERE LOWER(descricao) LIKE ?",
            (like,),
        ).fetchone()["n"]
        uncat = conn.execute(
            "SELECT COUNT(*) AS n FROM fin_transaction "
            "WHERE LOWER(descricao) LIKE ? AND categoria_id IS NULL",
            (like,),
        ).fetchone()["n"]
        sample_rows = conn.execute(
            "SELECT descricao FROM fin_transaction "
            "WHERE LOWER(descricao) LIKE ? AND categoria_id IS NULL "
            "ORDER BY data DESC LIMIT 5",
            (like,),
        ).fetchall()
    return {
        "matches_total": total,
        "matches_uncategorized": uncat,
        "sample": [r["descricao"] for r in sample_rows],
    }


@router.post("/api/finance/categorization-rules/{rule_id}/backfill")
def apply_backfill_rule(rule_id: str, overwrite: bool = Query(False)):
    """Aplica a regra retroativamente em transações já lançadas.
    Por padrão (`overwrite=false`) só categoriza transações sem categoria —
    o usuário pode forçar reclassificar todas com `overwrite=true`.
    Devolve `{updated: int}`.
    """
    with get_conn() as conn:
        rule = conn.execute(
            "SELECT pattern, categoria_id FROM fin_categorization_rule WHERE id = ?",
            (rule_id,),
        ).fetchone()
        if not rule:
            raise HTTPException(404, detail="Regra não encontrada")
        pattern = (rule["pattern"] or "").strip()
        if not pattern:
            return {"updated": 0}
        if not conn.execute(
            "SELECT 1 FROM fin_category WHERE id = ?", (rule["categoria_id"],)
        ).fetchone():
            raise HTTPException(422, detail="categoria da regra não existe mais")
        like = f"%{pattern.lower()}%"
        if overwrite:
            cur = conn.execute(
                "UPDATE fin_transaction SET categoria_id = ?, "
                "updated_at = CURRENT_TIMESTAMP "
                "WHERE LOWER(descricao) LIKE ?",
                (rule["categoria_id"], like),
            )
        else:
            cur = conn.execute(
                "UPDATE fin_transaction SET categoria_id = ?, "
                "updated_at = CURRENT_TIMESTAMP "
                "WHERE LOWER(descricao) LIKE ? AND categoria_id IS NULL",
                (rule["categoria_id"], like),
            )
        updated = cur.rowcount
        if updated > 0:
            conn.execute(
                "UPDATE fin_categorization_rule "
                "SET times_matched = times_matched + ? WHERE id = ?",
                (updated, rule_id),
            )
        conn.commit()
    return {"updated": updated}


# ─── CSV Import ────────────────────────────────────────────────────────────

def _parse_brl_decimal(v: str) -> float:
    """Aceita "1.234,56" (PT-BR) ou "1234.56" (numérico). Erro → ValueError."""
    s = v.strip().replace(" ", "")
    if not s:
        raise ValueError("valor vazio")
    # PT-BR: ponto = milhar, vírgula = decimal. Detecta pela vírgula.
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    return float(s)


def _parse_brl_date(v: str) -> str:
    """DD/MM/YYYY → YYYY-MM-DD. Erro → ValueError."""
    s = v.strip()
    parts = s.split("/")
    if len(parts) != 3:
        raise ValueError(f"data inválida: {s!r}")
    d, m, y = parts
    if len(y) == 2:  # tolera YY → 20YY
        y = "20" + y
    return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"


def _normalize_header(h: str) -> str:
    """Casa colunas independente de acento/case/espaço."""
    import unicodedata
    nfkd = unicodedata.normalize("NFKD", h.strip().lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))


@router.post("/api/finance/import/nubank-csv", response_model=ImportSummary)
async def import_nubank_csv(
    file: UploadFile = File(...),
    conta_id: str = Form(...),
):
    """Importa CSV de extrato Nubank (Conta Corrente).

    Formato esperado (cabeçalho na primeira linha):
        Data,Valor,Identificador,Descrição

    Comportamento:
    - Deduplicação via (conta_id, nubank_id=Identificador). Re-importar mesmo
      arquivo é seguro — duplicatas são contadas mas não inseridas.
    - Linhas malformadas viram `errors` (não bloqueiam o resto).
    - Categoria fica vazia (usuário categoriza depois).

    Nota: cartão de crédito tem outro formato (Date,Title,Amount) e vai entrar
    quando o modelo de Fatura existir. Por enquanto só CC.
    """
    if not conta_id:
        raise HTTPException(400, detail="conta_id é obrigatório")

    raw = await file.read()
    # Nubank exporta em UTF-8 (com ou sem BOM). Tenta utf-8-sig primeiro.
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = raw.decode("latin-1")
        except UnicodeDecodeError as exc:
            raise HTTPException(400, detail=f"Não foi possível ler o arquivo: {exc}")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(400, detail="CSV vazio ou sem cabeçalho")

    # Mapa header normalizado → header original (pra ler dict).
    headers_map = {_normalize_header(h): h for h in reader.fieldnames}
    expected = ("data", "valor", "identificador", "descricao")
    missing = [k for k in expected if k not in headers_map]
    if missing:
        raise HTTPException(
            400,
            detail=(
                f"Cabeçalho esperado: Data, Valor, Identificador, Descrição. "
                f"Faltando: {missing}. Encontrado: {reader.fieldnames}"
            ),
        )

    h_data = headers_map["data"]
    h_valor = headers_map["valor"]
    h_id = headers_map["identificador"]
    h_desc = headers_map["descricao"]

    imported = 0
    duplicates = 0
    errors = 0
    auto_categorized = 0
    auto_linked_parcelas = 0
    error_samples: list[str] = []

    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM fin_account WHERE id = ?", (conta_id,)).fetchone():
            raise HTTPException(422, detail="conta_id não existe")

        for line_num, row in enumerate(reader, start=2):  # 2 = primeira linha de dado
            try:
                data_iso = _parse_brl_date(row[h_data])
                valor = _parse_brl_decimal(row[h_valor])
                nubank_id = (row[h_id] or "").strip() or None
                descricao = (row[h_desc] or "").strip() or "(sem descrição)"
                if nubank_id is None:
                    # Sem identificador não dá pra deduplicar — importa mas
                    # alerta. Caso raro, geralmente todo extrato Nubank tem id.
                    pass
            except (ValueError, KeyError) as exc:
                errors += 1
                if len(error_samples) < 5:
                    error_samples.append(f"linha {line_num}: {exc}")
                continue

            # Dedupe por (conta + nubank_id). Index único garante atomicidade.
            if nubank_id:
                exists = conn.execute(
                    "SELECT 1 FROM fin_transaction WHERE conta_id = ? AND nubank_id = ?",
                    (conta_id, nubank_id),
                ).fetchone()
                if exists:
                    duplicates += 1
                    continue

            # Auto-categorização via regras existentes (substring case-insens
            # da descrição). None se nenhuma regra bate.
            categoria_id = _apply_rules(conn, descricao)
            if categoria_id:
                auto_categorized += 1

            # Auto-vínculo a parcela esperada (CPF/CNPJ na descrição + valor
            # exato). Só se valor > 0 (entrada de receita).
            parcela_id = _suggest_parcela_by_descricao(conn, descricao, valor)
            if parcela_id:
                auto_linked_parcelas += 1

            tx_id = _new_id()
            try:
                conn.execute(
                    "INSERT INTO fin_transaction"
                    "(id, data, valor, descricao, conta_id, categoria_id, "
                    " origem, notas, nubank_id, parcela_id) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (
                        tx_id, data_iso, valor, descricao, conta_id,
                        categoria_id, "nubank_csv", None, nubank_id, parcela_id,
                    ),
                )
                if parcela_id:
                    _maybe_update_parcela_status(conn, parcela_id)
                imported += 1
            except Exception as exc:
                # Index unique pode dar conflict em race extrema (mesmo arquivo
                # subindo 2x simultaneamente) — conta como duplicata pra cobrir.
                if "UNIQUE" in str(exc).upper():
                    duplicates += 1
                else:
                    errors += 1
                    if len(error_samples) < 5:
                        error_samples.append(f"linha {line_num}: {exc}")

        conn.commit()

    return {
        "imported": imported,
        "duplicates": duplicates,
        "errors": errors,
        "error_samples": error_samples,
        "auto_categorized": auto_categorized,
        "auto_linked_parcelas": auto_linked_parcelas,
    }


@router.get("/api/finance/summary")
def summary():
    """Visão consolidada pro dashboard: saldo total + por conta + contagens.

    `saldo_total` é o consolidado em BRL. Saldos em outras moedas são
    convertidos via `fin_account.cotacao_brl` (manual). Contas em moeda !=
    BRL sem `cotacao_brl` definido são EXCLUÍDAS do total e marcadas em
    `saldos_nao_convertidos` pra UI alertar o usuário.

    `saldos_por_moeda` mantém o agregado por moeda nativa pra mostrar
    separado quando útil (ex: "Wise USD: $ Y").
    """
    with get_conn() as conn:
        accounts = conn.execute(
            f"SELECT {ACCOUNT_COLUMNS} FROM fin_account ORDER BY sort_order ASC"
        ).fetchall()
        contas_com_saldo = [_account_with_balance(conn, a) for a in accounts]

        saldos_por_moeda: dict[str, float] = {}
        saldos_convertidos_por_moeda: dict[str, float] = {}
        cotacoes_usadas: dict[str, float] = {}
        saldos_nao_convertidos: list[dict] = []
        saldo_total_brl = 0.0

        for c in contas_com_saldo:
            moeda = c.get("moeda") or "BRL"
            saldo = float(c["saldo"])
            saldos_por_moeda[moeda] = saldos_por_moeda.get(moeda, 0.0) + saldo
            if moeda == "BRL":
                saldo_total_brl += saldo
            else:
                cotacao = c.get("cotacao_brl")
                if cotacao is not None and cotacao > 0:
                    convertido = saldo * float(cotacao)
                    saldo_total_brl += convertido
                    saldos_convertidos_por_moeda[moeda] = (
                        saldos_convertidos_por_moeda.get(moeda, 0.0) + convertido
                    )
                    cotacoes_usadas[moeda] = float(cotacao)
                else:
                    # Sem cotação: não soma. UI mostra alerta.
                    saldos_nao_convertidos.append({
                        "conta_id": c["id"], "nome": c["nome"],
                        "moeda": moeda, "saldo": round(saldo, 2),
                    })

        tx_count = conn.execute(
            "SELECT COUNT(*) AS n FROM fin_transaction"
        ).fetchone()["n"]
    return {
        "saldo_total": round(saldo_total_brl, 2),
        "saldos_por_moeda": {k: round(v, 2) for k, v in saldos_por_moeda.items()},
        "saldos_convertidos_por_moeda": {
            k: round(v, 2) for k, v in saldos_convertidos_por_moeda.items()
        },
        "cotacoes_usadas": cotacoes_usadas,
        "saldos_nao_convertidos": saldos_nao_convertidos,
        "contas": contas_com_saldo,
        "transacoes_total": tx_count,
    }


@router.get("/api/finance/transactions/export")
def export_transactions(
    data_de: Optional[str] = Query(None, description="YYYY-MM-DD inclusive"),
    data_ate: Optional[str] = Query(None, description="YYYY-MM-DD inclusive"),
    conta_id: Optional[str] = Query(None),
    categoria_id: Optional[str] = Query(None),
):
    """Exporta transações em CSV (UTF-8 com BOM pra Excel abrir certo).
    Mesmo filtro do GET /transactions, mas sem limite (export do mês todo,
    do ano, do que pedir).

    Colunas: Data, Descrição, Valor, Conta, Categoria, Tipo, Notas, Origem.
    """
    import csv
    import io
    from fastapi.responses import StreamingResponse

    sql = (
        "SELECT t.data, t.descricao, t.valor, t.notas, t.origem, "
        "       a.nome AS conta_nome, c.nome AS categoria_nome, c.tipo AS categoria_tipo "
        "FROM fin_transaction t "
        "LEFT JOIN fin_account a ON a.id = t.conta_id "
        "LEFT JOIN fin_category c ON c.id = t.categoria_id "
        "WHERE 1=1"
    )
    params: list = []
    if data_de:
        sql += " AND t.data >= ?"
        params.append(data_de)
    if data_ate:
        sql += " AND t.data <= ?"
        params.append(data_ate)
    if conta_id:
        sql += " AND t.conta_id = ?"
        params.append(conta_id)
    if categoria_id:
        sql += " AND t.categoria_id = ?"
        params.append(categoria_id)
    sql += " ORDER BY t.data DESC, t.created_at DESC"

    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()

    buf = io.StringIO()
    buf.write("﻿")  # BOM pra Excel detectar UTF-8
    writer = csv.writer(buf, delimiter=";", quoting=csv.QUOTE_MINIMAL)
    writer.writerow([
        "Data", "Descrição", "Valor", "Conta", "Categoria", "Tipo", "Notas", "Origem",
    ])
    for r in rows:
        writer.writerow([
            r["data"] or "",
            r["descricao"] or "",
            f"{float(r['valor'] or 0):.2f}".replace(".", ","),
            r["conta_nome"] or "",
            r["categoria_nome"] or "",
            r["categoria_tipo"] or "",
            r["notas"] or "",
            r["origem"] or "",
        ])

    filename_parts = ["transacoes"]
    if data_de:
        filename_parts.append(data_de)
    if data_ate:
        filename_parts.append(data_ate)
    filename = "_".join(filename_parts) + ".csv"

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/api/finance/exchange-rate")
def exchange_rate(
    from_: str = Query(..., alias="from", min_length=3, max_length=3),
    to: str = Query("BRL", min_length=3, max_length=3),
):
    """Busca cotação online via AwesomeAPI (gratuita, sem key, BR-friendly).

    Ex: GET /api/finance/exchange-rate?from=USD&to=BRL
    Retorna `{rate, fetched_at, source, from, to}`.

    Falhas (rede bloqueada, API offline) viram 502 — UI deve permitir entrar
    a cotação manualmente como fallback.
    """
    import json
    import urllib.request
    import urllib.error
    from datetime import datetime, timezone

    pair = f"{from_.upper()}-{to.upper()}"
    url = f"https://economia.awesomeapi.com.br/last/{pair}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "hub.quest/0.1"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        raise HTTPException(502, detail=f"Falha ao consultar AwesomeAPI: {e}")

    key = pair.replace("-", "")
    entry = payload.get(key)
    if not entry or "bid" not in entry:
        raise HTTPException(502, detail=f"Resposta inesperada da AwesomeAPI: {payload}")
    try:
        rate = float(entry["bid"])
    except (TypeError, ValueError):
        raise HTTPException(502, detail=f"Cotação inválida: {entry.get('bid')!r}")

    return {
        "from": from_.upper(),
        "to": to.upper(),
        "rate": round(rate, 4),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "source": "AwesomeAPI",
    }


@router.get("/api/finance/freela-projects")
def freela_projects():
    """Lista projetos da área `freelas` (não-arquivados) com tudo computado:
    cliente, horas trabalhadas, valor pago, parcelas, R$/hora real e estimado,
    próxima parcela pendente.

    Usado pela tela `FreelasPage`. Evita N+1 fetches (1 por projeto) que
    seria caro com muitos projetos.

    Retorna lista ordenada por status (ativos primeiro) + título.
    """
    out: list[dict] = []
    with get_conn() as conn:
        projects = conn.execute(
            "SELECT id, title, status, valor_acordado, cliente_id, "
            "       forma_pagamento_template "
            "FROM projects "
            "WHERE area_slug = 'freelas' AND archived_at IS NULL "
            "ORDER BY CASE status WHEN 'doing' THEN 0 WHEN 'pending' THEN 1 "
            "                    WHEN 'done' THEN 2 ELSE 3 END, "
            "         title ASC"
        ).fetchall()

        for p in projects:
            # Horas trabalhadas (sessões fechadas das quests)
            sec = conn.execute(
                "SELECT COALESCE(SUM("
                "  (julianday(qs.ended_at) - julianday(qs.started_at)) * 86400"
                "), 0) AS s "
                "FROM quest_sessions qs JOIN quests q ON q.id = qs.quest_id "
                "WHERE q.project_id = ? AND qs.ended_at IS NOT NULL",
                (p["id"],),
            ).fetchone()["s"] or 0
            horas = float(sec) / 3600

            # Cliente
            cliente_nome = None
            if p["cliente_id"]:
                row = conn.execute(
                    "SELECT nome FROM fin_client WHERE id = ?", (p["cliente_id"],)
                ).fetchone()
                if row:
                    cliente_nome = row["nome"]

            # Parcelas — somatórios + próxima pendente
            parcelas_agg = conn.execute(
                "SELECT COUNT(*) AS total, "
                "       COALESCE(SUM(CASE WHEN status='recebido' THEN valor ELSE 0 END), 0) AS pago, "
                "       SUM(CASE WHEN status='recebido' THEN 1 ELSE 0 END) AS pagas_count "
                "FROM fin_parcela WHERE projeto_id = ?",
                (p["id"],),
            ).fetchone()
            valor_pago = float(parcelas_agg["pago"] or 0)
            parcelas_total = int(parcelas_agg["total"] or 0)
            parcelas_pagas = int(parcelas_agg["pagas_count"] or 0)

            # Próxima parcela pendente (por data ASC nulls last)
            prox = conn.execute(
                "SELECT id, numero, valor, data_prevista FROM fin_parcela "
                "WHERE projeto_id = ? AND status = 'pendente' "
                "ORDER BY data_prevista ASC NULLS LAST, numero ASC LIMIT 1",
                (p["id"],),
            ).fetchone()
            proxima_parcela = dict(prox) if prox else None

            valor_acordado = float(p["valor_acordado"] or 0)
            valor_a_receber = max(0.0, valor_acordado - valor_pago) if valor_acordado > 0 else 0.0

            hourly_estimado = (valor_acordado / horas) if (valor_acordado > 0 and horas > 0) else None
            hourly_real = (valor_pago / horas) if (valor_pago > 0 and horas > 0) else None

            out.append({
                "id": p["id"],
                "title": p["title"],
                "status": p["status"],
                "valor_acordado": valor_acordado if valor_acordado > 0 else None,
                "cliente_id": p["cliente_id"],
                "cliente_nome": cliente_nome,
                "forma_pagamento_template": p["forma_pagamento_template"],
                "horas_trabalhadas": round(horas, 2),
                "valor_pago": round(valor_pago, 2),
                "valor_a_receber": round(valor_a_receber, 2),
                "parcelas_total": parcelas_total,
                "parcelas_pagas": parcelas_pagas,
                "hourly_estimado": round(hourly_estimado, 2) if hourly_estimado is not None else None,
                "hourly_real": round(hourly_real, 2) if hourly_real is not None else None,
                "proxima_parcela": proxima_parcela,
            })

    return out


@router.get("/api/finance/hourly-rate-stats")
def hourly_rate_stats():
    """Média histórica de R$/hora — agregado cross-projeto da área freelas.

    Considera só projetos da área `freelas` não-arquivados que tenham
    horas trabalhadas E (valor recebido OU valor acordado).

    - `media_real`: soma(parcelas recebidas) / soma(horas) — só conta
      projetos que efetivamente receberam algo.
    - `media_estimada`: soma(valor_acordado) / soma(horas) — usa todos
      com valor cadastrado, mesmo sem recebimento ainda.

    Retorna None nos campos de média quando não há dados suficientes.
    """
    with get_conn() as conn:
        freela_projects = conn.execute(
            "SELECT id, valor_acordado FROM projects "
            "WHERE area_slug = 'freelas' AND archived_at IS NULL"
        ).fetchall()

        # Agregados separados pra real e estimado: cada um conta horas só
        # de projetos que entram na sua média (evita diluir).
        total_horas_real_sec = 0.0
        total_horas_estim_sec = 0.0
        total_recebido = 0.0
        total_acordado = 0.0
        projetos_real = 0
        projetos_estim = 0

        for p in freela_projects:
            sec = conn.execute(
                "SELECT COALESCE(SUM("
                "  (julianday(qs.ended_at) - julianday(qs.started_at)) * 86400"
                "), 0) AS s "
                "FROM quest_sessions qs JOIN quests q ON q.id = qs.quest_id "
                "WHERE q.project_id = ? AND qs.ended_at IS NOT NULL",
                (p["id"],),
            ).fetchone()["s"] or 0
            if sec <= 0:
                continue

            recebido = conn.execute(
                "SELECT COALESCE(SUM(valor), 0) AS r FROM fin_parcela "
                "WHERE projeto_id = ? AND status = 'recebido'",
                (p["id"],),
            ).fetchone()["r"] or 0

            if recebido > 0:
                total_horas_real_sec += sec
                total_recebido += recebido
                projetos_real += 1

            if p["valor_acordado"] and p["valor_acordado"] > 0:
                total_horas_estim_sec += sec
                total_acordado += p["valor_acordado"]
                projetos_estim += 1

        horas_real = total_horas_real_sec / 3600
        horas_estim = total_horas_estim_sec / 3600

        return {
            "media_real_brl_h": round(total_recebido / horas_real, 2) if horas_real > 0 else None,
            "media_estimada_brl_h": round(total_acordado / horas_estim, 2) if horas_estim > 0 else None,
            "projetos_considerados_real": projetos_real,
            "projetos_considerados_estim": projetos_estim,
            "horas_totais_real": round(horas_real, 2),
            "horas_totais_estim": round(horas_estim, 2),
            "valor_recebido_total": round(total_recebido, 2),
            "valor_acordado_total": round(total_acordado, 2),
        }


@router.get("/api/finance/monthly-summary")
def monthly_summary(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
):
    """Resumo de um mês civil específico: receita, despesa, sobra + contagem.

    "Receita" = soma de transações com valor > 0 no período.
    "Despesa" = abs(soma de transações com valor < 0) no período.
    "Sobra"   = receita - despesa (pode ser negativa).

    Transações com categoria do tipo `transferencia` (Transferência Interna,
    ex: Wise → Nubank) são EXCLUÍDAS do somatório — afetam saldo da conta
    individual mas não contam como receita/despesa do mês (senão contaria
    o mesmo dinheiro 2x: 1 vez quando entrou na Wise como receita, outra
    quando "saiu" da Wise pra ir pro Nubank).

    Filtro por `data` no formato YYYY-MM-DD (data civil do extrato, não
    created_at). Inclui todas as contas — visão consolidada do mês.
    """
    from calendar import monthrange
    last_day = monthrange(year, month)[1]
    data_de = f"{year:04d}-{month:02d}-01"
    data_ate = f"{year:04d}-{month:02d}-{last_day:02d}"

    with get_conn() as conn:
        # Filtro de data composto pra cobrir regra de competência:
        # - Transação SEM fatura: filtra por t.data (mês civil normal)
        # - Transação COM fatura paga: filtra por f.data_pagamento (entra
        #   no mês em que a fatura foi paga, mantendo categoria original)
        # - Transação COM fatura aberta/fechada: NÃO entra (compromisso futuro,
        #   ainda não virou despesa real)
        # Sempre exclui categorias de transferência (incluindo o pagamento
        # da própria fatura, que é uma transferência interna).
        row = conn.execute(
            """SELECT
                 COALESCE(SUM(CASE WHEN t.valor > 0 THEN t.valor ELSE 0 END), 0) AS receita,
                 COALESCE(SUM(CASE WHEN t.valor < 0 THEN -t.valor ELSE 0 END), 0) AS despesa,
                 COUNT(*) AS total
               FROM fin_transaction t
               LEFT JOIN fin_category c ON c.id = t.categoria_id
               LEFT JOIN fin_invoice f ON f.id = t.fatura_id
               WHERE (c.tipo IS NULL OR c.tipo != 'transferencia')
                 AND (
                   (t.fatura_id IS NULL AND t.data >= ? AND t.data <= ?)
                   OR
                   (t.fatura_id IS NOT NULL AND f.status = 'paga'
                    AND f.data_pagamento >= ? AND f.data_pagamento <= ?)
                 )""",
            (data_de, data_ate, data_de, data_ate),
        ).fetchone()

    receita = float(row["receita"] or 0)
    despesa = float(row["despesa"] or 0)
    return {
        "year": year,
        "month": month,
        "data_de": data_de,
        "data_ate": data_ate,
        "receita": receita,
        "despesa": despesa,
        "sobra": receita - despesa,
        "transacoes_total": row["total"] or 0,
    }


@router.get("/api/finance/budget")
def budget_status(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
):
    """Status do orçamento mensal por categoria.

    Lista cada categoria que tem `limite_mensal` definido + quanto foi gasto
    (ou recebido) no mês. Inclui categorias-pai com limite e soma também as
    transações das filhas (limite do pai funciona como teto consolidado).

    Aplica a mesma regra de competência da monthly-summary: compras no
    cartão entram no mês de pagamento da fatura, não no mês da compra.
    """
    from calendar import monthrange
    last_day = monthrange(year, month)[1]
    data_de = f"{year:04d}-{month:02d}-01"
    data_ate = f"{year:04d}-{month:02d}-{last_day:02d}"

    with get_conn() as conn:
        cats_with_limit = conn.execute(
            f"SELECT {CATEGORY_COLUMNS} FROM fin_category "
            "WHERE limite_mensal IS NOT NULL AND limite_mensal > 0 "
            "ORDER BY tipo, nome"
        ).fetchall()
        if not cats_with_limit:
            return {"year": year, "month": month, "items": []}

        # Mapa pai → filhos pra agrupar consumo. Categoria sem limite mas que
        # é filha de uma com limite contribui pro pai.
        children_by_parent: dict = {}
        for r in conn.execute(
            "SELECT id, categoria_pai_id FROM fin_category "
            "WHERE categoria_pai_id IS NOT NULL"
        ).fetchall():
            children_by_parent.setdefault(r["categoria_pai_id"], []).append(r["id"])

        items = []
        for c in cats_with_limit:
            cat_id = c["id"]
            tipo = c["tipo"]
            relevant_ids = [cat_id] + children_by_parent.get(cat_id, [])
            placeholders = ",".join(["?"] * len(relevant_ids))
            # Para despesa: soma absoluto de saídas. Para receita: soma de entradas.
            # Outros tipos não são esperados aqui mas tratamos como despesa (abs).
            sign_filter = "t.valor < 0" if tipo == "despesa" else (
                "t.valor > 0" if tipo == "receita" else "1=1"
            )
            row = conn.execute(
                f"""SELECT
                       COALESCE(SUM(ABS(t.valor)), 0) AS consumido,
                       COUNT(*) AS n_tx
                     FROM fin_transaction t
                     LEFT JOIN fin_invoice f ON f.id = t.fatura_id
                     WHERE t.categoria_id IN ({placeholders})
                       AND {sign_filter}
                       AND (
                         (t.fatura_id IS NULL AND t.data >= ? AND t.data <= ?)
                         OR
                         (t.fatura_id IS NOT NULL AND f.status = 'paga'
                          AND f.data_pagamento >= ? AND f.data_pagamento <= ?)
                       )""",
                (*relevant_ids, data_de, data_ate, data_de, data_ate),
            ).fetchone()
            consumido = float(row["consumido"] or 0)
            limite = float(c["limite_mensal"])
            items.append({
                "categoria_id": cat_id,
                "nome": c["nome"],
                "tipo": tipo,
                "cor": c["cor"],
                "limite_mensal": limite,
                "consumido": round(consumido, 2),
                "restante": round(limite - consumido, 2),
                "percent": round((consumido / limite) * 100, 1) if limite > 0 else 0,
                "transacoes_count": row["n_tx"] or 0,
            })

    return {
        "year": year,
        "month": month,
        "data_de": data_de,
        "data_ate": data_ate,
        "items": items,
    }
