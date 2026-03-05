"""
FastAPI application entry point.

Start with:
    uvicorn server.main:app --reload --port 8000

Static files are served from /public (same as before).
API routes are mounted under /api/.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .chat import router as chat_router
from .data import router as data_router
from .pages import router as pages_router

ROOT = Path(__file__).parent.parent

app = FastAPI(title="House Price Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(data_router)
app.include_router(pages_router)


@app.get("/api/")
async def api_root():
    return {"status": "ok", "service": "house-price-dashboard"}


# Serve static frontend files last (catch-all)
_public = ROOT / "public"
if _public.exists():
    app.mount("/", StaticFiles(directory=str(_public), html=True), name="static")
