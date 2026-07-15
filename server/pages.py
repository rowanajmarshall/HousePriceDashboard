"""
Server-side rendering for all HTML pages using Jinja2 templates.

Templates live in server/templates/ and extend base.html for shared
header, nav, share button, footer, and analytics.
"""

import json
import re
from datetime import date
from functools import lru_cache
from pathlib import Path
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from .data import _load_district, _load_district_names, data_max_year
from .database import execute_raw
from .templating import templates

_POSTCODE_RE = re.compile(r"^[A-Z]{1,2}\d{1,2}[A-Z]?$")

router = APIRouter()

ROOT = Path(__file__).parent.parent

logger = logging.getLogger(__name__)


# ── Static page routes ──────────────────────────────────────────────────────

@router.get("/", response_class=HTMLResponse)
async def index_page(request: Request):
    logger.info(f"User headers: {request.headers}")
    return templates.TemplateResponse(request, "index.html", {
        "active_nav": "map",
        "subtitle": "Explore 30+ years of property prices across England & Wales",
        "show_search": True,
        "posthog": True,
        "og_title": "House Price Dashboard",
        "og_description": "Explore 30+ years of property prices across England & Wales",
    })


@router.get("/contact", response_class=HTMLResponse)
async def contact_page(request: Request):
    return templates.TemplateResponse(request, "contact.html", {
        "active_nav": "contact",
        "subtitle": "Get in touch",
        "og_title": "Contact - House Price Dashboard",
        "og_description": "Get in touch with House Price Dashboard",
    })


@router.get("/contact.html")
async def contact_page_legacy():
    return RedirectResponse("/contact", status_code=301)


@router.get("/attribution", response_class=HTMLResponse)
async def attribution_page(request: Request):
    return templates.TemplateResponse(request, "attribution.html", {
        "active_nav": "attributions",
        "subtitle": "Data Attribution & Licenses",
        "og_title": "Attribution - House Price Dashboard",
        "og_description": "Data sources and licenses for House Price Dashboard",
    })


@router.get("/attribution.html")
async def attribution_page_legacy():
    return RedirectResponse("/attribution", status_code=301)


@router.get("/compare", response_class=HTMLResponse)
async def compare_page(request: Request):
    return templates.TemplateResponse(request, "compare.html", {
        "subtitle": "Area price comparison",
        "posthog": True,
        "og_title": "Compare Areas | House Price Dashboard",
        "og_description": "Compare house price history across multiple UK postcode districts.",
    }, headers={"Cache-Control": "public, max-age=300, s-maxage=86400"})


@router.get("/embed", response_class=HTMLResponse)
async def embed_page():
    content = (ROOT / "public" / "embed.html").read_text()
    return HTMLResponse(
        content=content,
        headers={"Cache-Control": "public, max-age=300, s-maxage=86400"},
    )


@router.get("/browse", response_class=HTMLResponse)
async def browse_page(request: Request):
    return templates.TemplateResponse(request, "browse.html", {
        "active_nav": "browse",
        "subtitle": "Postcode district league table",
        "og_title": "Browse Postcode Districts | House Price Dashboard",
        "og_description": "Browse and compare house prices for every UK postcode district. Sortable league table of average prices, median prices and sales volumes.",
    }, headers={"Cache-Control": "public, max-age=300, s-maxage=86400"})


@router.get("/blog", response_class=HTMLResponse)
async def blog_index(request: Request):
    return templates.TemplateResponse(request, "blog.html", {
        "active_nav": "blog",
        "subtitle": "Blog",
        "og_title": "Blog - House Price Dashboard",
        "og_description": "Articles and insights about UK house prices, property market trends, and data analysis.",
    }, headers={"Cache-Control": "public, max-age=300, s-maxage=86400"})


@router.get("/blog/{slug}", response_class=HTMLResponse)
async def blog_post(request: Request, slug: str):
    template_path = f"blog/{slug}.html"
    try:
        templates.get_template(template_path)
    except Exception:
        raise HTTPException(status_code=404)
    return templates.TemplateResponse(request, template_path, {
        "active_nav": "blog",
        "subtitle": "Blog",
        "og_type": "article",
    }, headers={"Cache-Control": "public, max-age=300, s-maxage=86400"})


# ── Postcode area helpers ────────────────────────────────────────────────────

