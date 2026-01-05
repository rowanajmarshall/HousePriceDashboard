# Data Pipeline Scripts

These scripts download and process UK Land Registry data into the format required by the house price heatmap application.

## Quick Start with uv

All scripts use [uv](https://docs.astral.sh/uv/) inline script metadata (PEP 723), so dependencies are installed automatically.

```bash
cd scripts

# Download postcode district boundaries (GB only)
uv run download_boundaries.py

# Download Land Registry price data (~4GB)
uv run download_data.py

# Process prices into yearly JSON files
uv run process_prices.py
```

## Scripts

### `download_boundaries.py`
Downloads UK postcode district boundaries from GitHub and combines them into a single GeoJSON file.

```bash
uv run download_boundaries.py
```

**Output:** `../public/data/boundaries.geojson` (~4MB simplified, 2,736 districts)

**Note:** Currently excludes Northern Ireland (BT postcodes) as the source doesn't include them.

### `download_data.py`
Downloads the UK Land Registry Price Paid Data.

```bash
uv run download_data.py
```

**Output:** `raw_data/pp-complete.csv` (~4GB)

This downloads the complete dataset containing all property transactions since 1995.

### `process_prices.py`
Processes the raw Land Registry data into aggregated JSON files.

```bash
uv run process_prices.py
```

**Output:**
- `../public/data/prices/1995.json`
- `../public/data/prices/1996.json`
- ... (one file per year)
- `../public/data/prices/2024.json`

### `process_boundaries.py`
Converts custom postcode boundary shapefiles to GeoJSON format (for advanced use cases).

```bash
# Process a shapefile
uv run process_boundaries.py

# Create sample boundaries for testing
uv run process_boundaries.py --sample
```

## Alternative: Traditional pip install

If you prefer not to use uv, install dependencies manually:

```bash
pip install pandas requests tqdm

# For process_boundaries.py only:
pip install geopandas shapely
```

Then run scripts with:
```bash
python download_boundaries.py
python download_data.py
python process_prices.py
```

## Data Sources

### Price Paid Data
- **Source**: UK Land Registry
- **URL**: https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads
- **License**: Open Government Licence v3.0
- **Format**: CSV
- **Fields used**:
  - Transaction date
  - Price
  - Postcode
  - Property type (D=Detached, S=Semi-Detached, T=Terraced, F=Flat)

### Postcode District Boundaries
- **Source**: GitHub (missinglink/uk-postcode-polygons)
- **Original data**: Wikipedia/OpenStreetMap
- **License**: Open data
- **Coverage**: Great Britain (excludes Northern Ireland)

## Output Format

### Price Data (`prices/{year}.json`)
```json
{
  "year": 2024,
  "data": {
    "SW1A": {
      "D": { "avg": 3250000, "median": 2950000, "count": 5 },
      "S": { "avg": 2150000, "median": 2000000, "count": 8 },
      "T": { "avg": 1650000, "median": 1550000, "count": 12 },
      "F": { "avg": 1250000, "median": 1100000, "count": 156 }
    }
  }
}
```

### Boundaries (`boundaries.geojson`)
Standard GeoJSON FeatureCollection with properties:
- `id`: District ID (e.g., "SW1A")
- `sector_code`: Human-readable code (e.g., "SW1A")

## Processing Notes

1. **Postcode districts** are the outward code of UK postcodes (e.g., SW1A from SW1A 1AA)

2. **Property types** are filtered to standard residential:
   - D = Detached
   - S = Semi-Detached
   - T = Terraced
   - F = Flats/Maisonettes

3. **Prices** are rounded to nearest pound (no pence)

4. **Statistics calculated**:
   - `avg`: Mean price
   - `median`: Median price
   - `count`: Number of transactions

5. **District IDs** are normalized (spaces removed) for use as object keys
