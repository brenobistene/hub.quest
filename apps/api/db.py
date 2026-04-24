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
    except sqlite3.Error:
        # Alguns builds/environments do sqlite não suportam essa PRAGMA;
        # seguir sem FK enforcement é preferível a falhar ao abrir conexão.
        pass
    return conn


def init_db() -> None:
    with get_conn() as conn:
        # Detectar se estamos num DB pré-split (antes de projects virar entidade
        # própria). Usamos a presença da coluna `quest_id` em `deliverables`
        # como sinal — ela só existia no schema antigo. Se `project_id` já
        # existe, já migrou.
        needs_project_split = False
        existing_deliv = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='deliverables'"
        ).fetchone()
        if existing_deliv:
            cols = {c["name"] for c in conn.execute("PRAGMA table_info(deliverables)").fetchall()}
            if "quest_id" in cols and "project_id" not in cols:
                needs_project_split = True

        conn.executescript("""
        CREATE TABLE IF NOT EXISTS areas (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            slug     TEXT UNIQUE NOT NULL,
            name     TEXT NOT NULL,
            description TEXT,
            sort_order INTEGER DEFAULT 0,
            color    TEXT DEFAULT '#6b7280'
        );

        CREATE TABLE IF NOT EXISTS projects (
            id                TEXT PRIMARY KEY,
            title             TEXT NOT NULL,
            area_slug         TEXT NOT NULL REFERENCES areas(slug),
            status            TEXT NOT NULL DEFAULT 'pending',
            priority          TEXT NOT NULL DEFAULT 'critical',
            deadline          TEXT,
            notes             TEXT,
            calendar_event_id TEXT,
            completed_at      TEXT,
            archived_at       TEXT,
            sort_order        INTEGER DEFAULT 0,
            created_at        TEXT DEFAULT (datetime('now')),
            updated_at        TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS quests (
            id               TEXT PRIMARY KEY,
            project_id       TEXT REFERENCES projects(id) ON DELETE CASCADE,
            parent_id        TEXT,
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
            project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            title               TEXT NOT NULL,
            done                INTEGER NOT NULL DEFAULT 0,
            sort_order          INTEGER DEFAULT 0,
            estimated_minutes   INTEGER,
            minutes_worked      INTEGER DEFAULT 0,
            deadline            TEXT
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

        # Garante que existe 1 linha de profile. Nome default é piada — o usuário
        # edita pelo ProfileEditModal no primeiro uso. INSERT OR IGNORE =
        # idempotente, então instâncias existentes não são sobrescritas.
        conn.execute(
            "INSERT OR IGNORE INTO user_profile(id, name, role, avatar_url) VALUES (1, ?, ?, ?)",
            ("John No Arms", "", ""),
        )

        # Seed de áreas — só em instalação nova. Usamos `INSERT OR IGNORE`
        # antes, o que recriava áreas deletadas a cada boot. Agora: se a
        # tabela já tem qualquer linha, respeitamos o que o usuário fez
        # (renomear, deletar, recolorir). Áreas do seed são só um ponto
        # de partida pra quem acabou de instalar.
        existing_areas = conn.execute("SELECT COUNT(*) AS n FROM areas").fetchone()["n"]
        if existing_areas == 0:
            for slug, name, desc, order, color in AREAS:
                conn.execute(
                    "INSERT INTO areas(slug,name,description,sort_order,color) VALUES(?,?,?,?,?)",
                    (slug, name, desc, order, color),
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

        # Mesma descrição (notion-style blocks) em tasks e routines —
        # editável pelo dropdown "info" do PlannedItemRow na página Dia.
        _try_add_column(conn, "ALTER TABLE tasks ADD COLUMN description TEXT")
        _try_add_column(conn, "ALTER TABLE routines ADD COLUMN description TEXT")

        # Prioridade também em tasks e routines (quests já tinha). Obrigatória
        # na criação nova, mas as linhas antigas ficam com 'critical' como
        # carimbo neutro — user vai limpar dados reais assim que começar a usar.
        _try_add_column(conn, "ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'critical'")
        _try_add_column(conn, "ALTER TABLE routines ADD COLUMN priority TEXT DEFAULT 'critical'")
        conn.execute("UPDATE tasks SET priority = 'critical' WHERE priority IS NULL OR priority = ''")
        conn.execute("UPDATE routines SET priority = 'critical' WHERE priority IS NULL OR priority = ''")
        conn.commit()

        # Projeto "arquivado" (gaveta) — independente de status. Null = ativo,
        # ISO timestamp = arquivado naquele momento. Oculta da lista principal
        # sem apagar dado.
        _try_add_column(conn, "ALTER TABLE projects ADD COLUMN archived_at TEXT")
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

        # ─── Project/Quest split migration (one-shot) ──────────────────────
        # Pré-split: projetos eram quests com parent_id NULL; deliverables
        # tinham quest_id apontando pra esses. Agora `projects` é tabela
        # própria e `quests` só contém trabalho granular (subtarefas).
        #
        # Steps:
        #   1. ALTER quests ADD COLUMN project_id (idempotente)
        #   2. Copia quests parent-null → projects
        #   3. Seta quests.project_id = parent_id nas subtarefas
        #   4. DELETE nos quests parent-null (agora vivem em projects)
        #   5. Recria deliverables com FK project_id → projects
        #   6. Limpa parent_id órfão (refs dangling nos subtasks restantes)
        #
        # FKs ficam OFF durante a migration pra evitar cascade delete quando
        # removemos os quests-projeto. Detecção: presença de `quest_id` em
        # deliverables antes de rodar o CREATE TABLE IF NOT EXISTS deste init.
        _try_add_column(conn, "ALTER TABLE quests ADD COLUMN project_id TEXT")

        if needs_project_split:
            conn.execute("PRAGMA foreign_keys=OFF")
            try:
                # Copia project-quests (parent_id NULL) pra projects mantendo id.
                conn.execute("""
                    INSERT OR IGNORE INTO projects
                      (id, title, area_slug, status, priority, deadline, notes,
                       calendar_event_id, completed_at, sort_order,
                       created_at, updated_at)
                    SELECT id, title, area_slug, status, priority, deadline, notes,
                           calendar_event_id, completed_at, sort_order,
                           created_at, updated_at
                    FROM quests
                    WHERE parent_id IS NULL
                """)

                # Subtask quests: project_id = parent_id
                conn.execute("""
                    UPDATE quests SET project_id = parent_id
                    WHERE parent_id IS NOT NULL
                      AND (project_id IS NULL OR project_id = '')
                """)

                # Apaga os quests-projeto (vivem em projects agora)
                conn.execute("DELETE FROM quests WHERE parent_id IS NULL")

                # Limpa parent_id (dangling: apontava pros quests-projeto agora deletados)
                conn.execute("UPDATE quests SET parent_id = NULL")

                # Recria deliverables trocando FK quest_id → project_id
                conn.execute("""
                    CREATE TABLE deliverables_new (
                        id                  TEXT PRIMARY KEY,
                        project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                        title               TEXT NOT NULL,
                        done                INTEGER NOT NULL DEFAULT 0,
                        sort_order          INTEGER DEFAULT 0,
                        estimated_minutes   INTEGER,
                        minutes_worked      INTEGER DEFAULT 0,
                        deadline            TEXT
                    )
                """)
                conn.execute("""
                    INSERT INTO deliverables_new
                      (id, project_id, title, done, sort_order, estimated_minutes, minutes_worked, deadline)
                    SELECT id, quest_id, title, done, sort_order, estimated_minutes, minutes_worked, deadline
                    FROM deliverables
                """)
                conn.execute("DROP TABLE deliverables")
                conn.execute("ALTER TABLE deliverables_new RENAME TO deliverables")

                conn.commit()
            finally:
                conn.execute("PRAGMA foreign_keys=ON")
