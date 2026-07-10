#!/usr/bin/env python3
"""
Simplify boundary geometries to reduce file size.

Uses mapshaper (via npx) for topology-aware simplification: shared borders
between adjacent districts are stored once and simplified once, so
neighbouring polygons stay perfectly snapped together. Simplifying each
polygon independently (e.g. with shapely's simplify()) produces sliver
gaps and overlaps along shared borders — do not go back to that.

Requires: node/npx (mapshaper is fetched automatically).

Usage:
    uv run python simplify_boundaries.py

Run download_boundaries.py first to produce the raw input file.
"""

import json
import os
import subprocess
import sys

INPUT_FILE = "raw_data/boundaries_raw.geojson"
OUTPUT_FILE = "../public/data/boundaries.geojson"

# Fraction of removable vertices to keep. keep-shapes prevents small
# districts from collapsing to nothing at high simplification.
# 50% keeps borders looking natural; 15% was visibly over-processed.
SIMPLIFY_PERCENT = "50%"

# Decimal places to keep in output coordinates (~1m at 5 places).
COORD_PRECISION = "0.00001"


def count_coordinates(geojson_path):
    """Count total coordinates across all features."""
    with open(geojson_path) as f:
        data = json.load(f)

    def count(coords):
        if not coords:
            return 0
        if isinstance(coords[0], (int, float)):
            return 1
        return sum(count(c) for c in coords)

    return sum(
        count(f.get('geometry', {}).get('coordinates', []))
        for f in data.get('features', [])
    )


def main():
    if not os.path.exists(INPUT_FILE):
        print(f"Error: Input file not found: {INPUT_FILE}")
        print("Run download_boundaries.py first.")
        sys.exit(1)

    original_size = os.path.getsize(INPUT_FILE)
    print(f"Input: {INPUT_FILE} ({original_size / (1024*1024):.2f} MB)")
    print(f"Simplification: {SIMPLIFY_PERCENT} (topology-aware, keep-shapes)")

    cmd = [
        "npx", "-y", "mapshaper",
        INPUT_FILE,
        "-simplify", SIMPLIFY_PERCENT, "keep-shapes",
        "-o", OUTPUT_FILE, f"precision={COORD_PRECISION}", "force",
    ]
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd)
    if result.returncode != 0:
        print("Error: mapshaper failed")
        sys.exit(1)

    new_size = os.path.getsize(OUTPUT_FILE)
    original_coords = count_coordinates(INPUT_FILE)
    new_coords = count_coordinates(OUTPUT_FILE)

    print()
    print("Results:")
    print(f"  Size: {original_size / (1024*1024):.2f} MB -> {new_size / (1024*1024):.2f} MB")
    print(f"  Coordinates: {original_coords:,} -> {new_coords:,} "
          f"({(1 - new_coords / original_coords) * 100:.1f}% reduction)")
    print(f"  Output: {OUTPUT_FILE}")
    print("Done!")


if __name__ == "__main__":
    main()
