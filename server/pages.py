"""
Server-side rendering for all HTML pages using Jinja2 templates.

Templates live in server/templates/ and extend base.html for shared
header, nav, share button, footer, and analytics.
"""

import json
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse

from .data import _load_district, data_max_year
from .database import execute_raw
from .templating import templates

_POSTCODE_RE = re.compile(r"^[A-Z]{1,2}\d{1,2}[A-Z]?$")

router = APIRouter()

ROOT = Path(__file__).parent.parent


# ── Static page routes ──────────────────────────────────────────────────────

@router.get("/", response_class=HTMLResponse)
async def index_page(request: Request):
    return templates.TemplateResponse(request, "index.html", {
        "active_nav": "map",
        "subtitle": "Explore 30+ years of property prices across England & Wales",
        "show_search": True,
        "posthog": True,
        "og_title": "House Price Dashboard",
        "og_description": "Explore 30+ years of property prices across England & Wales",
    })


@router.get("/contact.html", response_class=HTMLResponse)
async def contact_page(request: Request):
    return templates.TemplateResponse(request, "contact.html", {
        "active_nav": "contact",
        "subtitle": "Get in touch",
        "og_title": "Contact - House Price Dashboard",
        "og_description": "Get in touch with House Price Dashboard",
    })


@router.get("/attribution.html", response_class=HTMLResponse)
async def attribution_page(request: Request):
    return templates.TemplateResponse(request, "attribution.html", {
        "active_nav": "attributions",
        "subtitle": "Data Attribution & Licenses",
        "og_title": "Attribution - House Price Dashboard",
        "og_description": "Data sources and licenses for House Price Dashboard",
    })


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


def _ssr_summary(code: str, place: str | None) -> str | None:
    """Query the DB for district stats and return a pre-rendered summary sentence.

    Returns None if the district has no data (signals a 404).
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
    latest_all = data[str(latest_year)].get("A", {})
    total_transactions = sum(
        data[str(y)].get("A", {}).get("count", 0) for y in years
    )

    place_str = f"{place} ({code})" if place else code
    avg_price = latest_all.get("avg")

    parts = [f"{place_str} house prices cover {years[0]}–{latest_year}"]
    if avg_price:
        parts.append(f"average sale price of £{avg_price:,} in {latest_year}")
    if total_transactions:
        parts.append(f"{total_transactions:,} recorded transactions")

    return ", ".join(parts) + "."


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

    summary = _ssr_summary(code, place)
    if summary is None:
        raise HTTPException(status_code=404)

    canonical = f"https://housepricedashboard.co.uk/area/{code}"

    return templates.TemplateResponse(request, "area-page.html", {
        "title": title,
        "description": description,
        "canonical": canonical,
        "og_title": title,
        "og_description": description,
        "robots": "index, follow",
        "summary": summary,
        "has_data": True,
        "subtitle": "Postcode area price history",
        "posthog": True,
    }, headers={"Cache-Control": "public, max-age=3600, s-maxage=86400"})
