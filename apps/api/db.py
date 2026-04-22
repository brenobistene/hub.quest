from __future__ import annotations
import sqlite3
from pathlib import Path


def _try_add_column(conn: sqlite3.Connection, sql: str) -> None:
    """Executa um `ALTER TABLE ... ADD COLUMN ...`, ignorando APENAS o erro de
    coluna já existente. Qualquer outro erro (lock, disk full, permissão)
    continua propagando pra não deixar o schema em estado inconsistente."""
    try:
        conn.execute(sql)
        conn.commit()
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e).lower():
            return  # idempotente: coluna já existe, tudo certo
        raise

DB_PATH = Path(__file__).parent / "hubquest.db"

AREAS = [
    ("freelas",    "Freelas",    "Entregas com impacto financeiro e prazos reais.", 1, "#e85d3a"),
    ("faculdade",  "Faculdade",  "Matérias, atividades e projetos de ensino.", 2, "#4a9eff"),
    ("growth",     "Growth",     "Cursos, certificações e aprendizado contínuo.", 3, "#9d6cff"),
    ("work",       "Trabalho",   "Trabalho principal — empresa, cargo, projetos fixos.", 4, "#7fb069"),
    ("health",     "Health",     "Sono, saúde e rotina física.", 5, "#f5a962"),
]


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys=ON")
    except:
        pass
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS areas (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            slug     TEXT UNIQUE NOT NULL,
            name     TEXT NOT NULL,
            description TEXT,
            sort_order INTEGER DEFAULT 0,
            color    TEXT DEFAULT '#6b7280'
        );

        CREATE TABLE IF NOT EXISTS quests (
            id               TEXT PRIMARY KEY,
            parent_id        TEXT REFERENCES quests(id) ON DELETE CASCADE,
            title            TEXT NOT NULL,
            area_slug        TEXT NOT NULL REFERENCES areas(slug),
            status           TEXT NOT NULL DEFAULT 'pending',
            priority         TEXT NOT NULL DEFAULT 'medium',
            deadline         TEXT,
            estimated_minutes INTEGER,
            next_action      TEXT,
            notes            TEXT,
            sort_order       INTEGER DEFAULT 0,
            deliverable_id   TEXT REFERENCES deliverables(id) ON DELETE SET NULL,
            completed_at     TEXT,
            created_at       TEXT DEFAULT (datetime('now')),
            updated_at       TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS subtasks (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            quest_id   TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
            title      TEXT NOT NULL,
            done       INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS routines (
            id               TEXT PRIMARY KEY,
            title            TEXT NOT NULL,
            recurrence       TEXT NOT NULL DEFAULT 'daily',
            day_of_week      INTEGER,
            days_of_week     TEXT,
            day_of_month     INTEGER,
            start_time       TEXT,
            end_time         TEXT,
            estimated_minutes INTEGER,
            calendar_event_id TEXT,
            created_at       TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS routine_logs (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            routine_id   TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
            completed_date TEXT NOT NULL,
            UNIQUE(routine_id, completed_date)
        );

        CREATE TABLE IF NOT EXISTS quest_sessions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            quest_id     TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
            session_num  INTEGER NOT NULL,
            started_at   TEXT NOT NULL,
            ended_at     TEXT,
            UNIQUE(quest_id, session_num)
        );

        CREATE TABLE IF NOT EXISTS deliverables (
            id                  TEXT PRIMARY KEY,
            quest_id            TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
            title               TEXT NOT NULL,
            done                INTEGER NOT NULL DEFAULT 0,
            sort_order          INTEGER DEFAULT 0,
            estimated_minutes   INTEGER,
            minutes_worked      INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS micro_tasks (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS user_profile (
            id         INTEGER PRIMARY KEY CHECK (id = 1),
            name       TEXT NOT NULL DEFAULT '',
            role       TEXT NOT NULL DEFAULT '',
            avatar_url TEXT NOT NULL DEFAULT '',
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id               TEXT PRIMARY KEY,
            title            TEXT NOT NULL,
            scheduled_date   TEXT,           -- YYYY-MM-DD, nullable
            start_time       TEXT,           -- HH:MM, nullable
            end_time         TEXT,           -- HH:MM, nullable
            duration_minutes INTEGER,        -- nullable
            done             INTEGER NOT NULL DEFAULT 0,
            completed_at     TEXT,
            sort_order       INTEGER DEFAULT 0,
            created_at       TEXT DEFAULT (datetime('now')),
            updated_at       TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS task_sessions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            session_num  INTEGER NOT NULL,
            started_at   TEXT NOT NULL,
            ended_at     TEXT,
            UNIQUE(task_id, session_num)
        );

        CREATE TABLE IF NOT EXISTS routine_sessions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            routine_id   TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
            date         TEXT NOT NULL,       -- YYYY-MM-DD (local-day scope)
            session_num  INTEGER NOT NULL,
            started_at   TEXT NOT NULL,
            ended_at     TEXT,
            UNIQUE(routine_id, date, session_num)
        );
        """)

        # Garante que existe 1 linha de profile. Começa vazio — o usuário edita
        # pelo ProfileEditModal no primeiro uso. INSERT OR IGNORE = idempotente.
        conn.execute(
            "INSERT OR IGNORE INTO user_profile(id, name, role, avatar_url) VALUES (1, ?, ?, ?)",
            ("", "", ""),
        )

        for slug, name, desc, order, color in AREAS:
            conn.execute(
                "INSERT OR IGNORE INTO areas(slug,name,description,sort_order,color) VALUES(?,?,?,?,?)",
                (slug, name, desc, order, color)
            )

        conn.commit()

        # Migrations idempotentes (ALTER TABLE ADD COLUMN é no-op se coluna existe).
        _try_add_column(conn, "ALTER TABLE quests ADD COLUMN calendar_event_id TEXT")
        _try_add_column(conn, "ALTER TABLE routines ADD COLUMN days_of_week TEXT")
        _try_add_column(conn, "ALTER TABLE routines ADD COLUMN day_of_month INTEGER")

        # `completed_at`: adiciona + backfill inicial (só roda uma vez, quando a
        # coluna não existia ainda — o backfill é inócuo em reboots).
        try:
            conn.execute("ALTER TABLE quests ADD COLUMN completed_at TEXT")
            conn.commit()
            conn.execute(
                "UPDATE quests SET completed_at = updated_at WHERE status = 'done' AND completed_at IS NULL"
            )
            conn.commit()
        except sqlite3.OperationalError as e:
            if "duplicate column" not in str(e).lower():
                raise

        _try_add_column(conn, "ALTER TABLE deliverables ADD COLUMN deadline TEXT")

        # Campo de descrição rápida em quests (separado de notes)
        _try_add_column(conn, "ALTER TABLE quests ADD COLUMN description TEXT")

        # Prioridade também em tasks e routines (quests já tinha). Obrigatória
        # na criação nova, mas as linhas antigas ficam com 'critical' como
        # carimbo neutro — user vai limpar dados reais assim que começar a usar.
        _try_add_column(conn, "ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'critical'")
        _try_add_column(conn, "ALTER TABLE routines ADD COLUMN priority TEXT DEFAULT 'critical'")
        conn.execute("UPDATE tasks SET priority = 'critical' WHERE priority IS NULL OR priority = ''")
        conn.execute("UPDATE routines SET priority = 'critical' WHERE priority IS NULL OR priority = ''")
        conn.commit()

        # One-shot cleanup: purge orphan subtasks (quest has parent but no
        # deliverable). New model makes deliverable_id required for any quest
        # inside a project — the user confirmed these were test data.
        # Idempotent: no-op on subsequent boots since the API now rejects
        # creating orphans.
        conn.execute(
            "DELETE FROM quests WHERE parent_id IS NOT NULL AND deliverable_id IS NULL"
        )
        conn.commit()