# Postcode area prefix → place name.
# Two-letter prefixes are checked before single-letter ones.
_AREA_NAMES: dict[str, str] = {
    "AB": "Aberdeen",           "AL": "St Albans",          "BA": "Bath",
    "BB": "Blackburn",          "BD": "Bradford",            "BH": "Bournemouth",
    "BL": "Bolton",             "BN": "Brighton",            "BR": "Bromley",
    "BS": "Bristol",            "CA": "Carlisle",            "CB": "Cambridge",
    "CF": "Cardiff",            "CH": "Chester",             "CM": "Chelmsford",
    "CO": "Colchester",         "CR": "Croydon",             "CT": "Canterbury",
    "CV": "Coventry",           "CW": "Crewe",               "DA": "Dartford",
    "DD": "Dundee",             "DE": "Derby",               "DG": "Dumfries",
    "DH": "Durham",             "DL": "Darlington",          "DN": "Doncaster",
    "DT": "Dorchester",         "DY": "Dudley",              "EC": "Central London",
    "EH": "Edinburgh",          "EN": "Enfield",             "EX": "Exeter",
    "FK": "Falkirk",            "FY": "Blackpool",           "GL": "Gloucester",
    "GU": "Guildford",          "GY": "Guernsey",            "HA": "Harrow",
    "HD": "Huddersfield",       "HG": "Harrogate",           "HP": "Hemel Hempstead",
    "HR": "Hereford",           "HS": "Outer Hebrides",      "HU": "Hull",
    "HX": "Halifax",            "IG": "Ilford",              "IP": "Ipswich",
    "IV": "Inverness",          "JE": "Jersey",              "KA": "Kilmarnock",
    "KT": "Kingston upon Thames", "KW": "Kirkwall",          "KY": "Kirkcaldy",
    "LA": "Lancaster",          "LD": "Llandrindod Wells",   "LE": "Leicester",
    "LL": "Llandudno",          "LN": "Lincoln",             "LS": "Leeds",
    "LU": "Luton",              "ME": "Medway",              "MK": "Milton Keynes",
    "ML": "Motherwell",         "NE": "Newcastle",           "NG": "Nottingham",
    "NN": "Northampton",        "NP": "Newport",             "NR": "Norwich",
    "NW": "Northwest London",   "OL": "Oldham",              "OX": "Oxford",
    "PA": "Paisley",            "PE": "Peterborough",        "PH": "Perth",
    "PL": "Plymouth",           "PO": "Portsmouth",          "PR": "Preston",
    "RG": "Reading",            "RH": "Redhill",             "RM": "Romford",
    "SA": "Swansea",            "SE": "Southeast London",    "SG": "Stevenage",
    "SK": "Stockport",          "SL": "Slough",              "SM": "Sutton",
    "SN": "Swindon",            "SO": "Southampton",         "SP": "Salisbury",
    "SR": "Sunderland",         "SS": "Southend-on-Sea",     "ST": "Stoke-on-Trent",
    "SW": "Southwest London",   "SY": "Shrewsbury",          "TA": "Taunton",
    "TD": "Galashiels",         "TF": "Telford",             "TN": "Tonbridge",
    "TQ": "Torquay",            "TR": "Truro",               "TS": "Teesside",
    "TW": "Twickenham",         "UB": "Southall",            "WA": "Warrington",
    "WC": "Central London",     "WD": "Watford",             "WF": "Wakefield",
    "WN": "Wigan",              "WR": "Worcester",           "WS": "Walsall",
    "WV": "Wolverhampton",      "YO": "York",                "ZE": "Lerwick",
    # Single-letter (checked last)
    "B": "Birmingham",          "E": "East London",          "G": "Glasgow",
    "L": "Liverpool",           "M": "Manchester",           "N": "North London",
    "S": "Sheffield",           "W": "West London",
}


def _area_name(code: str) -> str | None:
    return _AREA_NAMES.get(code[:2]) or _AREA_NAMES.get(code[:1]) or None


def _district_name(code: str) -> str | None:
    rows, _ = execute_raw("SELECT name FROM district_names WHERE district = ?", [code])
    return rows[0][0] if rows else None


@lru_cache(maxsize=1)
def _neighbours() -> dict:
    """District adjacency map built by scripts/build_neighbours.py."""
    try:
        with open(ROOT / "public" / "data" / "neighbours.json") as f:
            return json.load(f)
    except Exception:
        return {}


def _fmt_price(value: int) -> str:
    return f"£{value:,}"


_TYPE_LABELS = [
    ("A", "All types"),
    ("D", "Detached"),
    ("S", "Semi-detached"),
    ("T", "Terraced"),
    ("F", "Flats/maisonettes"),
]


