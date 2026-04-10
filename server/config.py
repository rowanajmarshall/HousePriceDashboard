import os
from pathlib import Path

ROOT = Path(__file__).parent.parent

ANTHROPIC_API_KEY: str = os.environ.get("ANTHROPIC_API_KEY", "")
DUCKDB_PATH: Path = Path(os.environ.get("DUCKDB_PATH", str(ROOT / "data" / "house_prices.duckdb")))
MAX_ROWS: int = int(os.environ.get("MAX_ROWS", "500"))
QUERY_TIMEOUT: int = int(os.environ.get("QUERY_TIMEOUT", "10"))  # seconds

POSTHOG_PROJECT_TOKEN: str = os.environ.get("POSTHOG_PROJECT_TOKEN", "")
POSTHOG_HOST: str = os.environ.get("POSTHOG_HOST", "https://us.i.posthog.com")

DUCKDB_MEMORY_LIMIT: str = os.environ.get("DUCKDB_MEMORY_LIMIT", "128MB")
DUCKDB_THREADS: int = int(os.environ.get("DUCKDB_THREADS", "2"))
