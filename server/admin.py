"""Admin endpoints for database management."""

import logging
import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel

from . import config
from .database import db
from .updater import check_and_update

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])
security = HTTPBasic()


def verify_admin(credentials: HTTPBasicCredentials = Depends(security)) -> None:
    if not config.ADMIN_USER or not config.ADMIN_PASS:
        raise HTTPException(status_code=503, detail="Admin not configured")
    user_ok = secrets.compare_digest(credentials.username, config.ADMIN_USER)
    pass_ok = secrets.compare_digest(credentials.password, config.ADMIN_PASS)
    if not (user_ok and pass_ok):
        raise HTTPException(status_code=401, detail="Invalid credentials")


class SwapRequest(BaseModel):
    db_path: str


@router.post("/swap")
async def swap_db(req: SwapRequest, _=Depends(verify_admin)):
    """Swap the active database to a specific file in DATA_DIR."""
    path = config.DATA_DIR / req.db_path

    if not path.name.endswith(".duckdb"):
        raise HTTPException(status_code=400, detail="Must be a .duckdb file")

    # Prevent path traversal
    try:
        path.resolve().relative_to(config.DATA_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Path traversal not allowed")

    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {req.db_path}")

    try:
        db.swap(path)
    except Exception as e:
        logger.exception("Admin swap failed")
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "ok", "active_db": str(db.current_path)}


@router.post("/check-update")
async def trigger_update(_=Depends(verify_admin)):
    """Manually trigger an S3 update check."""
    try:
        result = await check_and_update()
    except Exception as e:
        logger.exception("Manual update check failed")
        raise HTTPException(status_code=500, detail=str(e))
    return result


@router.post("/status")
async def db_status(_=Depends(verify_admin)):
    """Return current database info."""
    return {
        "active_db": str(db.current_path),
        "data_dir_files": [
            f.name for f in sorted(config.DATA_DIR.glob("*.duckdb"))
        ],
    }
