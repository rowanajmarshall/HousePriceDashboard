#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = [
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

    # Aggregate data by sector, year, and property type
    print("Processing data...")
    aggregated = {}

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

        # Group and aggregate
        for (district_id, year, prop_type), group in chunk.groupby(['district_id', 'year', 'property_type']):
            year = int(year)

            if year not in aggregated:
                aggregated[year] = {}

            if district_id not in aggregated[year]:
                aggregated[year][district_id] = {}

            prices = group['price'].values

            # Calculate statistics
            avg = int(round(prices.mean()))
            median = int(round(pd.Series(prices).median()))
            count = len(prices)

            # Store or update statistics
            if prop_type in aggregated[year][district_id]:
                # Merge with existing data (for chunked processing)
                existing = aggregated[year][district_id][prop_type]
                total_count = existing['count'] + count
                # Weighted average (approximation)
                new_avg = int(round((existing['avg'] * existing['count'] + avg * count) / total_count))
                aggregated[year][district_id][prop_type] = {
                    'avg': new_avg,
                    'median': median,  # Take latest median (not perfect but acceptable)
                    'count': total_count
                }
            else:
                aggregated[year][district_id][prop_type] = {
                    'avg': avg,
                    'median': median,
                    'count': count
                }

    print(f"\nProcessed {total_rows:,} total rows")
    print(f"Valid rows: {valid_rows:,}")
    print(f"Years covered: {min(aggregated.keys())} - {max(aggregated.keys())}")

    # Compute "All" property type aggregate for each district/year
    print("\nComputing 'All' property type aggregates...")
    for year in aggregated:
        for district_id in aggregated[year]:
            district_data = aggregated[year][district_id]

            # Collect all prices across property types
            total_count = 0
            weighted_avg_sum = 0
            all_medians = []

            for prop_type in VALID_PROPERTY_TYPES:
                if prop_type in district_data:
                    stats = district_data[prop_type]
                    total_count += stats['count']
                    weighted_avg_sum += stats['avg'] * stats['count']
                    all_medians.append(stats['median'])

            if total_count > 0:
                # Calculate combined statistics
                combined_avg = int(round(weighted_avg_sum / total_count))
                # Use average of medians as approximation (true median would need raw data)
                combined_median = int(round(sum(all_medians) / len(all_medians)))

                district_data[ALL_PROPERTY_TYPE] = {
                    'avg': combined_avg,
                    'median': combined_median,
                    'count': total_count
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
