#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = [
#     "geopandas>=0.14.0",
#     "shapely>=2.0.0",
# ]
# ///
"""
Process Postcode Sector Boundaries

Converts postcode sector boundary data to GeoJSON format for use in the web application.

You'll need to download boundary data from one of these sources:
- ONS Open Geography Portal: https://geoportal.statistics.gov.uk/
- OS OpenData: https://www.ordnancesurvey.co.uk/business-government/products/open-map-data

This script expects a shapefile or GeoJSON with postcode sector boundaries.

Usage:
    uv run process_boundaries.py
    uv run process_boundaries.py --sample
"""

import os
import json

try:
    import geopandas as gpd
    from shapely.geometry import mapping
    HAS_GEOPANDAS = True
except ImportError:
    HAS_GEOPANDAS = False
    print("Warning: geopandas not installed. Run with: uv run process_boundaries.py")

# Configuration
INPUT_FILE = "raw_data/postcode_sectors.shp"  # Or .geojson
OUTPUT_FILE = "../data/boundaries.geojson"

# Coordinate precision (decimal places)
COORD_PRECISION = 5


def simplify_coordinates(coords, precision=COORD_PRECISION):
    """Round coordinates to reduce file size."""
    if isinstance(coords[0], (list, tuple)):
        return [simplify_coordinates(c, precision) for c in coords]
    else:
        return round(coords, precision)


def normalize_sector_id(sector_code):
    """
    Convert sector code to ID format.

    'SW1A 1' -> 'SW1A1'
    """
    if not sector_code:
        return None
    return str(sector_code).replace(' ', '').upper()


def process_boundaries():
    """Process boundary file and output simplified GeoJSON."""
    if not HAS_GEOPANDAS:
        print("Error: geopandas is required for this script.")
        print("Install with: pip install geopandas shapely")
        return

    print(f"Reading boundaries from: {INPUT_FILE}")

    if not os.path.exists(INPUT_FILE):
        print(f"Error: File not found: {INPUT_FILE}")
        print("\nPlease download postcode sector boundaries from:")
        print("  - ONS: https://geoportal.statistics.gov.uk/")
        print("  - OS OpenData: https://www.ordnancesurvey.co.uk/business-government/products/open-map-data")
        print(f"\nSave the file as: {INPUT_FILE}")
        return

    # Read the shapefile or GeoJSON
    gdf = gpd.read_file(INPUT_FILE)

    print(f"Loaded {len(gdf)} features")
    print(f"Columns: {list(gdf.columns)}")

    # Ensure CRS is WGS84 (EPSG:4326) for Leaflet
    if gdf.crs and gdf.crs.to_epsg() != 4326:
        print(f"Converting from {gdf.crs} to EPSG:4326...")
        gdf = gdf.to_crs(epsg=4326)

    # Simplify geometries to reduce file size
    # Tolerance in degrees (~100m at UK latitudes)
    tolerance = 0.0005
    print(f"Simplifying geometries (tolerance: {tolerance})...")
    gdf['geometry'] = gdf['geometry'].simplify(tolerance, preserve_topology=True)

    # Build GeoJSON features
    features = []

    # Try to identify the sector code column
    sector_columns = ['pcd_sector', 'postcode_sector', 'sector', 'pcds', 'pcd']
    sector_col = None

    for col in sector_columns:
        if col in gdf.columns:
            sector_col = col
            break

    if not sector_col:
        print(f"Warning: Could not identify sector column. Available: {list(gdf.columns)}")
        print("Using first column as sector code.")
        sector_col = gdf.columns[0]

    print(f"Using column '{sector_col}' for sector codes")

    for idx, row in gdf.iterrows():
        sector_code = str(row[sector_col]).strip()
        sector_id = normalize_sector_id(sector_code)

        if not sector_id:
            continue

        # Get geometry as GeoJSON
        geom = mapping(row['geometry'])

        # Simplify coordinates
        if geom['type'] == 'Polygon':
            geom['coordinates'] = simplify_coordinates(geom['coordinates'])
        elif geom['type'] == 'MultiPolygon':
            geom['coordinates'] = simplify_coordinates(geom['coordinates'])

        feature = {
            'type': 'Feature',
            'properties': {
                'id': sector_id,
                'sector_code': sector_code
            },
            'geometry': geom
        }

        features.append(feature)

    # Create FeatureCollection
    geojson = {
        'type': 'FeatureCollection',
        'features': features
    }

    # Ensure output directory exists
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    # Write output
    print(f"\nWriting to: {OUTPUT_FILE}")
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(geojson, f, separators=(',', ':'))

    # Report file size
    size_mb = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
    print(f"Output size: {size_mb:.2f} MB")
    print(f"Features: {len(features)}")
    print("\nDone!")


def create_sample_boundaries():
    """
    Create sample boundary data for testing without real data.
    This generates simplified boundaries for major UK cities.
    """
    print("Creating sample boundaries for testing...")

    # Sample postcode sectors with approximate polygon coordinates
    # These are simplified rectangles for demonstration
    samples = [
        {"id": "SW1A1", "code": "SW1A 1", "coords": [[[-0.145, 51.502], [-0.135, 51.502], [-0.135, 51.507], [-0.145, 51.507], [-0.145, 51.502]]]},
        {"id": "SW1A2", "code": "SW1A 2", "coords": [[[-0.135, 51.502], [-0.125, 51.502], [-0.125, 51.507], [-0.135, 51.507], [-0.135, 51.502]]]},
        {"id": "EC1A1", "code": "EC1A 1", "coords": [[[-0.105, 51.517], [-0.090, 51.517], [-0.090, 51.525], [-0.105, 51.525], [-0.105, 51.517]]]},
        {"id": "M11", "code": "M1 1", "coords": [[[-2.250, 53.475], [-2.230, 53.475], [-2.230, 53.485], [-2.250, 53.485], [-2.250, 53.475]]]},
        {"id": "B11", "code": "B1 1", "coords": [[[-1.910, 52.475], [-1.890, 52.475], [-1.890, 52.485], [-1.910, 52.485], [-1.910, 52.475]]]},
        {"id": "G11", "code": "G1 1", "coords": [[[-4.265, 55.855], [-4.245, 55.855], [-4.245, 55.865], [-4.265, 55.865], [-4.265, 55.855]]]},
        {"id": "EH11", "code": "EH1 1", "coords": [[[-3.200, 55.945], [-3.180, 55.945], [-3.180, 55.955], [-3.200, 55.955], [-3.200, 55.945]]]},
    ]

    features = []
    for sample in samples:
        feature = {
            "type": "Feature",
            "properties": {
                "id": sample["id"],
                "sector_code": sample["code"]
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": sample["coords"]
            }
        }
        features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "features": features
    }

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(geojson, f, indent=2)

    print(f"Created sample file: {OUTPUT_FILE}")
    print(f"Features: {len(features)}")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == '--sample':
        create_sample_boundaries()
    else:
        process_boundaries()
