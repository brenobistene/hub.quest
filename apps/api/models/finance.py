"""Pydantic models pro Hub Finance — v0 (vertical slice).

Cobre Conta, Categoria, Transação. Faturas, dívidas, parcelas e clientes vêm
em fases posteriores. Doc autoritativa: docs/hub-finance/PLAN.md.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, field_validator


# ─── Account ───────────────────────────────────────────────────────────────

ACCOUNT_TYPES = {"corrente", "credito", "wallet", "wise"}
ACCOUNT_ORIGINS = {"manual", "pynubank"}


class AccountOut(BaseModel):
    id: str
    nome: str
    tipo: str
    moeda: str = "BRL"
    origem_dados: str = "manual"
    sort_order: int = 0
    saldo: float = 0.0  # somatório das transações (calculado, não persistido)
    cotacao_brl: Optional[float] = None


class AccountCreate(BaseModel):
    nome: str
    tipo: str
    moeda: str = "BRL"
    origem_dados: str = "manual"
    cotacao_brl: Optional[float] = None

    @field_validator("tipo")
    @classmethod
    def _check_tipo(cls, v: str) -> str:
        if v not in ACCOUNT_TYPES:
            raise ValueError(f"tipo deve ser um de {sorted(ACCOUNT_TYPES)}")
        return v

    @field_validator("origem_dados")
    @classmethod
    def _check_origem(cls, v: str) -> str:
        if v not in ACCOUNT_ORIGINS:
            raise ValueError(f"origem_dados deve ser um de {sorted(ACCOUNT_ORIGINS)}")
        return v


class AccountUpdate(BaseModel):
    nome: Optional[str] = None
    tipo: Optional[str] = None
    moeda: Optional[str] = None
    origem_dados: Optional[str] = None
    sort_order: Optional[int] = None
    cotacao_brl: Optional[float] = None


# ─── Category ──────────────────────────────────────────────────────────────

CATEGORY_TYPES = {"receita", "despesa", "estorno", "transferencia"}


class CategoryOut(BaseModel):
    id: str
    nome: str
    tipo: str
    cor: Optional[str] = None
    categoria_pai_id: Optional[str] = None
    sort_order: int = 0
    limite_mensal: Optional[float] = None


class CategoryCreate(BaseModel):
    nome: str
    tipo: str
    cor: Optional[str] = None
    categoria_pai_id: Optional[str] = None
    limite_mensal: Optional[float] = None

    @field_validator("tipo")
    @classmethod
    def _check_tipo(cls, v: str) -> str:
        if v not in CATEGORY_TYPES:
            raise ValueError(f"tipo deve ser um de {sorted(CATEGORY_TYPES)}")
        return v


class CategoryUpdate(BaseModel):
    nome: Optional[str] = None
    tipo: Optional[str] = None
    cor: Optional[str] = None
    categoria_pai_id: Optional[str] = None
    sort_order: Optional[int] = None
    limite_mensal: Optional[float] = None


# ─── Transaction ───────────────────────────────────────────────────────────

TRANSACTION_ORIGINS = {"manual", "nubank_csv"}


class TransactionOut(BaseModel):
    id: str
    data: str          # YYYY-MM-DD
    valor: float       # positivo = entrada, negativo = saída
    descricao: str
    conta_id: str
    categoria_id: Optional[str] = None
    origem: str = "manual"
    notas: Optional[str] = None
    nubank_id: Optional[str] = None
    divida_id: Optional[str] = None
    parcela_id: Optional[str] = None
    fatura_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class TransactionCreate(BaseModel):
    data: str
    valor: float
    descricao: str
    conta_id: str
    categoria_id: Optional[str] = None
    origem: str = "manual"
    notas: Optional[str] = None

    @field_validator("origem")
    @classmethod
    def _check_origem(cls, v: str) -> str:
        if v not in TRANSACTION_ORIGINS:
            raise ValueError(f"origem deve ser um de {sorted(TRANSACTION_ORIGINS)}")
        return v


class ImportSummary(BaseModel):
    """Resultado de import de CSV — quantas entraram, quantas eram duplicadas,
    quantas falharam parse. Erros agrupados pra debug rápido."""
    imported: int
    duplicates: int
    errors: int
    error_samples: list[str] = []
    auto_categorized: int = 0
    auto_linked_parcelas: int = 0


class CategorizationRuleOut(BaseModel):
    id: str
    pattern: str
    categoria_id: str
    times_matched: int = 0
    created_at: Optional[str] = None


class CategorizationRuleCreate(BaseModel):
    pattern: str
    categoria_id: str


class CategorizationRuleUpdate(BaseModel):
    pattern: Optional[str] = None
    categoria_id: Optional[str] = None


# ─── Debt ──────────────────────────────────────────────────────────────────

DEBT_STATUS = {"active", "paid_off", "cancelled"}


class DebtOut(BaseModel):
    id: str
    descricao: str
    valor_total_original: float
    parcela_mensal: Optional[float] = None
    data_inicio: Optional[str] = None
    categoria_id: Optional[str] = None
    status: str = "active"
    sort_order: int = 0
    # Computados pelo backend a cada GET/PATCH.
    valor_pago: float = 0.0
    saldo_devedor: float = 0.0
    parcelas_pagas: int = 0
    parcelas_restantes: Optional[int] = None  # None se sem parcela_mensal
    progresso_pct: float = 0.0  # 0..100


class DebtCreate(BaseModel):
    descricao: str
    valor_total_original: float
    parcela_mensal: Optional[float] = None
    data_inicio: Optional[str] = None
    categoria_id: Optional[str] = None


class DebtUpdate(BaseModel):
    descricao: Optional[str] = None
    valor_total_original: Optional[float] = None
    parcela_mensal: Optional[float] = None
    data_inicio: Optional[str] = None
    categoria_id: Optional[str] = None
    status: Optional[str] = None
    sort_order: Optional[int] = None

    @field_validator("status")
    @classmethod
    def _check_status(cls, v):
        if v is not None and v not in DEBT_STATUS:
            raise ValueError(f"status deve ser um de {sorted(DEBT_STATUS)}")
        return v


# ─── Parcela esperada (recebimento de projeto) ─────────────────────────────

PARCELA_STATUS = {"pendente", "recebido", "atrasado", "cancelada"}
PAYMENT_TEMPLATES = {"a_vista", "50_50", "parcelado_3x", "parcelado_4x", "custom"}


class ParcelaOut(BaseModel):
    id: str
    projeto_id: str
    numero: int
    valor: float
    data_prevista: Optional[str] = None
    status: str = "pendente"
    observacao: Optional[str] = None
    # ID da transação que pagou essa parcela (FK reverso). Vem via JOIN
    # quando existe uma fin_transaction.parcela_id apontando aqui.
    transacao_recebimento_id: Optional[str] = None


class ParcelaCreate(BaseModel):
    valor: float
    data_prevista: Optional[str] = None
    observacao: Optional[str] = None


class ParcelaUpdate(BaseModel):
    valor: Optional[float] = None
    data_prevista: Optional[str] = None
    status: Optional[str] = None
    observacao: Optional[str] = None
    numero: Optional[int] = None

    @field_validator("status")
    @classmethod
    def _check_status(cls, v):
        if v is not None and v not in PARCELA_STATUS:
            raise ValueError(f"status deve ser um de {sorted(PARCELA_STATUS)}")
        return v


class ApplyTemplateBody(BaseModel):
    """Body do endpoint que gera N parcelas a partir de um template."""
    template: str
    # data_inicio opcional: usada pra preencher data_prevista da primeira
    # parcela em templates com cronograma (parcelado_Nx → +N meses).
    data_inicio: Optional[str] = None

    @field_validator("template")
    @classmethod
    def _check_template(cls, v):
        if v not in PAYMENT_TEMPLATES:
            raise ValueError(f"template deve ser um de {sorted(PAYMENT_TEMPLATES)}")
        return v


# ─── Cliente (PF/PJ que paga projetos freela) ──────────────────────────────

class ClientOut(BaseModel):
    id: str
    nome: str
    cpf_cnpj: Optional[str] = None
    notas: Optional[str] = None
    sort_order: int = 0


class ClientCreate(BaseModel):
    nome: str
    cpf_cnpj: Optional[str] = None
    notas: Optional[str] = None


class ClientUpdate(BaseModel):
    nome: Optional[str] = None
    cpf_cnpj: Optional[str] = None
    notas: Optional[str] = None
    sort_order: Optional[int] = None


# ─── Fatura de cartão de crédito ──────────────────────────────────────────

INVOICE_STATUS = {"aberta", "fechada", "paga", "atrasada"}


class InvoiceOut(BaseModel):
    id: str
    cartao_id: str
    mes_referencia: str          # YYYY-MM
    data_fechamento: Optional[str] = None
    data_vencimento: Optional[str] = None
    data_pagamento: Optional[str] = None
    status: str = "aberta"
    # Computados:
    total: float = 0.0           # soma absoluta das compras vinculadas
    transacoes_count: int = 0


class InvoiceCreate(BaseModel):
    cartao_id: str
    mes_referencia: str
    data_fechamento: Optional[str] = None
    data_vencimento: Optional[str] = None


class InvoiceUpdate(BaseModel):
    mes_referencia: Optional[str] = None
    data_fechamento: Optional[str] = None
    data_vencimento: Optional[str] = None
    status: Optional[str] = None

    @field_validator("status")
    @classmethod
    def _check_status(cls, v):
        if v is not None and v not in INVOICE_STATUS:
            raise ValueError(f"status deve ser um de {sorted(INVOICE_STATUS)}")
        return v


class InvoicePayBody(BaseModel):
    """Body do endpoint que paga uma fatura: cria 2 transações de
    Transferência Interna (saída da conta corrente, entrada no cartão pra
    zerar o saldo) e marca a fatura como paga."""
    conta_pagamento_id: str   # CC de onde sai o dinheiro
    data_pagamento: str       # YYYY-MM-DD


class TransactionUpdate(BaseModel):
    data: Optional[str] = None
    valor: Optional[float] = None
    descricao: Optional[str] = None
    conta_id: Optional[str] = None
    categoria_id: Optional[str] = None
    notas: Optional[str] = None
    divida_id: Optional[str] = None
    parcela_id: Optional[str] = None
    fatura_id: Optional[str] = None
