"""Read-only DuckDB singleton."""

import threading
from typing import Any

import duckdb

from . import config

_init_lock = threading.Lock()
_query_lock = threading.Lock()
_con: duckdb.DuckDBPyConnection | None = None


def get_connection() -> duckdb.DuckDBPyConnection:
    global _con
    if _con is None:
        with _init_lock:
            if _con is None:
                if not config.DUCKDB_PATH.exists():
                    raise RuntimeError(
                        f"DuckDB file not found: {config.DUCKDB_PATH}. "
                        "Run `python scripts/build_duckdb.py` first."
                    )
                _con = duckdb.connect(str(config.DUCKDB_PATH), read_only=True)
                _con.execute(f"SET memory_limit='{config.DUCKDB_MEMORY_LIMIT}'")
                _con.execute(f"SET threads={config.DUCKDB_THREADS}")
    return _con


def execute_raw(sql: str, params: list = []) -> list[tuple]:
    """Execute a SQL query and return raw rows, serialised through a single lock."""
    con = get_connection()
    with _query_lock:
        rel = con.execute(sql, params)
        return rel.fetchall(), [desc[0] for desc in rel.description]


def execute_query(sql: str) -> list[dict[str, Any]]:
    """Execute a SQL query and return rows as a list of dicts, capped at MAX_ROWS."""
    con = get_connection()
    with _query_lock:
        rel = con.execute(sql)
        columns = [desc[0] for desc in rel.description]
        rows = rel.fetchmany(config.MAX_ROWS + 1)

    truncated = len(rows) > config.MAX_ROWS
    rows = rows[: config.MAX_ROWS]

    result = [dict(zip(columns, row)) for row in rows]

    if truncated:
        result.append({"_truncated": True, "message": f"Results truncated to {config.MAX_ROWS} rows"})

    return result