def _ssr_content(code: str, place: str | None) -> dict | None:
    """Query the DB for district stats and pre-render the crawlable page content:
    summary and trend paragraphs, a per-type stats table, and nearby districts.

    Headline figures use the latest complete year — the current calendar year
    only has partial data. Returns None if the district has no data (404).
    """
    try:
        district_data = json.loads(_load_district(code))
    except Exception:
        return None

    data = district_data.get("data", {})
    if not data:
        return None

    years = sorted(int(y) for y in data.keys())
    latest_year = years[-1]
    current_year = date.today().year

    complete_years = [y for y in years if y != current_year]
    if not complete_years:
        return None
    stats_year = complete_years[-1]

    def all_types(year: int) -> dict:
        return data.get(str(year), {}).get("A", {})

    a = all_types(stats_year)
    avg = a.get("avg")
    if not avg:
        return None

    place_str = f"{place} ({code})" if place else code

    # Headline: latest complete year vs first year, and the peak
    earliest = next((y for y in complete_years if all_types(y).get("avg")), None)
    summary = f"The average house price in {place_str} was {_fmt_price(avg)} in {stats_year}"
    if earliest is not None and earliest < stats_year:
        e_avg = all_types(earliest)["avg"]
        pct = round((avg - e_avg) / e_avg * 100)
        direction = f"up {pct}" if pct >= 0 else f"down {abs(pct)}"
        summary += f", {direction}% from {_fmt_price(e_avg)} in {earliest}"
    summary += "."
    peak_year = max(
        (y for y in complete_years if all_types(y).get("avg")),
        key=lambda y: all_types(y)["avg"],
    )
    if peak_year != stats_year:
        peak_avg = all_types(peak_year)["avg"]
        summary += f" Prices peaked at {_fmt_price(peak_avg)} in {peak_year}."

    # Trend paragraph: ten-year change, median, lifetime transaction count
    trend_parts = []
    decade_ago = stats_year - 10
    d = all_types(decade_ago)
    if d.get("avg"):
        pct10 = round((avg - d["avg"]) / d["avg"] * 100)
        direction = f"risen {pct10}" if pct10 >= 0 else f"fallen {abs(pct10)}"
        trend_parts.append(
            f"Over the last ten years, average prices have {direction}% "
            f"(from {_fmt_price(d['avg'])} in {decade_ago})"
        )
    if a.get("median"):
        trend_parts.append(
            f"The median sale price in {stats_year} was {_fmt_price(a['median'])} "
            f"across {a.get('count', 0):,} sales"
        )
    total_transactions = sum(all_types(y).get("count", 0) for y in years)
    trend_parts.append(
        f"{total_transactions:,} transactions have been recorded in {code} "
        f"since {years[0]}"
    )
    trend = ". ".join(trend_parts) + "."

    # Partial-year note, so current-year figures are never presented as complete
    ytd_note = None
    if latest_year == current_year:
        ya = all_types(current_year)
        if ya.get("count"):
            ytd_note = (
                f"So far in {current_year}, {ya['count']:,} sales have been recorded "
                f"at an average price of {_fmt_price(ya['avg'])} (year to date)."
            )

    # Per-type stats table for the latest complete year
    year_data = data.get(str(stats_year), {})
    stats_rows = []
    for key, label in _TYPE_LABELS:
        t = year_data.get(key)
        stats_rows.append({
            "label": label,
            "avg": _fmt_price(t["avg"]) if t and t.get("avg") else "—",
            "median": _fmt_price(t["median"]) if t and t.get("median") else "—",
            "count": f"{t['count']:,}" if t and t.get("count") else "—",
        })

    # Geographically adjacent districts (shared boundary), for internal links
    names = _load_district_names()
    neighbour_items = [
        {"code": n, "label": f"{names[n]} – {n}" if names.get(n) else n}
        for n in _neighbours().get(code, [])
    ]

    return {
        "summary": summary,
        "trend": trend,
        "ytd_note": ytd_note,
        "stats_year": stats_year,
        "stats_rows": stats_rows,
        "neighbour_items": neighbour_items,
    }


# ── Area page (SSR) ─────────────────────────────────────────────────────────

@router.get("/area/{code}", response_class=HTMLResponse)
def area_page(request: Request, code: str):
    # Sync endpoint: runs in the threadpool so DB queries don't block the event loop
    code = code.upper()
    if not _POSTCODE_RE.match(code):
        raise HTTPException(status_code=404)

    specific = _district_name(code)
    area = _area_name(code)
    place = specific or area

    # Build label: "St Albans - AL1" or "AL1 (St Albans)" or just "AL1"
    if specific:
        label = f"{specific} - {code}"
    elif area:
        label = f"{code} ({area})"
    else:
        label = code

    title = f"{label} House Prices | House Price Dashboard"

    max_year = data_max_year()
    subject = f"{place} ({code})" if place else code
    description = (
        f"{subject} house prices from 1995 to {max_year}. "
        f"Explore average and median prices, transaction volumes and "
        f"price trends for the {code} postcode district."
    )

    content = _ssr_content(code, place)
    if content is None:
        raise HTTPException(status_code=404)

    canonical = f"https://housepricedashboard.co.uk/area/{code}"

    return templates.TemplateResponse(request, "area-page.html", {
        "title": title,
        "label": label,
        "description": description,
        "canonical": canonical,
        "og_title": title,
        "og_description": description,
        "robots": "index, follow",
        **content,
        "has_data": True,
        "subtitle": "Postcode area price history",
        "posthog": True,
    }, headers={"Cache-Control": "public, max-age=3600, s-maxage=86400"})
