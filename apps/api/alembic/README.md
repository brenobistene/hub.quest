# Alembic — schema migrations

Foundational setup. **Não foi feita conversão das tabelas existentes** — `db.init_db()` continua sendo a fonte de verdade pro schema atual, e a baseline (`0001_baseline.py`) é só um marcador no-op.

## Por que existe

Antes: novas colunas eram adicionadas via `_try_add_column()` em `db.py`, que é idempotente mas:
- não tem versionamento (não sei se um DB já tem a coluna X);
- não tem downgrade;
- não tem histórico (impossível auditar quando o schema mudou);
- mistura schema com runtime.

Daqui em diante: novas migrations viram arquivos discretos em `alembic/versions/`.

## Setup inicial (uma vez por máquina)

```sh
cd apps/api
pip install -r requirements.txt          # instala alembic
alembic stamp 0001_baseline               # marca o DB no estado atual
alembic current                           # confirma: 0001_baseline (head)
```

`stamp` NÃO executa SQL — só grava na tabela `alembic_version` que estamos na baseline.

## Workflow pra nova migration

```sh
cd apps/api
alembic revision -m "add health_metrics table"
```

Edita o arquivo gerado em `alembic/versions/`, preenchendo `upgrade()` com SQL raw:

```python
def upgrade() -> None:
    op.execute("""
        CREATE TABLE health_metrics (
            id TEXT PRIMARY KEY,
            ...
        )
    """)

def downgrade() -> None:
    op.execute("DROP TABLE health_metrics")
```

Aplica:

```sh
alembic upgrade head
```

## Comandos úteis

```sh
alembic current      # qual revisão tá aplicada
alembic history      # lista todas
alembic upgrade head # aplica pendentes
alembic downgrade -1 # volta uma revisão
alembic stamp head   # marca como up-to-date sem rodar SQL
```

## Quando NÃO usar

Pra dados (seeds, fixes pontuais em rows), faça via endpoint ou script avulso — migrations são pra schema.

## Convenções

- Use SQL raw via `op.execute()`. Projeto não tem ORM, então não há `op.create_table()` com tipos SQLAlchemy.
- `render_as_batch=True` no `env.py` é obrigatório pro SQLite — sem isso, `ALTER TABLE` quebra (sqlite só suporta um subset).
- Migrations sempre idempotentes quando possível (`CREATE TABLE IF NOT EXISTS`, checks com `PRAGMA table_info`).
- Filenames têm timestamp BR (America/Sao_Paulo) — ver `alembic.ini`.
