"""Jinja2 template engine — shared instance for all page routes."""

from datetime import date
from pathlib import Path

from fastapi.templating import Jinja2Templates


def _global_context(request) -> dict:
    """Make the latest data year available to every template."""
    from .data import data_max_year

    try:
        max_year = data_max_year()
    except Exception:
        max_year = date.today().year
    return {"data_max_year": max_year}


templates = Jinja2Templates(
    directory=str(Path(__file__).parent / "templates"),
    context_processors=[_global_context],
)
