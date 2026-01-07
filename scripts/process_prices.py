#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = [
#     "numpy>=1.24.0",
#     "pandas>=2.0.0",
#     "tqdm>=4.65.0",
# ]
# ///
"""
Process UK Land Registry Price Paid Data

Reads the raw CSV file and aggregates prices by:
- Postcode district
- Year
- Property type

Outputs JSON files for each year in the format expected by the web application.

Usage:
    uv run process_prices.py
"""

import os
import json
import numpy as np
import pandas as pd
from datetime import datetime
from tqdm import tqdm

# Configuration
INPUT_FILE = "raw_data/pp-complete.csv"
OUTPUT_DIR = "../public/data/prices"

# Land Registry CSV columns (no headers in file)
COLUMNS = [
    'transaction_id',
    'price',
    'date',
    'postcode',
    'property_type',
    'new_build',
    'estate_type',
    'saon',
    'paon',
    'street',
    'locality',
    'town',
    'district',
    'county',
    'ppd_category',
    'record_status'
]

# Property types we care about
VALID_PROPERTY_TYPES = {'D', 'S', 'T', 'F'}

# Code for combined "All" property types
ALL_PROPERTY_TYPE = 'A'


def extract_postcode_district(postcode):
    """
    Extract postcode district from full postcode.

    Examples:
        'SW1A 1AA' -> 'SW1A'
        'M1 1AA' -> 'M1'
        'EC1A 1BB' -> 'EC1A'

    Returns None if postcode is invalid.
    """
    if not postcode or not isinstance(postcode, str):
        return None

    postcode = postcode.strip().upper()
    parts = postcode.split()

    if len(parts) != 2:
        return None

    # Return just the outward code (district)
    return parts[0]


def normalize_district_id(district):
    """
    Convert district to ID format (already normalized, just ensure uppercase).

    'SW1A' -> 'SW1A'
    """
    if not district:
        return None
    return district.upper()


def process_data():
    """Process the Land Registry data and output JSON files."""
    print(f"Reading data from: {INPUT_FILE}")

    # Check if file exists
    if not os.path.exists(INPUT_FILE):
        print(f"Error: File not found: {INPUT_FILE}")
        print("Please run 'python download_data.py' first.")
        return

    # Read CSV in chunks to handle large file
    chunk_size = 500000
    chunks = pd.read_csv(
        INPUT_FILE,
        names=COLUMNS,
        dtype={
            'price': 'int64',
            'postcode': 'str',
            'property_type': 'str'
        },
        usecols=['price', 'date', 'postcode', 'property_type'],
        parse_dates=['date'],
        chunksize=chunk_size
    )

    # Store raw prices by sector, year, and property type
    # Structure: prices_by_type[year][district_id][prop_type] = [prices...]
    # Also store all prices for "All" type: all_prices[year][district_id] = [prices...]
    print("Processing data...")
    prices_by_type = {}
    all_prices = {}

    total_rows = 0
    valid_rows = 0

    for chunk in tqdm(chunks, desc="Processing chunks"):
        total_rows += len(chunk)

        # Filter valid property types
        chunk = chunk[chunk['property_type'].isin(VALID_PROPERTY_TYPES)]

        # Extract year
        chunk['year'] = chunk['date'].dt.year

        # Extract postcode district
        chunk['district'] = chunk['postcode'].apply(extract_postcode_district)
        chunk['district_id'] = chunk['district'].apply(normalize_district_id)

        # Drop rows with invalid districts
        chunk = chunk.dropna(subset=['district_id'])
        valid_rows += len(chunk)

        # Collect prices using groupby for efficiency
        for (district_id, year, prop_type), group in chunk.groupby(['district_id', 'year', 'property_type']):
            year = int(year)
            prices_list = group['price'].tolist()

            # Initialize nested dicts as needed
            if year not in prices_by_type:
                prices_by_type[year] = {}
                all_prices[year] = {}

            if district_id not in prices_by_type[year]:
                prices_by_type[year][district_id] = {}
                all_prices[year][district_id] = []

            if prop_type not in prices_by_type[year][district_id]:
                prices_by_type[year][district_id][prop_type] = []

            # Store the prices
            prices_by_type[year][district_id][prop_type].extend(prices_list)
            all_prices[year][district_id].extend(prices_list)

    print(f"\nProcessed {total_rows:,} total rows")
    print(f"Valid rows: {valid_rows:,}")
    print(f"Years covered: {min(prices_by_type.keys())} - {max(prices_by_type.keys())}")

    # Compute statistics from collected prices
    print("\nComputing statistics...")
    aggregated = {}

    for year in tqdm(prices_by_type, desc="Computing stats"):
        aggregated[year] = {}

        for district_id in prices_by_type[year]:
            aggregated[year][district_id] = {}

            # Stats for each property type
            for prop_type in prices_by_type[year][district_id]:
                prices = np.array(prices_by_type[year][district_id][prop_type])
                aggregated[year][district_id][prop_type] = {
                    'avg': int(round(np.mean(prices))),
                    'median': int(round(np.median(prices))),
                    'count': len(prices)
                }

            # Stats for "All" property types (true median from all prices)
            prices = np.array(all_prices[year][district_id])
            if len(prices) > 0:
                aggregated[year][district_id][ALL_PROPERTY_TYPE] = {
                    'avg': int(round(np.mean(prices))),
                    'median': int(round(np.median(prices))),
                    'count': len(prices)
                }

    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Write JSON files for each year
    print(f"\nWriting JSON files to: {OUTPUT_DIR}")

    for year in tqdm(sorted(aggregated.keys()), desc="Writing files"):
        output_file = os.path.join(OUTPUT_DIR, f"{year}.json")

        output_data = {
            'year': year,
            'data': aggregated[year]
        }

        with open(output_file, 'w') as f:
            json.dump(output_data, f, separators=(',', ':'))

    print(f"\nComplete! Generated {len(aggregated)} year files.")

    # Print summary statistics
    print("\nSummary by year:")
    for year in sorted(aggregated.keys())[-5:]:  # Last 5 years
        district_count = len(aggregated[year])
        print(f"  {year}: {district_count:,} districts")


if __name__ == "__main__":
    process_data()
