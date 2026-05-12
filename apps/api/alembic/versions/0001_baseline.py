"""baseline — snapshot do schema atual

Revision ID: 0001_baseline
Revises:
Create Date: 2026-05-11

NÃO RODA NADA. Esta migration é um marcador: representa o estado do DB
criado por `db.init_db()` no boot da API. Todo `_try_add_column()` e
`CREATE TABLE IF NOT EXISTS` espalhados em db.py já rodaram antes do
Alembic existir.

Para inicializar Alembic num DB existente:
    alembic stamp 0001_baseline

Isso marca a revisão sem executar nenhum SQL — o schema já está aplicado.

Migrations *futuras* (novas tabelas, novas colunas) vão como arquivos
filhos desta, usando `op.execute("ALTER TABLE…")` em SQL raw, e aí sim
rodam de verdade.
"""
from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401


revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No-op: schema já existe via db.init_db().
    pass


def downgrade() -> None:
    # Nada a desfazer.
    pass
