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

# Railway S3-compatible storage
S3_ENDPOINT: str = os.environ.get("S3_ENDPOINT", "")
S3_ACCESS_KEY_ID: str = os.environ.get("S3_ACCESS_KEY_ID", "")
S3_SECRET_ACCESS_KEY: str = os.environ.get("S3_SECRET_ACCESS_KEY", "")
S3_BUCKET: str = os.environ.get("S3_BUCKET", "")
S3_LATEST_KEY: str = os.environ.get("S3_LATEST_KEY", "latest.duckdb")

# Admin auth
ADMIN_USER: str = os.environ.get("ADMIN_USER", "")
ADMIN_PASS: str = os.environ.get("ADMIN_PASS", "")

# Data directory for downloaded DB files
DATA_DIR: Path = Path(os.environ.get("DATA_DIR", str(ROOT / "data")))
