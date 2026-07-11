"""Check Railway S3 storage for newer DuckDB files and hot-swap on startup."""

import asyncio
import logging
import re
from datetime import date
from pathlib import Path

import boto3
from botocore.exceptions import ClientError, NoCredentialsError

from . import config
from .database import db

logger = logging.getLogger(__name__)

_DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})\.duckdb$")


def _extract_date(path: Path) -> date | None:
    """Extract date from a filename like '2026-04-27.duckdb'."""
    m = _DATE_RE.search(path.name)
    if m:
        return date.fromisoformat(m.group(1))
    return None


def _current_date() -> date | None:
    """Get the date of the currently active database.

    Returns None if the filename doesn't match yyyy-mm-dd.duckdb
    (treated as infinitely old — any S3 file is newer).
    """
    p = db.current_path
    if p is None:
        return None
    return _extract_date(p)


def _make_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=config.AWS_ENDPOINT_URL or None,
        aws_access_key_id=config.S3_ACCESS_KEY_ID or None,
        aws_secret_access_key=config.S3_SECRET_ACCESS_KEY or None,
    )


def _download_from_s3(dest: Path) -> None:
    """Download the latest DB from S3. Blocking I/O."""
    s3 = _make_s3_client()
    logger.info(
        "Downloading new DuckDB file from s3://%s/%s to %s",
        config.S3_BUCKET,
        config.S3_LATEST_KEY,
        dest.name,
    )
    tmp = dest.with_suffix(".tmp")
    try:
        s3.download_file(config.S3_BUCKET, config.S3_LATEST_KEY, str(tmp))
        tmp.rename(dest)
        logger.info("Finished downloading DuckDB file: %s", dest.name)
    except Exception:
        if tmp.exists():
            tmp.unlink()
        raise


# A real dataset has ~30M transactions; far fewer means a truncated build
_MIN_TRANSACTIONS = 1_000_000


def _verify_active_database() -> bool:
    """Run real queries against the newly active database.

    Old files are only cleaned up when this passes — a database that opens
    but is truncated or missing tables must never trigger deletion of the
    known-good previous files.
    """
    try:
        rows, _ = db.execute_raw("SELECT COUNT(*) FROM transactions")
        count = rows[0][0]
        if count < _MIN_TRANSACTIONS:
            logger.error(
                "Active DB failed verification: only %s transactions (expected >= %s)",
                f"{count:,}", f"{_MIN_TRANSACTIONS:,}",
            )
            return False
        rows, _ = db.execute_raw("SELECT YEAR(MAX(date)) FROM transactions")
        if not rows or rows[0][0] is None:
            logger.error("Active DB failed verification: no max transaction date")
            return False
        for table in ("cpi", "district_names"):
            rows, _ = db.execute_raw(f"SELECT COUNT(*) FROM {table}")
            if rows[0][0] == 0:
                logger.error("Active DB failed verification: %s table is empty", table)
                return False
    except Exception:
        logger.exception("Active DB failed verification with an error")
        return False
    logger.info("Active DB passed verification (%s transactions)", f"{count:,}")
    return True


def _cleanup_old_databases(keep_previous: int = 1) -> list[str]:
    """Delete stale .duckdb files from DATA_DIR after a swap.

    Never touches the active database; keeps the `keep_previous` most recent
    non-active files as rollback candidates and deletes the rest. Without this,
    every update leaves another GB-scale file behind until the volume fills.
    """
    active = db.current_path.resolve() if db.current_path else None
    candidates = sorted(
        (p for p in config.DATA_DIR.glob("*.duckdb") if p.resolve() != active),
        key=lambda p: (_extract_date(p) or date.min, p.name),
        reverse=True,
    )
    deleted = []
    for p in candidates[keep_previous:]:
        try:
            p.unlink()
            deleted.append(p.name)
        except OSError:
            logger.warning("Could not delete old DuckDB file: %s", p.name, exc_info=True)
    if deleted:
        logger.info("Deleted %d old DuckDB file(s): %s", len(deleted), ", ".join(deleted))
    return deleted


async def check_and_update() -> dict:
    """Check S3 for a newer DB. Download and swap if found.

    Returns a status dict for logging/admin visibility.
    """
    logger.info("Entered check_and_update()")
    if not config.S3_BUCKET:
        logger.info("Skipping DuckDB update check: S3_BUCKET not configured")
        return {"status": "skipped", "reason": "S3_BUCKET not configured"}

    try:
        s3 = _make_s3_client()
        head = await asyncio.to_thread(
            s3.head_object, Bucket=config.S3_BUCKET, Key=config.S3_LATEST_KEY
        )
    except NoCredentialsError:
        logger.error("DuckDB update check failed: AWS credentials not configured")
        return {"status": "error", "reason": "no credentials"}
    except ClientError as e:
        logger.error("DuckDB update check failed during head_object: %s", e)
        return {"status": "error", "reason": str(e)}

    # Get remote date from S3 object metadata, fallback to LastModified
    remote_date_str = head.get("Metadata", {}).get("db-date")
    if remote_date_str:
        remote_date = date.fromisoformat(remote_date_str)
    else:
        remote_date = head["LastModified"].date()

    current = _current_date()
    logger.info(
        "Current DuckDB file: %s (date=%s); remote DuckDB timestamp: %s",
        db.current_path.name if db.current_path else "<none>",
        current.isoformat() if current else "unknown",
        remote_date.isoformat(),
    )
    if current and remote_date <= current:
        logger.info(
            "No DuckDB update needed: current=%s remote=%s",
            current.isoformat(),
            remote_date.isoformat(),
        )
        return {"status": "up_to_date", "current": str(current), "remote": str(remote_date)}

    dest = config.DATA_DIR / f"{remote_date.isoformat()}.duckdb"

    if dest.exists():
        logger.info(
            "Remote DuckDB timestamp %s already exists locally as %s; swapping without download",
            remote_date.isoformat(),
            dest.name,
        )
    else:
        logger.info(
            "Remote DuckDB timestamp %s requires a new download",
            remote_date.isoformat(),
        )
        await asyncio.to_thread(_download_from_s3, dest)

    db.swap(dest)

    # Only delete old files once the new database demonstrably works
    verified = _verify_active_database()
    deleted = _cleanup_old_databases() if verified else []

    return {
        "status": "swapped",
        "old": str(current),
        "new": str(remote_date),
        "verified": verified,
        "deleted": deleted,
    }
