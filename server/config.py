import os
from pathlib import Path

ROOT = Path(__file__).parent.parent

DUCKDB_PATH: Path = Path(os.environ.get("DUCKDB_PATH", str(ROOT / "data" / "house_prices.duckdb")))

POSTHOG_PROJECT_TOKEN: str = os.environ.get("POSTHOG_PROJECT_TOKEN", "")
POSTHOG_HOST: str = os.environ.get("POSTHOG_HOST", "https://us.i.posthog.com")

DUCKDB_MEMORY_LIMIT: str = os.environ.get("DUCKDB_MEMORY_LIMIT", "128MB")
DUCKDB_THREADS: int = int(os.environ.get("DUCKDB_THREADS", "2"))

# Railway S3-compatible storage
AWS_ENDPOINT_URL: str = os.environ.get("AWS_ENDPOINT_URL", "")
S3_ACCESS_KEY_ID: str = os.environ.get("AWS_ACCESS_KEY_ID", "")
S3_SECRET_ACCESS_KEY: str = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
S3_BUCKET: str = os.environ.get("AWS_S3_BUCKET_NAME", "")
S3_LATEST_KEY: str = os.environ.get("S3_LATEST_KEY", "latest.duckdb")

# Admin auth
ADMIN_USER: str = os.environ.get("ADMIN_USER", "")
ADMIN_PASS: str = os.environ.get("ADMIN_PASS", "")

# Data directory for downloaded DB files
DATA_DIR: Path = Path(os.environ.get("DATA_DIR", str(ROOT / "data")))
