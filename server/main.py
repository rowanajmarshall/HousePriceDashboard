"""
FastAPI application entry point.

Start with:
    uvicorn server.main:app --reload --port 8000

Static files are served from /public (same as before).
API routes are mounted under /api/.
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from .analytics import posthog_client
from .chat import router as chat_router
from .data import router as data_router
from .pages import router as pages_router

ROOT = Path(__file__).parent.parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    if posthog_client:
        posthog_client.flush()


app = FastAPI(title="House Price Dashboard API", lifespan=lifespan)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(data_router)
app.include_router(pages_router)


@app.middleware("http")
async def cache_control(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/chat"):
        # SSE stream — must never be cached
        response.headers["Cache-Control"] = "no-store"
    elif path.startswith("/api/"):
        # Data API: short CDN cache, revalidate frequently
        response.headers.setdefault("Cache-Control", "public, max-age=60, s-maxage=300")
    else:
        # Static files: always revalidate
        response.headers.setdefault("Cache-Control", "no-cache")
    return response


@app.get("/api/")
async def api_root():
    return {"status": "ok", "service": "house-price-dashboard"}


# Serve static frontend files last (catch-all)
_public = ROOT / "public"
if _public.exists():
    app.mount("/", StaticFiles(directory=str(_public), html=True), name="static")
