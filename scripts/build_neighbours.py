#!/usr/bin/env python3
"""
Build district adjacency data from the simplified boundaries.

Because simplify_boundaries.py uses mapshaper (shared-arc topology),
adjacent districts share identical vertex coordinates along their common
border. Two districts are neighbours if they share at least MIN_SHARED
vertices; more shared vertices = longer shared border, used for ranking.

Output feeds the "Nearby districts" section on SSR area pages.

Usage:
    uv run python build_neighbours.py
"""

import json
from collections import Counter, defaultdict

INPUT_FILE = "../public/data/boundaries.geojson"
OUTPUT_FILE = "../public/data/neighbours.json"

# Vertices two districts must share to count as adjacent. 2+ filters out
# districts that merely touch at a single corner point.
MIN_SHARED = 2

MAX_NEIGHBOURS = 8


def iter_vertices(coords):
    if isinstance(coords[0], (int, float)):
        yield tuple(coords)
    else:
        for c in coords:
            yield from iter_vertices(c)


def main():
    with open(INPUT_FILE) as f:
        features = json.load(f)["features"]

    print(f"Districts: {len(features)}")

    vertex_owners = defaultdict(set)
    for feat in features:
        code = feat["properties"]["id"]
        for v in iter_vertices(feat["geometry"]["coordinates"]):
            vertex_owners[v].add(code)

    shared = defaultdict(Counter)
    for owners in vertex_owners.values():
        if len(owners) < 2:
            continue
        owners = sorted(owners)
        for i, a in enumerate(owners):
            for b in owners[i + 1:]:
                shared[a][b] += 1
                shared[b][a] += 1

    neighbours = {}
    for feat in features:
        code = feat["properties"]["id"]
        ranked = [
            other for other, n in shared[code].most_common(MAX_NEIGHBOURS)
            if n >= MIN_SHARED
        ]
        neighbours[code] = ranked

    isolated = sum(1 for v in neighbours.values() if not v)
    counts = [len(v) for v in neighbours.values()]
    print(f"Isolated districts (no neighbours): {isolated}")
    print(f"Avg neighbours: {sum(counts) / len(counts):.1f}")

    with open(OUTPUT_FILE, "w") as f:
        json.dump(neighbours, f, separators=(",", ":"), sort_keys=True)
    print(f"Wrote {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
