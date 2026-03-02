#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
"""
Build a district code → name mapping from Doogal's postcode district CSV.

Downloads the CSV from doogal.co.uk (licensed under Open Government Licence v3.0)
and outputs a compact JSON file mapping district codes to their primary town/area name.

Output: public/data/district-names.json
  { "AL1": "St Albans", "SW1A": "London", ... }

Usage:
    uv run scripts/build_district_names.py
"""

import csv
import json
import urllib.request
from pathlib import Path

CSV_URL = "https://www.doogal.co.uk/PostcodeDistrictsCSV/"
OUTPUT_PATH = Path(__file__).parent.parent / "public" / "data" / "district-names.json"

def primary_name(town_area: str) -> str:
    """Return the first name from a comma-separated list, stripped."""
    return town_area.split(",")[0].strip()

def main():
    print(f"Downloading postcode district data from {CSV_URL} ...")
    max_attempts = 5
    for attempt in range(1, max_attempts + 1):
        try:
            req = urllib.request.Request(CSV_URL, headers={"User-Agent": "Mozilla/5.0"})
            chunks = []
            with urllib.request.urlopen(req, timeout=60) as response:
                while True:
                    chunk = response.read(65536)
                    if not chunk:
                        break
                    chunks.append(chunk)
            content = b"".join(chunks).decode("utf-8", errors="replace")
            # Sanity check: expect at least 2000 lines
            if content.count("\n") >= 2000:
                print(f"  Downloaded {len(content)} bytes on attempt {attempt}.")
                break
            else:
                print(f"  Attempt {attempt}: only got {content.count(chr(10))} lines, retrying...")
        except Exception as e:
            print(f"  Attempt {attempt} failed: {e}, retrying...")
    else:
        raise RuntimeError("Failed to download complete CSV after all attempts")

    reader = csv.DictReader(content.splitlines())

    names: dict[str, str] = {}
    for row in reader:
        code = row["Postcode"].strip()
        town = row["Town/Area"].strip()
        if code and town:
            names[code] = primary_name(town)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(names, f, separators=(",", ":"))

    print(f"Written {len(names)} districts to {OUTPUT_PATH}")
    print(f"File size: {OUTPUT_PATH.stat().st_size / 1024:.1f} KB")

    # Spot-check a few known districts
    for code in ["AL1", "SW1A", "E1", "M1", "EH1", "BS1"]:
        print(f"  {code}: {names.get(code, '(not found)')}")

if __name__ == "__main__":
    main()
