"""
Server-side rendering for pages that need dynamic meta tags.

GET /area/{code} — injects SEO meta tags for postcode district pages,
replicating what the Cloudflare Worker previously did via HTMLRewriter.
"""

import json
import re
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from .cache import register_cache
from .database import execute_raw
from .data import _load_district

_POSTCODE_RE = re.compile(r"^[A-Z]{1,2}\d{1,2}[A-Z]?$")

router = APIRouter()

ROOT = Path(__file__).parent.parent
_AREA_PAGE = ROOT / "public" / "area-page.html"


@lru_cache(maxsize=None)
def _static(name: str) -> HTMLResponse:
    content = (ROOT / "public" / f"{name}.html").read_text()
    return HTMLResponse(
        content=content,
        headers={"Cache-Control": "public, max-age=300, s-maxage=86400"},
    )

register_cache(_static)


@router.get("/compare", response_class=HTMLResponse)
async def compare_page():
    return _static("compare")


@router.get("/embed", response_class=HTMLResponse)
async def embed_page():
    return _static("embed")


@router.get("/browse", response_class=HTMLResponse)
async def browse_page():
    return _static("browse")

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


@lru_cache(maxsize=None)
def _html_template() -> str:
    return _AREA_PAGE.read_text()

register_cache(_html_template)


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


def _inject_meta(html: str, code: str) -> tuple[str, bool]:
    """Inject SEO meta tags and SSR content.

    Returns (html, has_data). has_data is False when the district has no
    transactions — the caller should 404 in that case.
    """
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

    title = f"{label} House Prices | UK House Price Heatmap"

    if place:
        description = (
            f"{place} ({code}) house prices from 1995 to 2025. "
            f"Explore average and median prices, transaction volumes and "
            f"price trends for the {code} postcode district."
        )
    else:
        description = (
            f"{code} house prices from 1995 to 2025. "
            f"Explore average and median prices, transaction volumes and "
            f"price trends for the {code} postcode district."
        )

    canonical = f"https://housepricedashboard.co.uk/area/{code}"

    html = re.sub(r"<title>[^<]*</title>", f"<title>{title}</title>", html)
    html = re.sub(
        r'(<meta\s+name="description"\s+content=")[^"]*(")',
        rf'\g<1>{description}\2',
        html,
    )
    html = re.sub(
        r'(<meta\s+property="og:title"\s+content=")[^"]*(")',
        rf'\g<1>{title}\2',
        html,
    )
    html = re.sub(
        r'(<meta\s+property="og:description"\s+content=")[^"]*(")',
        rf'\g<1>{description}\2',
        html,
    )
    html = re.sub(
        r'(<meta\s+name="twitter:title"\s+content=")[^"]*(")',
        rf'\g<1>{title}\2',
        html,
    )
    html = re.sub(
        r'(<meta\s+name="twitter:description"\s+content=")[^"]*(")',
        rf'\g<1>{description}\2',
        html,
    )
    html = html.replace(
        '<base href="/">',
        f'<base href="/">\n    <link rel="canonical" href="{canonical}">',
        1,
    )
    html = re.sub(
        r'(<meta\s+name="robots"\s+content=")[^"]*(")',
        r'\g<1>index, follow\2',
        html,
    )

    # SSR: pre-populate visible content so crawlers see real data without JS.
    summary = _ssr_summary(code, place)
    if summary:
        html = html.replace(
            '<p class="area-summary" id="area-summary"></p>',
            f'<p class="area-summary" id="area-summary">{summary}</p>',
        )
        # Show content immediately; JS will update it once data loads.
        html = html.replace(
            '<div id="area-content" style="display: none;">',
            '<div id="area-content">',
        )
        html = html.replace(
            '<div class="area-loading" id="area-loading">',
            '<div class="area-loading" id="area-loading" style="display: none;">',
        )

    return html, summary is not None


@router.get("/area/{code}", response_class=HTMLResponse)
async def area_page(code: str):
    code = code.upper()
    if not _POSTCODE_RE.match(code):
        raise HTTPException(status_code=404)
    html, has_data = _inject_meta(_html_template(), code)
    if not has_data:
        raise HTTPException(status_code=404)
    return HTMLResponse(
        content=html,
        headers={"Cache-Control": "public, max-age=3600, s-maxage=86400"},
    )
