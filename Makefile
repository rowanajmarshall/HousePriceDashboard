run:
	npx serve public

download-data:
	cd scripts && uv run python download_data.py

build-db:
	uv run python scripts/build_duckdb.py

update-data: download-data build-db

serve:
	uv run uvicorn server.main:app --reload --port 8000
