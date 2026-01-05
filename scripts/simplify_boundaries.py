#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = [
#     "shapely>=2.0.0",
# ]
# ///
"""
Simplify boundary geometries to reduce file size.

Uses the Douglas-Peucker algorithm to reduce coordinate complexity
while maintaining visual quality at typical map zoom levels.

Usage:
    uv run simplify_boundaries.py
"""

import json
import os
from shapely.geometry import shape, mapping
from shapely.validation import make_valid

INPUT_FILE = "../public/data/boundaries.geojson"
OUTPUT_FILE = "../public/data/boundaries.geojson"
BACKUP_FILE = "../public/data/boundaries_original.geojson"

# Tolerance in degrees - higher = more simplification
# 0.0005 degrees ≈ 50 meters at UK latitudes
# Good balance between size reduction and visual quality
TOLERANCE = 0.0005


def simplify_geometry(geom_dict, tolerance):
    """Simplify a GeoJSON geometry using Douglas-Peucker algorithm."""
    try:
        geom = shape(geom_dict)

        # Fix any invalid geometries first
        if not geom.is_valid:
            geom = make_valid(geom)

        # Simplify with topology preservation
        simplified = geom.simplify(tolerance, preserve_topology=True)

        # Ensure result is valid
        if not simplified.is_valid:
            simplified = make_valid(simplified)

        # Don't return empty geometries
        if simplified.is_empty:
            return geom_dict

        return mapping(simplified)
    except Exception as e:
        print(f"  Warning: Could not simplify geometry: {e}")
        return geom_dict


def count_coordinates(geom):
    """Count total coordinates in a geometry."""
    geom_type = geom.get('type', '')
    coords = geom.get('coordinates', [])

    if geom_type == 'Point':
        return 1
    elif geom_type == 'LineString':
        return len(coords)
    elif geom_type == 'Polygon':
        return sum(len(ring) for ring in coords)
    elif geom_type == 'MultiPolygon':
        return sum(
            sum(len(ring) for ring in polygon)
            for polygon in coords
        )
    elif geom_type == 'MultiLineString':
        return sum(len(line) for line in coords)
    elif geom_type == 'GeometryCollection':
        return sum(count_coordinates(g) for g in geom.get('geometries', []))
    return 0


def main():
    print("Simplifying boundary geometries...")
    print(f"Input: {INPUT_FILE}")
    print(f"Tolerance: {TOLERANCE} degrees (~{TOLERANCE * 111000:.0f}m)")
    print()

    # Check input exists
    if not os.path.exists(INPUT_FILE):
        print(f"Error: Input file not found: {INPUT_FILE}")
        return

    # Get original size
    original_size = os.path.getsize(INPUT_FILE)
    print(f"Original size: {original_size / (1024*1024):.2f} MB")

    # Load data
    print("Loading boundaries...")
    with open(INPUT_FILE, 'r') as f:
        data = json.load(f)

    features = data.get('features', [])
    print(f"Features to process: {len(features)}")

    # Count original coordinates
    original_coords = sum(count_coordinates(f.get('geometry', {})) for f in features)
    print(f"Original coordinates: {original_coords:,}")
    print()

    # Backup original file
    print(f"Creating backup: {BACKUP_FILE}")
    with open(BACKUP_FILE, 'w') as f:
        json.dump(data, f, separators=(',', ':'))

    # Simplify each feature
    print("Simplifying geometries...")
    simplified_features = []

    for i, feature in enumerate(features):
        if (i + 1) % 500 == 0:
            print(f"  Processed {i + 1}/{len(features)}...")

        geometry = feature.get('geometry')
        if geometry:
            simplified_geom = simplify_geometry(geometry, TOLERANCE)
            feature['geometry'] = simplified_geom

        simplified_features.append(feature)

    # Update data
    data['features'] = simplified_features

    # Count new coordinates
    new_coords = sum(count_coordinates(f.get('geometry', {})) for f in simplified_features)
    coord_reduction = (1 - new_coords / original_coords) * 100 if original_coords else 0

    print()
    print(f"New coordinates: {new_coords:,} ({coord_reduction:.1f}% reduction)")

    # Write output
    print(f"Writing: {OUTPUT_FILE}")
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(data, f, separators=(',', ':'))

    # Get new size
    new_size = os.path.getsize(OUTPUT_FILE)
    size_reduction = (1 - new_size / original_size) * 100

    print()
    print("Results:")
    print(f"  Original: {original_size / (1024*1024):.2f} MB")
    print(f"  Simplified: {new_size / (1024*1024):.2f} MB")
    print(f"  Reduction: {size_reduction:.1f}%")
    print(f"  Backup saved to: {BACKUP_FILE}")
    print()
    print("Done!")


if __name__ == "__main__":
    main()
