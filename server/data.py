"""
/api/data/* endpoints — serve price, inflation, and district-name data from DuckDB.

All results are cached in-process with lru_cache (safe: DB is read-only).
Cache keys include db.generation so a query racing a hot-swap can never
leave stale pre-swap data in the cache.

Endpoints are deliberately sync `def` — FastAPI runs them in its threadpool,
keeping blocking DuckDB work off the event loop.
"""

import json
from functools import lru_cache

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from .cache import register_cache
from .database import db, execute_raw

router = APIRouter(prefix="/api/data")


# ---------------------------------------------------------------------------
# district_year_stats — pre-computed at ETL time (scripts/build_duckdb.py).
# All hot-path queries hit this ~350K-row table instead of the 30M-row
# transactions table, keeping DuckDB's buffer pool (and process RSS) small.
# The fallback exists only for a hot-swapped DB built before the table was
# added; it can be removed once all deployed DBs include it.
# ---------------------------------------------------------------------------

@lru_cache(maxsize=4)
def _has_agg_table_cached(_generation: int) -> bool:
    rows, _ = execute_raw("""
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_name = 'district_year_stats'
    """)
    return rows[0][0] > 0

register_cache(_has_agg_table_cached)


def _has_agg_table() -> bool:
    return _has_agg_table_cached(db.generation)


# ---------------------------------------------------------------------------
# /api/data/prices/{year}
# ---------------------------------------------------------------------------

@lru_cache(maxsize=64)
def _load_prices_cached(year: int, _generation: int) -> bytes:
    if _has_agg_table():
        rows, _ = execute_raw("""
            SELECT district, property_type, avg, median, count
            FROM district_year_stats
            WHERE year = ?
        """, [year])
    else:
        # Per-type stats (D, S, T, F) plus pooled all-types ('A') for the year
        rows, _ = execute_raw("""
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

            UNION ALL

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
        """, [year, year])

    data: dict[str, dict] = {}
    for district, prop_type, avg, median, count in rows:
        if district not in data:
            data[district] = {}
        data[district][prop_type] = {"avg": avg, "median": median, "count": count}

    # Pre-serialize: one bytes object is far cheaper than thousands of Python dicts
    return json.dumps({"year": year, "data": data}).encode()

register_cache(_load_prices_cached)


def _load_prices(year: int) -> bytes:
    return _load_prices_cached(year, db.generation)


@router.get("/prices/{year}")
def prices(year: int):
    if year < 1995 or year > 2100:
        raise HTTPException(status_code=400, detail="Invalid year")
    try:
        return Response(content=_load_prices(year), media_type="application/json")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# /api/data/inflation
# ---------------------------------------------------------------------------

@lru_cache(maxsize=4)
def _load_inflation_cached(_generation: int) -> dict:
    rows, _ = execute_raw("SELECT year, index FROM cpi ORDER BY year")
    return {
        "description": "UK CPI Index (2015 = 100). Source: ONS series D7BT",
        "base_year": 2015,
        "data": {str(year): index for year, index in rows},
    }

register_cache(_load_inflation_cached)


def _load_inflation() -> dict:
    return _load_inflation_cached(db.generation)


@router.get("/inflation")
def inflation():
    try:
        return _load_inflation()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# /api/data/district/{code}  — all years for one district
# ---------------------------------------------------------------------------

@lru_cache(maxsize=256)
def _load_district_cached(code: str, _generation: int) -> bytes:
    if _has_agg_table():
        rows, _ = execute_raw("""
            SELECT year, property_type, avg, median, count
            FROM district_year_stats
            WHERE district = ?
        """, [code])
    else:
        rows, _ = execute_raw("""
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
        """, [code, code])

    name_rows, _ = execute_raw(
        "SELECT name FROM district_names WHERE district = ?", [code]
    )
    name_row = name_rows[0] if name_rows else None

    data: dict[str, dict] = {}
    for year, prop_type, avg, median, count in rows:
        key = str(year)
        if key not in data:
            data[key] = {}
        data[key][prop_type] = {"avg": avg, "median": median, "count": count}

    return json.dumps({
        "district": code,
        "name": name_row[0] if name_row else None,
        "data": data,
    }).encode()

register_cache(_load_district_cached)


def _load_district(code: str) -> bytes:
    return _load_district_cached(code, db.generation)


@router.get("/district/{code}")
def get_district(code: str):
    code = code.upper()
    if not code or len(code) > 4:
        raise HTTPException(status_code=400, detail="Invalid district code")
    try:
        return Response(
            content=_load_district(code),
            media_type="application/json",
            headers={"Cache-Control": "no-cache"},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# /api/data/district-names
# ---------------------------------------------------------------------------

@lru_cache(maxsize=4)
def _load_district_names_cached(_generation: int) -> dict:
    rows, _ = execute_raw("SELECT district, name FROM district_names")
    return {district: name for district, name in rows}

register_cache(_load_district_names_cached)


def _load_district_names() -> dict:
    return _load_district_names_cached(db.generation)


@router.get("/district-names")
def get_district_names():
    try:
        return _load_district_names()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Latest year with data — injected into templates as window.DATA_MAX_YEAR
# ---------------------------------------------------------------------------

@lru_cache(maxsize=4)
def _data_max_year_cached(_generation: int) -> int:
    if _has_agg_table():
        rows, _ = execute_raw("SELECT MAX(year) FROM district_year_stats")
    else:
        rows, _ = execute_raw("SELECT YEAR(MAX(date)) FROM transactions")
    return rows[0][0]

register_cache(_data_max_year_cached)


def data_max_year() -> int:
    return _data_max_year_cached(db.generation)
