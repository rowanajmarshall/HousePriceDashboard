"""Read-only DuckDB connection manager with hot-swap support."""

import logging
import threading
from pathlib import Path
from typing import Callable

import duckdb

from . import config

logger = logging.getLogger(__name__)


class DatabaseManager:
    """Thread-safe DuckDB connection with hot-swap capability."""

    def __init__(self) -> None:
        self._con: duckdb.DuckDBPyConnection | None = None
        self._db_path: Path | None = None
        self._init_lock = threading.Lock()
        self._query_lock = threading.Lock()
        self._swap_callbacks: list[Callable] = []
        self._generation = 0

    @property
    def current_path(self) -> Path | None:
        return self._db_path

    @property
    def generation(self) -> int:
        """Increments on every swap — used to key caches so results computed
        against an old database can never satisfy post-swap requests."""
        return self._generation

    def register_swap_callback(self, fn: Callable) -> None:
        """Register a function to call after a successful DB swap."""
        self._swap_callbacks.append(fn)

    def get_connection(self) -> duckdb.DuckDBPyConnection:
        if self._con is None:
            with self._init_lock:
                if self._con is None:
                    self._open(config.DUCKDB_PATH)
        return self._con

    def _open(self, path: Path) -> None:
        if not path.exists():
            raise RuntimeError(
                f"DuckDB file not found: {path}. "
                "Run `python scripts/build_duckdb.py` first."
            )
        con = duckdb.connect(str(path), read_only=True)
        con.execute(f"SET memory_limit='{config.DUCKDB_MEMORY_LIMIT}'")
        con.execute(f"SET threads={config.DUCKDB_THREADS}")
        # Defence in depth: no reading local files / URLs via SQL functions
        con.execute("SET enable_external_access=false")
        self._con = con
        self._db_path = path
        logger.info("Opened DuckDB file: %s", path.name)

    def swap(self, new_path: Path) -> None:
        """Hot-swap to a new database file.

        Validates the new file first, then acquires the query lock so all
        in-flight queries complete before closing the old connection.
        """
        if not new_path.exists():
            raise FileNotFoundError(f"Cannot swap to non-existent file: {new_path}")

        # Validate before taking the lock
        test_con = duckdb.connect(str(new_path), read_only=True)
        try:
            test_con.execute("SELECT 1")
        except Exception:
            test_con.close()
            raise
        test_con.close()

        with self._query_lock:
            old_path = self._db_path
            old_con = self._con
            self._open(new_path)
            self._generation += 1
            if old_con is not None:
                try:
                    old_con.close()
                except Exception:
                    logger.warning("Error closing old connection", exc_info=True)

        # Fire callbacks outside the lock
        for cb in self._swap_callbacks:
            try:
                cb()
            except Exception:
                logger.warning("Swap callback failed", exc_info=True)

        logger.info(
            "Swapped active DuckDB from %s to %s",
            old_path.name if old_path else "<none>",
            new_path.name,
        )

    def execute_raw(self, sql: str, params: list | None = None) -> tuple[list[tuple], list[str]]:
        """Execute a SQL query and return raw rows, serialised through a single lock."""
        with self._query_lock:
            con = self.get_connection()
            rel = con.execute(sql, params or [])
            return rel.fetchall(), [desc[0] for desc in rel.description]


# Module-level singleton
db = DatabaseManager()


# Backward-compatible module-level function
def execute_raw(sql: str, params: list | None = None) -> tuple[list[tuple], list[str]]:
    return db.execute_raw(sql, params)
