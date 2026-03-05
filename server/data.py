"""
/api/data/* endpoints — serve price, inflation, and district-name data from DuckDB.

All results are cached in-process with lru_cache (safe: DB is read-only).
"""

from functools import lru_cache

import duckdb
from fastapi import APIRouter, HTTPException

from .database import get_connection

router = APIRouter(prefix="/api/data")


def _raw_connection() -> duckdb.DuckDBPyConnection:
    """Return the shared read-only connection (bypasses MAX_ROWS cap)."""
    return get_connection()


# ---------------------------------------------------------------------------
# /api/data/prices/{year}
# ---------------------------------------------------------------------------

@lru_cache(maxsize=None)
def _load_prices(year: int) -> dict:
    con = _raw_connection()

    # Per-type stats (D, S, T, F) for the given year
    rows = con.execute("""
        SELECT
            district,
            property_type,
            CAST(ROUND(AVG(price)) AS INTEGER)    AS avg,
            CAST(MEDIAN(price) AS INTEGER)         AS median,
            COUNT(*)                               AS count
        FROM transactions
        WHERE YEAR(date) = ?
          AND property_type IN ('D', 'S', 'T', 'F')
        GROUP BY district, property_type
    """, [year]).fetchall()

    # All-types aggregate (true pooled avg/median across D+S+T+F)
    all_rows = con.execute("""
        SELECT
            district,
            'A'                                    AS property_type,
            CAST(ROUND(AVG(price)) AS INTEGER)    AS avg,
            CAST(MEDIAN(price) AS INTEGER)         AS median,
            COUNT(*)                               AS count
        FROM transactions
        WHERE YEAR(date) = ?
          AND property_type IN ('D', 'S', 'T', 'F')
        GROUP BY district
    """, [year]).fetchall()

    data: dict[str, dict] = {}
    for district, prop_type, avg, median, count in rows + all_rows:
        if district not in data:
            data[district] = {}
        data[district][prop_type] = {"avg": avg, "median": median, "count": count}

    return {"year": year, "data": data}


@router.get("/prices/{year}")
async def prices(year: int):
    if year < 1995 or year > 2100:
        raise HTTPException(status_code=400, detail="Invalid year")
    try:
        return _load_prices(year)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# /api/data/inflation
# ---------------------------------------------------------------------------

@lru_cache(maxsize=None)
def _load_inflation() -> dict:
    con = _raw_connection()
    rows = con.execute("SELECT year, index FROM cpi ORDER BY year").fetchall()
    return {
        "description": "UK CPI Index (2015 = 100). Source: ONS series D7BT",
        "base_year": 2015,
        "data": {str(year): index for year, index in rows},
    }


@router.get("/inflation")
async def inflation():
    try:
        return _load_inflation()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# /api/data/district/{code}  — all years for one district
# ---------------------------------------------------------------------------

@lru_cache(maxsize=512)
def _load_district(code: str) -> dict:
    con = _raw_connection()

    rows = con.execute("""
        SELECT
            YEAR(date)                             AS year,
            property_type,
            CAST(ROUND(AVG(price)) AS INTEGER)    AS avg,
            CAST(MEDIAN(price) AS INTEGER)         AS median,
            COUNT(*)                               AS count
        FROM transactions
        WHERE district = ?
          AND property_type IN ('D', 'S', 'T', 'F')
        GROUP BY YEAR(date), property_type

        UNION ALL

        SELECT
            YEAR(date)                             AS year,
            'A'                                    AS property_type,
            CAST(ROUND(AVG(price)) AS INTEGER)    AS avg,
            CAST(MEDIAN(price) AS INTEGER)         AS median,
            COUNT(*)                               AS count
        FROM transactions
        WHERE district = ?
          AND property_type IN ('D', 'S', 'T', 'F')
        GROUP BY YEAR(date)
    """, [code, code]).fetchall()

    name_row = con.execute(
        "SELECT name FROM district_names WHERE district = ?", [code]
    ).fetchone()

    data: dict[str, dict] = {}
    for year, prop_type, avg, median, count in rows:
        key = str(year)
        if key not in data:
            data[key] = {}
        data[key][prop_type] = {"avg": avg, "median": median, "count": count}

    return {
        "district": code,
        "name": name_row[0] if name_row else None,
        "data": data,
    }


@router.get("/district/{code}")
async def get_district(code: str):
    code = code.upper()
    if not code or len(code) > 4:
        raise HTTPException(status_code=400, detail="Invalid district code")
    try:
        return _load_district(code)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# /api/data/district-names
# ---------------------------------------------------------------------------

@lru_cache(maxsize=None)
def _load_district_names() -> dict:
    con = _raw_connection()
    rows = con.execute("SELECT district, name FROM district_names").fetchall()
    return {district: name for district, name in rows}


@router.get("/district-names")
async def get_district_names():
    try:
        return _load_district_names()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
