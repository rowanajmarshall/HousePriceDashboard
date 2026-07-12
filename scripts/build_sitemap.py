#!/usr/bin/env python3
"""
Generate public/sitemap.xml from the DuckDB database and blog templates.

Run after every data update (part of `make update-data`):
    uv run python scripts/build_sitemap.py [--db PATH] [--out PATH]
"""

import argparse
import re
import sys
from datetime import date
from pathlib import Path

import duckdb

ROOT = Path(__file__).parent.parent
DEFAULT_DB = ROOT / "data" / "house_prices.duckdb"
DEFAULT_OUT = ROOT / "public" / "sitemap.xml"
BLOG_DIR = ROOT / "server" / "templates" / "blog"

BASE_URL = "https://housepricedashboard.co.uk"

STATIC_PAGES = ["/", "/browse", "/compare", "/blog", "/contact", "/attribution"]

# Must match the route guard in server/pages.py — anything else 404s
_POSTCODE_RE = re.compile(r"^[A-Z]{1,2}\d{1,2}[A-Z]?$")


def build(db_path: Path, out_path: Path) -> None:
    con = duckdb.connect(str(db_path), read_only=True)

    # Same criterion as _ssr_content in server/pages.py: an area page 404s
    # unless the district has data in at least one complete (pre-current) year
    districts = [
        d for (d,) in con.execute(
            """
            SELECT DISTINCT district FROM district_year_stats
            WHERE year < ? ORDER BY district
            """,
            [date.today().year],
        ).fetchall()
        if _POSTCODE_RE.match(d)
    ]
    max_date, = con.execute("SELECT MAX(date) FROM transactions").fetchone()
    con.close()

    lastmod = max_date.isoformat()
    blog_slugs = sorted(p.stem for p in BLOG_DIR.glob("*.html"))

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for path in STATIC_PAGES:
        lines.append(f"  <url><loc>{BASE_URL}{path}</loc></url>")
    for slug in blog_slugs:
        lines.append(f"  <url><loc>{BASE_URL}/blog/{slug}</loc></url>")
    for district in districts:
        lines.append(
            f"  <url><loc>{BASE_URL}/area/{district}</loc>"
            f"<lastmod>{lastmod}</lastmod></url>"
        )
    lines.append("</urlset>")

    out_path.write_text("\n".join(lines) + "\n")
    print(
        f"Wrote {out_path.name} — {len(STATIC_PAGES)} static pages, "
        f"{len(blog_slugs)} blog posts, {len(districts)} area pages "
        f"(lastmod {lastmod})"
    )


def main():
    parser = argparse.ArgumentParser(description="Build public/sitemap.xml")
    parser.add_argument("--db",  default=str(DEFAULT_DB),  help="Path to house_prices.duckdb")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="Output sitemap.xml path")
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: database not found: {db_path}", file=sys.stderr)
        sys.exit(1)

    build(db_path, Path(args.out))


if __name__ == "__main__":
    main()
