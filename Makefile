run:
	npx serve public

build-db:
	uv run python scripts/build_duckdb.py

serve:
	uv run uvicorn server.main:app --reload --port 8000
