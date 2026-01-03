#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = [
#     "requests>=2.28.0",
#     "tqdm>=4.65.0",
# ]
# ///
"""
Download UK Land Registry Price Paid Data

Downloads the complete price paid dataset from the UK Land Registry.
The file is approximately 4GB and contains all property transactions since 1995.

Usage:
    uv run download_data.py
"""

import os
import requests
from tqdm import tqdm

# Configuration
DATA_URL = "http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-complete.csv"
OUTPUT_DIR = "raw_data"
OUTPUT_FILE = "pp-complete.csv"


def download_file(url, output_path):
    """Download a file with progress bar."""
    print(f"Downloading from: {url}")
    print(f"Saving to: {output_path}")

    # Stream the download
    response = requests.get(url, stream=True)
    response.raise_for_status()

    # Get file size if available
    total_size = int(response.headers.get('content-length', 0))

    # Download with progress bar
    with open(output_path, 'wb') as f:
        with tqdm(total=total_size, unit='B', unit_scale=True, desc="Downloading") as pbar:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    pbar.update(len(chunk))

    print(f"\nDownload complete: {output_path}")
    print(f"File size: {os.path.getsize(output_path) / (1024**3):.2f} GB")


def main():
    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    output_path = os.path.join(OUTPUT_DIR, OUTPUT_FILE)

    # Check if file already exists
    if os.path.exists(output_path):
        size_gb = os.path.getsize(output_path) / (1024**3)
        print(f"File already exists: {output_path} ({size_gb:.2f} GB)")
        response = input("Download again? (y/N): ")
        if response.lower() != 'y':
            print("Skipping download.")
            return

    # Download the file
    download_file(DATA_URL, output_path)

    print("\nNext steps:")
    print("1. Run 'python process_prices.py' to process the data")


if __name__ == "__main__":
    main()
