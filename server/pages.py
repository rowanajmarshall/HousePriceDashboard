"""
Server-side rendering for pages that need dynamic meta tags.

GET /area/{code} — injects SEO meta tags for postcode district pages,
replicating what the Cloudflare Worker previously did via HTMLRewriter.
"""

import re
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from .database import get_connection

router = APIRouter()

ROOT = Path(__file__).parent.parent
_AREA_PAGE = ROOT / "public" / "area-page.html"

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


def _district_name(code: str) -> str | None:
    con = get_connection()
    row = con.execute(
        "SELECT name FROM district_names WHERE district = ?", [code]
    ).fetchone()
    return row[0] if row else None


def _inject_meta(html: str, code: str) -> str:
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

    return html


@router.get("/area/{code}", response_class=HTMLResponse)
async def area_page(code: str):
    code = code.upper()
    html = _inject_meta(_html_template(), code)
    return HTMLResponse(content=html)
