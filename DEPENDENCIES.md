# Dependencies

This document lists all dependencies used in the UK House Price Heatmap project, including code libraries, data sources, and their respective licenses.

## Data Sources

### HM Land Registry Price Paid Data
- **Source**: UK HM Land Registry
- **URL**: https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads
- **License**: Open Government Licence v3.0
- **License URL**: https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/
- **Attribution Required**: Yes
- **Attribution**: Contains HM Land Registry data © Crown copyright and database right 2025. This data is licensed under the Open Government Licence v3.0.

### UK Postcode District Boundaries
- **Source**: missinglink/uk-postcode-polygons (GitHub)
- **Original Data**: Wikipedia contributors
- **URL**: https://github.com/missinglink/uk-postcode-polygons
- **License**: Creative Commons Attribution ShareAlike 3.0 Unported (CC BY-SA 3.0)
- **License URL**: https://creativecommons.org/licenses/by-sa/3.0/
- **Attribution Required**: Yes
- **Attribution**: Postcode boundary data © Wikipedia contributors, licensed under CC BY-SA 3.0.

### ONS Consumer Price Index (CPI) Data
- **Source**: Office for National Statistics
- **Series**: D7BT - CPI INDEX 00: ALL ITEMS 2015=100
- **URL**: https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7bt/mm23
- **License**: Open Government Licence v3.0
- **License URL**: https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/
- **Attribution Required**: Yes
- **Attribution**: Source: Office for National Statistics licensed under the Open Government Licence v3.0.

### OpenStreetMap Map Tiles
- **Source**: OpenStreetMap contributors
- **URL**: https://www.openstreetmap.org/
- **License**: Open Data Commons Open Database License (ODbL)
- **License URL**: https://opendatacommons.org/licenses/odbl/
- **Attribution Required**: Yes
- **Attribution**: © OpenStreetMap contributors. Map data available under ODbL.

## Code Libraries (Frontend)

### Leaflet
- **Version**: 1.9.4
- **URL**: https://leafletjs.com/
- **License**: BSD-2-Clause
- **License URL**: https://github.com/Leaflet/Leaflet/blob/main/LICENSE
- **Attribution Required**: No (but included in map attribution)

### Simple Analytics
- **URL**: https://simpleanalytics.com/
- **Type**: Third-party analytics service (privacy-focused)
- **License**: Proprietary (service subscription)
- **Attribution Required**: No

## Code Libraries (Python Data Pipeline)

These packages are used only for offline data processing and are not distributed with the application.

### pandas
- **Version**: >=2.0.0
- **URL**: https://pandas.pydata.org/
- **License**: BSD-3-Clause
- **Attribution Required**: No

### requests
- **Version**: >=2.28.0
- **URL**: https://requests.readthedocs.io/
- **License**: Apache License 2.0
- **Attribution Required**: No

### tqdm
- **Version**: >=4.65.0
- **URL**: https://tqdm.github.io/
- **License**: MIT / MPL-2.0
- **Attribution Required**: No

### geopandas (optional)
- **Version**: >=0.14.0
- **URL**: https://geopandas.org/
- **License**: BSD-3-Clause
- **Attribution Required**: No

### shapely (optional)
- **Version**: >=2.0.0
- **URL**: https://shapely.readthedocs.io/
- **License**: BSD-3-Clause
- **Attribution Required**: No

## Summary of Attribution Requirements

The following sources **require attribution** when using this application:

| Source | License | Attribution Required |
|--------|---------|---------------------|
| HM Land Registry | OGL v3.0 | Yes |
| Wikipedia (postcode boundaries) | CC BY-SA 3.0 | Yes |
| Office for National Statistics | OGL v3.0 | Yes |
| OpenStreetMap | ODbL | Yes |
| Leaflet | BSD-2-Clause | No |

All required attributions are included on the [Attribution page](/attribution.html).

## License Compatibility

- **Open Government Licence v3.0**: Permits commercial and non-commercial use with attribution
- **CC BY-SA 3.0**: Permits commercial and non-commercial use with attribution; derivative works must be shared under the same license
- **ODbL**: Permits commercial and non-commercial use with attribution; derivative databases must be shared under the same license
- **BSD-2-Clause/BSD-3-Clause**: Permissive licenses allowing commercial and non-commercial use
