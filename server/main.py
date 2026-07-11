"""
FastAPI application entry point.

Start with:
    uvicorn server.main:app --reload --port 8000

Static files are served from /public (same as before).
API routes are mounted under /api/.
"""

import asyncio
import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .admin import router as admin_router
from .analytics import posthog_client
from .data import router as data_router
from .pages import router as pages_router
from .templating import templates
from .updater import check_and_update

def _configure_logging() -> None:
    from uvicorn.logging import DefaultFormatter

    # stdout, not the default stderr — Railway marks all stderr lines as errors
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        DefaultFormatter(
            fmt="%(asctime)s %(levelprefix)s %(name)s: %(message)s",
            use_colors=True,
        )
    )
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)

    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers.clear()
        lg.propagate = True


_configure_logging()
logger = logging.getLogger(__name__)

ROOT = Path(__file__).parent.parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fire-and-forget S3 update check (doesn't block startup)
    update_task = asyncio.create_task(_startup_update_check())
    yield
    update_task.cancel()
    try:
        await update_task
    except asyncio.CancelledError:
        pass
    if posthog_client:
        posthog_client.flush()


async def _startup_update_check():
    logger.info("Starting startup DuckDB update check")
    try:
        result = await check_and_update()
        logger.info("Startup DuckDB update check result: %s", result)
    except Exception:
        logger.exception("Startup update check failed")


app = FastAPI(title="House Price Dashboard API", lifespan=lifespan)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(data_router)
app.include_router(admin_router)
app.include_router(pages_router)


@app.middleware("http")
async def cache_control(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/"):
        # Data API: short CDN cache, revalidate frequently
        response.headers.setdefault("Cache-Control", "public, max-age=60, s-maxage=300")
    else:
        # Static files: always revalidate
        response.headers.setdefault("Cache-Control", "no-cache")
    return response


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # Styled 404 page for site URLs; APIs keep JSON errors
    if exc.status_code == 404 and not request.url.path.startswith("/api/"):
        return templates.TemplateResponse(request, "404.html", {
            "subtitle": "Page not found",
        }, status_code=404)
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)


@app.get("/api/")
async def api_root():
    return {"status": "ok", "service": "house-price-dashboard"}


# Serve static frontend files last (catch-all)
_public = ROOT / "public"
if _public.exists():
    app.mount("/", StaticFiles(directory=str(_public), html=True), name="static")
