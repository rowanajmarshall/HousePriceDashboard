download-data:
	cd scripts && uv run python download_data.py

download-boundaries:
	cd scripts && uv run python download_boundaries.py

simplify-boundaries:
	cd scripts && uv run python simplify_boundaries.py

build-neighbours:
	cd scripts && uv run python build_neighbours.py

build-boundaries: download-boundaries simplify-boundaries build-neighbours

build-db:
	uv run python scripts/build_duckdb.py

build-sitemap:
	uv run python scripts/build_sitemap.py

update-data: download-data build-db build-sitemap

prod-upload-data:
	./internal/prod-upload-data.sh

test-upload-data:
	./internal/test-upload-data.sh

serve:
	uv run uvicorn server.main:app --reload --port 8000
