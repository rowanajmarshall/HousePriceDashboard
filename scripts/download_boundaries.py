#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = [
#     "requests>=2.28.0",
# ]
# ///
"""
Download UK Postcode District Boundaries from GitHub

Downloads GeoJSON boundaries for all UK postcode areas and combines them
into a single file for use in the house price heatmap.

Source: https://github.com/missinglink/uk-postcode-polygons
License: Data derived from Wikipedia/OpenStreetMap

Usage:
    uv run download_boundaries.py
"""

import os
import json
import requests
from time import sleep

# All UK postcode areas
POSTCODE_AREAS = [
    # England
    'AL', 'B', 'BA', 'BB', 'BD', 'BH', 'BL', 'BN', 'BR', 'BS',
    'CA', 'CB', 'CF', 'CH', 'CM', 'CO', 'CR', 'CT', 'CV', 'CW',
    'DA', 'DE', 'DH', 'DL', 'DN', 'DT', 'DY',
    'E', 'EC', 'EN', 'EX',
    'FY',
    'GL', 'GU',
    'HA', 'HD', 'HG', 'HP', 'HR', 'HS', 'HU', 'HX',
    'IG', 'IP',
    'KT',
    'L', 'LA', 'LE', 'LN', 'LS', 'LU',
    'M', 'ME', 'MK',
    'N', 'NE', 'NG', 'NN', 'NP', 'NR', 'NW',
    'OL', 'OX',
    'PE', 'PL', 'PO', 'PR',
    'RG', 'RH', 'RM',
    'S', 'SE', 'SG', 'SK', 'SL', 'SM', 'SN', 'SO', 'SP', 'SR', 'SS', 'ST', 'SW', 'SY',
    'TA', 'TF', 'TN', 'TQ', 'TR', 'TS', 'TW',
    'UB',
    'W', 'WA', 'WC', 'WD', 'WF', 'WN', 'WR', 'WS', 'WV',
    'YO',
    # Wales
    'CF', 'LD', 'LL', 'NP', 'SA', 'SY',
    # Scotland
    'AB', 'DD', 'DG', 'EH', 'FK', 'G', 'HS', 'IV', 'KA', 'KW', 'KY',
    'ML', 'PA', 'PH', 'TD', 'ZE',
    # Northern Ireland
    'BT',
]

# Remove duplicates
POSTCODE_AREAS = sorted(set(POSTCODE_AREAS))

BASE_URL = "https://raw.githubusercontent.com/missinglink/uk-postcode-polygons/master/geojson/{}.geojson"
OUTPUT_FILE = "../data/boundaries.geojson"


def download_area(area_code):
    """Download GeoJSON for a single postcode area."""
    url = BASE_URL.format(area_code)
    try:
        response = requests.get(url, timeout=30)
        if response.status_code == 200:
            return response.json()
        else:
            print(f"  Warning: {area_code} returned status {response.status_code}")
            return None
    except Exception as e:
        print(f"  Error downloading {area_code}: {e}")
        return None


def normalize_district_id(name):
    """Convert district name to ID format."""
    return name.replace(' ', '').upper()


def main():
    print("Downloading UK postcode district boundaries...")
    print(f"Source: https://github.com/missinglink/uk-postcode-polygons")
    print(f"Areas to download: {len(POSTCODE_AREAS)}")
    print()

    all_features = []
    successful = 0
    failed = 0

    for i, area in enumerate(POSTCODE_AREAS):
        print(f"[{i+1}/{len(POSTCODE_AREAS)}] Downloading {area}...", end=" ")

        data = download_area(area)

        if data and 'features' in data:
            # Process each district in this area
            for feature in data['features']:
                name = feature.get('properties', {}).get('name', '')
                if name:
                    # Normalize the ID
                    district_id = normalize_district_id(name)

                    # Create clean feature
                    clean_feature = {
                        'type': 'Feature',
                        'properties': {
                            'id': district_id,
                            'sector_code': name  # Keep original format for display
                        },
                        'geometry': feature['geometry']
                    }
                    all_features.append(clean_feature)

            print(f"OK ({len(data['features'])} districts)")
            successful += 1
        else:
            print("FAILED")
            failed += 1

        # Be nice to GitHub
        sleep(0.1)

    print()
    print(f"Download complete: {successful} areas successful, {failed} failed")
    print(f"Total districts: {len(all_features)}")

    # Create combined GeoJSON
    combined = {
        'type': 'FeatureCollection',
        'features': all_features
    }

    # Ensure output directory exists
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    # Write output
    print(f"\nWriting to: {OUTPUT_FILE}")
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(combined, f, separators=(',', ':'))

    size_mb = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
    print(f"Output size: {size_mb:.2f} MB")
    print("\nDone!")


if __name__ == "__main__":
    main()
