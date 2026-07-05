#!/usr/bin/env python3
"""
Build DuckDB database from Land Registry CSV and inflation data.

Usage:
    python scripts/build_duckdb.py [--csv PATH] [--inflation PATH] [--out PATH]
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import duckdb

ROOT = Path(__file__).parent.parent
DEFAULT_CSV = ROOT / "scripts" / "raw_data" / "pp-complete.csv"
DEFAULT_INFLATION = ROOT / "public" / "data" / "inflation.json"
DEFAULT_DISTRICT_NAMES = ROOT / "scripts" / "raw_data" / "district-names.json"
DEFAULT_OUT = ROOT / "data" / "house_prices.duckdb"

# Land Registry PP Complete column order (no header row)
# https://www.gov.uk/guidance/about-the-price-paid-data
COLUMNS = [
    "transaction_id",  # {UUID}
    "price",           # integer
    "date",            # YYYY-MM-DD HH:MM
    "postcode",
    "property_type",   # D/S/T/F/O
    "new_build",       # Y/N
    "tenure",          # F/L
    "paon",
    "saon",
    "street",
    "locality",
    "town",
    "district",
    "county",
    "ppd_category",    # A/B
    "record_status",   # A/C/D
]


def build(csv_path: Path, inflation_path: Path, district_names_path: Path, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if out_path.exists():
        out_path.unlink()
        print(f"Removed existing {out_path}")

    print(f"Opening DuckDB at {out_path}")
    con = duckdb.connect(str(out_path))

    # ------------------------------------------------------------------
    # transactions table
    # ------------------------------------------------------------------
    print(f"Importing CSV: {csv_path}")
    t0 = time.time()

    con.execute(f"""
        CREATE TABLE transactions AS
        SELECT
            CAST(price AS INTEGER)                          AS price,
            CAST(date AS DATE)                              AS date,
            TRIM(postcode)                                  AS postcode,
            -- postcode sector: first part + first digit of second part (e.g. "SW1A 1")
            REGEXP_REPLACE(
                TRIM(postcode),
                '^([A-Z]{{1,2}}[0-9][0-9A-Z]?) ([0-9]).*$',
                '\\1 \\2'
            )                                               AS sector,
            -- postcode district: first part only (e.g. "SW1A")
            REGEXP_REPLACE(
                TRIM(postcode),
                '^([A-Z]{{1,2}}[0-9][0-9A-Z]?) .*$',
                '\\1'
            )                                               AS district,
            property_type,
            new_build,
            tenure
        FROM read_csv(
            '{csv_path}',
            header = false,
            columns = {{
                'transaction_id': 'VARCHAR',
                'price':          'VARCHAR',
                'date':           'VARCHAR',
                'postcode':       'VARCHAR',
                'property_type':  'VARCHAR',
                'new_build':      'VARCHAR',
                'tenure':         'VARCHAR',
                'paon':           'VARCHAR',
                'saon':           'VARCHAR',
                'street':         'VARCHAR',
                'locality':       'VARCHAR',
                'town':           'VARCHAR',
                'district':       'VARCHAR',
                'county':         'VARCHAR',
                'ppd_category':   'VARCHAR',
                'record_status':  'VARCHAR'
            }},
            ignore_errors = true
        )
        WHERE price IS NOT NULL
          AND date IS NOT NULL
          AND postcode <> ''
          -- Category A = standard price paid; B covers repossessions,
          -- power-of-sale transfers and buy-to-lets, which skew averages
          AND ppd_category = 'A'
    """)

    row_count = con.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
    elapsed = time.time() - t0
    print(f"Imported {row_count:,} rows in {elapsed:.1f}s")

    # ------------------------------------------------------------------
    # Indexes
    # ------------------------------------------------------------------
    print("Creating indexes…")
    con.execute("CREATE INDEX idx_sector   ON transactions(sector)")
    con.execute("CREATE INDEX idx_district ON transactions(district)")
    con.execute("CREATE INDEX idx_date     ON transactions(date)")
    print("Indexes created.")

    # ------------------------------------------------------------------
    # cpi table from inflation.json
    # ------------------------------------------------------------------
    print(f"Importing inflation data: {inflation_path}")
    with open(inflation_path) as f:
        inflation = json.load(f)

    rows = [(int(year), float(index)) for year, index in inflation["data"].items()]

    con.execute("""
        CREATE TABLE cpi (
            year    INTEGER PRIMARY KEY,
            index   DOUBLE
        )
    """)
    con.executemany("INSERT INTO cpi VALUES (?, ?)", rows)
    print(f"Imported {len(rows)} CPI rows (base year {inflation.get('base_year', '?')} = 100)")

    # ------------------------------------------------------------------
    # district_names table from district-names.json
    # ------------------------------------------------------------------
    print(f"Importing district names: {district_names_path}")
    with open(district_names_path) as f:
        district_names = json.load(f)

    dn_rows = [(district, name) for district, name in district_names.items()]

    con.execute("""
        CREATE TABLE district_names (
            district VARCHAR PRIMARY KEY,
            name     VARCHAR
        )
    """)
    con.executemany("INSERT INTO district_names VALUES (?, ?)", dn_rows)
    print(f"Imported {len(dn_rows)} district name rows")

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    con.execute("CHECKPOINT")
    con.close()

    size_mb = out_path.stat().st_size / (1024 ** 2)
    print(f"\nDone. Database written to {out_path} ({size_mb:.1f} MB)")
    print(f"  transactions:   {row_count:,} rows")
    print(f"  cpi:            {len(rows)} rows")
    print(f"  district_names: {len(dn_rows)} rows")


def main():
    parser = argparse.ArgumentParser(description="Build house_prices.duckdb")
    parser.add_argument("--csv",             default=str(DEFAULT_CSV),            help="Path to pp-complete.csv")
    parser.add_argument("--inflation",       default=str(DEFAULT_INFLATION),      help="Path to inflation.json")
    parser.add_argument("--district-names",  default=str(DEFAULT_DISTRICT_NAMES), help="Path to district-names.json")
    parser.add_argument("--out",             default=str(DEFAULT_OUT),            help="Output .duckdb path")
    args = parser.parse_args()

    csv_path            = Path(args.csv)
    inflation_path      = Path(args.inflation)
    district_names_path = Path(args.district_names)
    out_path            = Path(args.out)

    if not csv_path.exists():
        print(f"ERROR: CSV not found: {csv_path}", file=sys.stderr)
        sys.exit(1)
    if not inflation_path.exists():
        print(f"ERROR: inflation.json not found: {inflation_path}", file=sys.stderr)
        sys.exit(1)
    if not district_names_path.exists():
        print(f"ERROR: district-names.json not found: {district_names_path}", file=sys.stderr)
        sys.exit(1)

    build(csv_path, inflation_path, district_names_path, out_path)


if __name__ == "__main__":
    main()
