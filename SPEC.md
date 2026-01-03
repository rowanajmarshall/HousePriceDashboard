# UK House Price Heatmap - Technical Specification

## 1. Project Overview

### 1.1 Purpose & Goals

An interactive web application that visualizes UK house prices through a color-coded heatmap overlay on a map of the United Kingdom. The application enables home buyers and renters to explore and compare property prices across different regions, time periods, and property types.

**Primary Goals:**
- Provide an intuitive, visual way to understand geographic house price variations across the UK
- Enable comparison of prices across different property types (Detached, Semi-Detached, Terraced, Flats/Maisonettes)
- Show historical price trends from 1995 to present
- Deliver a fast, responsive user experience with a static site architecture

### 1.2 Target Audience

**Primary Users:** Home buyers and renters researching areas to live
- First-time buyers exploring affordable regions
- Families relocating and comparing neighborhoods
- Renters considering purchasing and researching price points
- Anyone interested in understanding UK property market geography

**User Characteristics:**
- Moderate technical literacy
- Accessing primarily from desktop and mobile browsers
- Goal-oriented: seeking quick insights to inform property decisions
- May not be familiar with postcode sector geography

### 1.3 Success Criteria

The MVP will be considered successful when:
- Users can view a complete UK map with house price heatmap for all postcode sectors
- Filtering by property type (4 categories) works correctly
- Filtering by year (1995-present) updates the heatmap accurately
- Clicking any postcode sector displays accurate price statistics in a tooltip
- Page loads and becomes interactive within 5 seconds on standard broadband
- Map remains responsive with smooth interactions when zooming/panning
- Application works on modern desktop and mobile browsers
- Data accurately reflects UK Land Registry official records

---

## 2. User Stories & Use Cases

### 2.1 Primary User Stories

**US-1: Explore Price Geography**
> As a home buyer, I want to see a color-coded map of house prices across the UK, so I can quickly identify affordable regions that match my budget.

**US-2: Filter by Property Type**
> As a user interested in a specific property type, I want to filter the heatmap by Detached, Semi-Detached, Terraced, or Flats, so I can see prices relevant to my needs.

**US-3: View Historical Prices**
> As a user researching market trends, I want to select different years from 1995 to present, so I can understand how prices have changed over time.

**US-4: Get Detailed Area Statistics**
> As a user exploring the map, I want to click on a postcode sector and see key statistics (average price, median price, transaction count), so I can get specific data about areas of interest.

**US-5: Understand the Price Scale**
> As a first-time user, I want to see a legend showing what colors represent which price ranges, so I can interpret the heatmap correctly.

### 2.2 User Flows

**Flow 1: Initial Load & Exploration**
1. User navigates to the application URL
2. Map loads showing UK with default heatmap (All property types, most recent year)
3. User sees color gradient legend indicating price ranges
4. User pans and zooms to explore different regions
5. User clicks on a postcode sector to view statistics

**Flow 2: Filtering by Property Type**
1. User selects "Detached" from property type filter
2. Heatmap updates to show only detached house prices
3. Colors shift to reflect the new price distribution
4. User clicks areas to compare detached house prices across regions

**Flow 3: Viewing Historical Data**
1. User selects year "2008" from year selector
2. Heatmap updates to show 2008 price data
3. User compares with present day by switching back to current year
4. User observes price changes in areas of interest

---

## 3. Functional Requirements

### 3.1 Core Features

**F-1: Interactive Map Display**
- Display a full map of the United Kingdom using Leaflet
- Support standard map interactions: pan, zoom, click
- Overlay postcode sector boundaries as polygons (~10,000+ areas)
- Render polygons with color-coded fill based on price data
- Zoom range: Full UK view to individual postcode sector detail
- Responsive map that adapts to viewport size

**F-2: Heatmap Visualization**
- Apply color gradient from blue (low prices) to red (high prices)
- Calculate color based on price relative to current dataset min/max
- Update colors dynamically when filters change
- Handle missing data gracefully (e.g., gray color for sectors with no data)
- Provide smooth visual transitions when data updates

**F-3: Property Type Filtering**
- Provide UI control to select one property type at a time
- Property type options:
  - Detached
  - Semi-Detached
  - Terraced
  - Flats/Maisonettes
- Default: Show combined average across all types (or most relevant default)
- Filter applies to entire map immediately upon selection

**F-4: Year Selection**
- Provide UI control to select a single year
- Year range: 1995 to present (most recent available Land Registry data)
- Default: Most recent year available
- Update heatmap immediately when year changes
- Display selected year prominently in UI

**F-5: Interactive Tooltips**
- Display tooltip on postcode sector click (or hover)
- Tooltip content:
  - Postcode sector code (e.g., "SW1A 1")
  - Average price (formatted currency: £XXX,XXX)
  - Median price (formatted currency: £XXX,XXX)
  - Number of transactions (e.g., "Based on 47 sales")
  - Property type and year being displayed
- Tooltip positioning: Near cursor/click point without obscuring map
- Close tooltip on: clicking elsewhere, clicking close button, or ESC key

**F-6: Price Legend**
- Display color gradient scale with corresponding price ranges
- Update dynamically when filters change (min/max prices shift)
- Show currency formatting (£XXX,XXX format)
- Position: Fixed on screen, doesn't scroll with map
- Clearly labeled (e.g., "Average Price")

### 3.2 Data Requirements

**D-1: UK Land Registry Data**
- Source: Price Paid Data from UK Land Registry (https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads)
- Coverage: All property transactions from 1995 to present
- Required fields:
  - Transaction date
  - Price paid
  - Postcode
  - Property type (D=Detached, S=Semi-Detached, T=Terraced, F=Flat/Maisonette)
  - Additional fields for data quality (new build, estate type, etc.)

**D-2: Postcode Sector Geography**
- Source: OS OpenData or Office for National Statistics Postcode Directory
- Format: GeoJSON polygon boundaries for each postcode sector
- Coverage: All UK postcode sectors (~10,000-11,000 sectors)
- Coordinate system: WGS84 (EPSG:4326) for Leaflet compatibility

**D-3: Processed Data Structure**
- Pre-aggregated price statistics by postcode sector, property type, and year
- Format: JSON or optimized format (see Data Model section)
- Metrics: Average price, median price, transaction count
- File size optimization: Consider separate files per year or chunking strategy

### 3.3 Non-Functional Requirements

**Performance:**
- Initial page load: < 5 seconds on standard broadband connection
- Time to interactive: < 3 seconds after data loaded
- Heatmap filter update: < 500ms for property type or year change
- Smooth map interactions: 60fps panning and zooming

**Compatibility:**
- Modern browsers: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- Mobile browsers: iOS Safari 14+, Chrome Mobile 90+
- Responsive design: Works on viewport widths from 320px to 4K displays

**Accessibility:**
- Keyboard navigation support for filter controls
- Color-blind friendly blue-to-red gradient
- Alt text and ARIA labels for interactive elements
- Tooltip content accessible via keyboard

**Data Accuracy:**
- Prices match official Land Registry records
- Calculations (average, median) mathematically correct
- Clear indication when data is missing or unreliable (low transaction count)

---

## 4. Technical Architecture

### 4.1 Technology Stack

**Frontend:**
- HTML5
- CSS3 (modern features: Grid, Flexbox, CSS Variables)
- Vanilla JavaScript (ES6+)
- No build step initially (consider Vite or similar if needed for optimization)

**Mapping Library:**
- Leaflet 1.9+ (https://leafletjs.com/)
- Leaflet.heat plugin (if using point-based heatmap as alternative)
- No API keys required

**Data Format:**
- GeoJSON for postcode boundaries
- JSON for price statistics
- Potential optimization: Use TopoJSON or binary formats if file size becomes issue

**Hosting:**
- Static site hosting (TBD: GitHub Pages, Netlify, or Vercel)
- Requirements: Serve static files, support gzip compression, HTTPS
- CDN preferred for fast global delivery

### 4.2 Data Pipeline

The data pipeline transforms raw Land Registry data into application-ready formats. This process runs offline before deployment.

**Pipeline Steps:**

**Step 1: Download Raw Data**
- Source: UK Land Registry Price Paid Data (CSV format)
  - Complete dataset: https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads
  - Annual updates or full dataset
- Source: Postcode sector boundaries
  - OS OpenData Boundary-Line or Code-Point Open
  - Convert to GeoJSON if necessary

**Step 2: Data Cleaning & Validation**
- Parse CSV data (handle encoding, delimiters)
- Validate required fields are present
- Remove invalid records (missing postcode, price = 0, etc.)
- Filter out non-standard transactions if needed (e.g., non-market sales)
- Extract postcode sector from full postcode (first 5-6 characters)

**Step 3: Aggregation**
- Group transactions by:
  - Postcode sector
  - Property type (D, S, T, F)
  - Year (extracted from transaction date)
- Calculate for each group:
  - Average price (mean)
  - Median price
  - Transaction count
  - Min/max prices (optional, for validation)

**Step 4: Join with Geography**
- Map postcode sectors to GeoJSON polygons
- Ensure all postcode sectors in price data have corresponding geometry
- Handle sectors with no transaction data (mark as null/undefined)

**Step 5: Output Generation**
- Generate GeoJSON file with embedded price statistics OR
- Separate files:
  - `boundaries.geojson` - postcode sector polygons with IDs
  - `prices-{year}.json` - price data keyed by postcode sector ID
- Optimize:
  - Reduce GeoJSON precision (e.g., 5 decimal places adequate for display)
  - Minify JSON
  - Consider compression (gzip at hosting level)

**Step 6: Validation**
- Spot-check known postcode sectors against Land Registry online tools
- Verify min/max prices are reasonable
- Check for missing sectors or data anomalies
- Test file sizes are acceptable for web delivery

**Pipeline Implementation:**
- Language: Python (pandas, geopandas) or Node.js
- Scripts should be:
  - Reproducible
  - Well-documented
  - Version controlled in repository
- Store in `/scripts` or `/data-pipeline` directory

**Data Update Strategy:**
- Land Registry releases data monthly/quarterly
- Plan for periodic pipeline re-runs to update data
- Version control output data or timestamp clearly

### 4.3 Application Architecture

**File Structure:**
```
house-price-dashboard/
├── index.html              # Main HTML page
├── css/
│   ├── main.css            # Primary styles
│   └── map.css             # Map-specific styles
├── js/
│   ├── main.js             # Application initialization
│   ├── map.js              # Map setup and controls
│   ├── heatmap.js          # Heatmap rendering logic
│   ├── filters.js          # Filter UI and state management
│   ├── tooltip.js          # Tooltip interaction logic
│   └── data-loader.js      # Data fetching and caching
├── data/
│   ├── boundaries.geojson  # Postcode sector polygons
│   └── prices/
│       ├── 1995.json       # Price data by year
│       ├── 1996.json
│       └── ...
├── assets/
│   └── favicon.ico
├── scripts/                # Data pipeline scripts
│   ├── download.py
│   ├── process.py
│   └── README.md           # Pipeline documentation
├── SPEC.md                 # This document
└── README.md               # Project overview
```

**Module Responsibilities:**

**main.js:**
- Application entry point
- Initialize map on page load
- Wire up filter event listeners
- Coordinate between modules

**map.js:**
- Initialize Leaflet map
- Configure base layers (OpenStreetMap tiles)
- Set initial view (center on UK)
- Handle zoom/pan interactions

**heatmap.js:**
- Load GeoJSON boundaries
- Apply color scale based on price data
- Update polygon colors when filters change
- Calculate price ranges for legend
- Handle missing data (color sectors gray)

**filters.js:**
- Manage filter UI controls (dropdowns, buttons, etc.)
- Track filter state (current property type, year)
- Emit events when filters change
- Provide getters for current filter values

**tooltip.js:**
- Display tooltip on sector click
- Format price data (currency, numbers)
- Position tooltip near click point
- Handle close interactions

**data-loader.js:**
- Fetch GeoJSON and price data files
- Cache loaded data in memory
- Provide data access methods to other modules
- Handle loading states and errors

**Color Scale Algorithm:**
```javascript
// Pseudocode
function getColor(price, minPrice, maxPrice) {
  if (price === null) return '#cccccc'; // Gray for no data

  const range = maxPrice - minPrice;
  const normalized = (price - minPrice) / range; // 0 to 1

  // Blue (low) to Red (high) gradient
  const blue = { r: 0, g: 0, b: 255 };
  const red = { r: 255, g: 0, b: 0 };

  const r = Math.round(blue.r + normalized * (red.r - blue.r));
  const g = Math.round(blue.g + normalized * (red.g - blue.g));
  const b = Math.round(blue.b + normalized * (red.b - blue.b));

  return `rgb(${r}, ${g}, ${b})`;
}
```

---

## 5. Data Model

### 5.1 Price Statistics Data Structure

**Option A: Embedded in GeoJSON**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "sector_code": "SW1A 1",
        "prices": {
          "2023": {
            "D": { "avg": 1250000, "median": 1100000, "count": 12 },
            "S": { "avg": 850000, "median": 825000, "count": 8 },
            "T": { "avg": 650000, "median": 640000, "count": 24 },
            "F": { "avg": 450000, "median": 425000, "count": 156 }
          },
          "2022": { ... }
        }
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[-0.141, 51.501], ...]]
      }
    }
  ]
}
```

**Option B: Separate Files (Recommended for large dataset)**

`boundaries.geojson`:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "SW1A1",
        "sector_code": "SW1A 1"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[-0.141, 51.501], ...]]
      }
    }
  ]
}
```

`prices/2023.json`:
```json
{
  "year": 2023,
  "data": {
    "SW1A1": {
      "D": { "avg": 1250000, "median": 1100000, "count": 12 },
      "S": { "avg": 850000, "median": 825000, "count": 8 },
      "T": { "avg": 650000, "median": 640000, "count": 24 },
      "F": { "avg": 450000, "median": 425000, "count": 156 }
    },
    "SW1A2": { ... }
  }
}
```

**Decision:** Use Option B (separate files) because:
- Smaller initial load (only current year data needed)
- Lazy load year data on demand
- Easier to update individual years
- Better browser caching

### 5.2 Property Type Codes

| Code | Full Name | Description |
|------|-----------|-------------|
| D | Detached | Stand-alone houses with no shared walls |
| S | Semi-Detached | Houses sharing one wall with one neighbor |
| T | Terraced | Houses in a row sharing walls on both sides |
| F | Flats/Maisonettes | Apartments and multi-story flats |

### 5.3 Data Fields Reference

**Price Statistics Object:**
- `avg` (number): Mean price in GBP (pounds, no pence)
- `median` (number): Median price in GBP
- `count` (number): Number of transactions in the period

**Handling Missing Data:**
- If a postcode sector has no transactions for a given year/property type:
  - Set value to `null` or omit the key
- UI should display "No data" in tooltip
- Map should render sector in gray or very light color

**Price Formatting:**
- Store as integers (pounds, no pence needed for house prices)
- Display with thousands separator: £650,000
- Abbreviate in legend if needed: £650k

---

## 6. UI/UX Specifications

### 6.1 Layout & Components

**Overall Layout:**
```
┌─────────────────────────────────────────────┐
│  Header: "UK House Price Heatmap"          │
├──────────────┬──────────────────────────────┤
│              │                              │
│  Controls    │                              │
│  Panel       │      Map Canvas              │
│              │                              │
│  - Property  │                              │
│    Type      │                              │
│  - Year      │                              │
│              │                              │
│  Legend      │                              │
│              │                              │
└──────────────┴──────────────────────────────┘
```

**Responsive Behavior:**
- **Desktop (> 1024px):** Side panel on left, map fills remaining space
- **Tablet (768px - 1024px):** Controls stacked vertically on left, smaller panel
- **Mobile (< 768px):** Controls collapse to top bar or bottom sheet, map full width

**Component Details:**

**Header:**
- Application title: "UK House Price Heatmap"
- Subtitle/tagline: "Explore 20+ years of UK property prices" (optional)
- Minimal branding
- Height: ~60-80px
- Background: Neutral color (dark blue, gray, or white)

**Controls Panel:**
- Width: 280-320px (desktop)
- Background: White or light gray
- Padding: 20px
- Components (top to bottom):
  1. Property Type Selector
  2. Year Selector
  3. Legend
  4. (Optional) About/Help link

**Property Type Selector:**
- Label: "Property Type"
- Control type: Radio buttons OR dropdown select
- Options:
  - Detached
  - Semi-Detached
  - Terraced
  - Flats/Maisonettes
- Default: TBD (consider "Flats/Maisonettes" as most common transaction type, or show aggregate)
- Visual: Clear, large touch targets

**Year Selector:**
- Label: "Year"
- Control type: Dropdown select OR range slider
- Options: 1995, 1996, ..., 2024, 2025 (all years with data)
- Default: Most recent year
- Consider: Slider for easy scrubbing through years (nice UX)

**Legend:**
- Title: "Average Price" or "Median Price" (depending on what's displayed)
- Visual: Vertical or horizontal color gradient bar
- Labels: Min, Max, and optionally mid-range values
- Price format: £XXX,XXX or £XXXk
- Update dynamically when filters change
- Note: Consider showing both avg and median if space permits

**Map Canvas:**
- Library: Leaflet
- Base layer: OpenStreetMap (free, no API key)
  - Alternative: CartoDB Positron (cleaner, lighter background)
- Initial view: Centered on UK, zoom level to show entire country
- Min zoom: Show full UK
- Max zoom: Individual postcode sector detail
- Controls: Zoom in/out buttons, attribution

### 6.2 Color Scheme

**Heatmap Gradient (Blue to Red):**
- Low prices: `#0000FF` (pure blue)
- Mid prices: `#800080` (purple) or gradient midpoint
- High prices: `#FF0000` (pure red)
- No data: `#CCCCCC` (light gray) or `#E0E0E0`

**Additional Colors:**
- Postcode sector borders: `#333333` or `#666666`, 1px, low opacity (0.3-0.5)
- Hover state: Increase border width or add subtle highlight
- Selected/clicked: Thicker border or glow effect

**UI Colors:**
- Background: `#FFFFFF` (white) or `#F5F5F5` (off-white)
- Text: `#333333` (dark gray) or `#000000` (black)
- Accent: Blue or complementary color for buttons/links
- Keep UI colors neutral to avoid clashing with heatmap

### 6.3 Tooltip Design

**Trigger:**
- Click on postcode sector (primary)
- Optional: Hover after 500ms delay (consider performance)

**Content:**
```
┌─────────────────────────────┐
│  Postcode: SW1A 1      [×]  │
│  Flats/Maisonettes - 2023   │
├─────────────────────────────┤
│  Average: £450,000          │
│  Median:  £425,000          │
│  Sales:   156 properties    │
└─────────────────────────────┘
```

**Styling:**
- Background: White with subtle shadow
- Border: 1px solid light gray
- Padding: 12-16px
- Font: Clean sans-serif, 14px body text
- Close button: × in top-right corner
- Max-width: 280px
- Position: Near click point, avoid edges

**Behavior:**
- Fade in animation (150ms)
- Close on: Click outside, click ×, ESC key, or change filter
- One tooltip visible at a time

**No Data State:**
```
┌─────────────────────────────┐
│  Postcode: AB1 2       [×]  │
│  Detached - 2023            │
├─────────────────────────────┤
│  No sales data available    │
│  for this combination.      │
└─────────────────────────────┘
```

### 6.4 Loading & Error States

**Initial Load:**
- Show loading spinner over map area
- Message: "Loading map and data..."
- Disable controls until data ready

**Filter Change:**
- Show subtle loading indicator (small spinner in corner)
- Optionally dim map slightly
- Or: Optimistic update (change immediately, assuming data cached)

**Error States:**
- Failed to load data: Show error message with retry button
- Missing year data: Fallback message, suggest selecting another year
- General errors: User-friendly message, avoid technical jargon

### 6.5 Accessibility Considerations

- Keyboard navigation: Tab through controls, Enter to select
- Focus indicators: Clear outline on focused elements
- Color contrast: Ensure text meets WCAG AA standards (4.5:1 ratio)
- Color-blind friendly: Blue-red gradient works for most types
- ARIA labels: Add to interactive map elements
- Screen reader support: Provide text alternatives for map data (consider data table view)
- Responsive touch targets: Minimum 44x44px for mobile

---

## 7. Performance Considerations

### 7.1 File Size Optimization

**Challenge:** ~10,000 postcode sectors with 25+ years of data could create large files

**Strategies:**
- **Simplify GeoJSON geometry:** Reduce coordinate precision to 5 decimal places (~1m accuracy, sufficient for visualization)
- **Separate data files:** One per year, lazy load on demand (only load selected year)
- **Minify JSON:** Remove whitespace
- **Compression:** Enable gzip/brotli at hosting level (can reduce JSON by 70-80%)
- **Consider TopoJSON:** More compact than GeoJSON for boundary data (reuses shared edges)

**Target Sizes:**
- Boundaries GeoJSON: < 2-3 MB (uncompressed), < 500KB (gzipped)
- Price data per year: < 500KB (uncompressed), < 100KB (gzipped)
- Total initial load: < 1-2 MB (boundaries + one year)

### 7.2 Rendering Performance

**Challenge:** Rendering 10,000+ polygons can strain browser performance

**Strategies:**
- **Simplify polygons:** Use tools like Mapshaper to reduce vertex count while preserving shape
- **Layer management:** Only render polygons in current viewport + buffer
- **Debounce updates:** When zooming/panning rapidly, delay re-renders
- **Canvas rendering:** Consider Leaflet canvas renderer for better performance with many polygons
- **Clustering (future):** At low zoom levels, aggregate to larger areas (e.g., postcode districts)

**Target Performance:**
- 60fps when panning/zooming
- < 500ms to re-color all polygons on filter change
- Smooth interactions on mid-range devices (iPhone 12, Android equivalents)

### 7.3 Data Loading Strategy

**Initial Load:**
1. Load HTML/CSS/JS (lightweight)
2. Initialize Leaflet map with base layer
3. Load boundaries GeoJSON (cached aggressively)
4. Load default year price data
5. Render heatmap

**On Filter Change:**
- Property type: Data already loaded, just re-calculate colors (instant)
- Year: Check if year data cached in memory
  - If yes: Use cached data (instant)
  - If no: Fetch year JSON, cache, then render (< 500ms)

**Caching:**
- Browser cache: Set long cache headers for data files (1 year)
- In-memory cache: Store loaded year data in JavaScript Map/object
- Service worker (future enhancement): Offline capability

### 7.4 Browser Compatibility

**Supported Browsers:**
- Chrome 90+ (April 2021)
- Firefox 88+ (April 2021)
- Safari 14+ (September 2020)
- Edge 90+ (April 2021)

**Polyfills (if needed):**
- Fetch API (should be natively supported in target browsers)
- ES6 features: Promises, arrow functions, const/let, template literals (native support expected)

**Testing:**
- Test on real devices: iOS Safari, Android Chrome
- Test on slower connections: Simulate 3G to verify load times

---

## 8. Out of Scope (for MVP)

The following features are explicitly excluded from the initial version but may be considered for future enhancements:

**User Features:**
- Search functionality (search by postcode, town name, or area)
- Area comparison tool (side-by-side comparison of multiple postcode sectors)
- Saved favorites or bookmarks
- Price change indicators (% change year-over-year)
- Export data (CSV download, share links)
- Property listings or links to Rightmove/Zoopla
- User accounts or authentication

**Data Features:**
- Real-time or near-real-time data updates
- Property type subtypes (new builds vs existing, freehold vs leasehold)
- Rental price data
- Additional metrics (price per square meter, sales velocity)
- Predictive pricing or trends

**Visualization Features:**
- Charts and graphs (line charts showing price over time)
- Time-lapse animation (watch prices change across years)
- 3D visualization
- Heatmap alternatives (choropleth with categories, point density)

**Technical Features:**
- Backend API or database
- User-generated content
- Social sharing
- Analytics tracking
- A/B testing
- Internationalization (non-UK regions)

---

## 9. Future Enhancements

Potential features for future versions, ordered by potential value:

**High Priority:**
1. **Search Functionality** - Allow users to search by postcode or place name, auto-zoom to location
2. **Price Change Indicators** - Show % change from previous year or over 5/10 years
3. **Transaction Count Visualization** - Color intensity or size based on data reliability
4. **Time Slider** - Interactive slider to scrub through years quickly, see animated changes
5. **Mobile Optimization** - Enhanced touch interactions, swipe gestures for year changes

**Medium Priority:**
6. **Area Comparison** - Select multiple postcode sectors, compare in a table or chart
7. **Historical Charts** - Click area to see line chart of prices over time
8. **Property Type Toggle** - Show multiple property types on one map (e.g., checkboxes instead of radio)
9. **Export/Share** - Generate shareable links with current filters, download data as CSV
10. **Improved Legend** - Show price distribution (histogram), quartiles, or percentiles

**Low Priority:**
11. **Alternative Base Maps** - Satellite view, street view, terrain
12. **Rental Prices** - If rental data becomes available
13. **Regional Statistics** - Show summary stats for counties, regions, nations
14. **Offline Mode** - Service worker for offline access
15. **Accessibility Features** - Data table view, high-contrast mode

**Technical Improvements:**
16. **Build Pipeline** - Add Vite/Webpack for bundling, minification, tree-shaking
17. **Testing** - Unit tests for calculations, E2E tests for user flows
18. **Performance Monitoring** - Real user monitoring, identify bottlenecks
19. **CDN Optimization** - Serve data files from CDN, optimize cache strategy
20. **Progressive Enhancement** - Graceful degradation for older browsers

---

## 10. Open Questions & Decisions Needed

### 10.1 Pending Decisions

**Data Processing:**
- [ ] Which Python/Node libraries to use for data pipeline?
- [ ] Exact Land Registry dataset to download (full vs annual updates)?
- [ ] How to handle postcode sectors that don't match geography (boundary changes)?

**UI/UX:**
- [ ] Default property type on load (suggest Flats/Maisonettes as most common)
- [ ] Year selector: Dropdown or slider? (Recommend slider for better UX)
- [ ] Should tooltip appear on click or hover? (Recommend click for mobile-first)
- [ ] Desktop controls: Sidebar or top bar?

**Technical:**
- [ ] Exact GeoJSON simplification tolerance (test at various levels)
- [ ] File size thresholds for splitting price data (test 1 file vs per-year)
- [ ] Color scale: Linear or logarithmic? (Test with real data distribution)
- [ ] Hosting choice: GitHub Pages, Netlify, or Vercel? (Recommend Netlify for deploy previews)

### 10.2 Assumptions Made

- UK Land Registry data is freely available and can be used for this purpose (verify licensing)
- Postcode sector geography is stable enough for the time period (1995-present)
- Users have modern browsers (no IE11 support)
- Hosting platform supports serving large static files efficiently
- Price data aggregation by year is sufficient (no monthly/quarterly breakdowns)

---

## 11. Appendix

### 11.1 Useful Resources

**Data Sources:**
- UK Land Registry Price Paid Data: https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads
- OS OpenData: https://www.ordnancesurvey.co.uk/business-government/products/open-map-data
- ONS Postcode Directory: https://geoportal.statistics.gov.uk/

**Technical Documentation:**
- Leaflet: https://leafletjs.com/reference.html
- GeoJSON Specification: https://geojson.org/
- TopoJSON: https://github.com/topojson/topojson

**Similar Projects (for inspiration):**
- Zoopla House Price Map: https://www.zoopla.co.uk/house-prices/
- Land Registry Price Map: https://landregistry.data.gov.uk/app/ukhpi

### 11.2 Glossary

- **Heatmap**: Color-coded visualization where colors represent data values
- **Postcode Sector**: First 5-6 characters of UK postcode (e.g., "SW1A 1" from "SW1A 1AA")
- **GeoJSON**: JSON format for encoding geographic data structures
- **Leaflet**: Open-source JavaScript library for interactive maps
- **Land Registry**: UK government body that registers property ownership and transactions
- **Median Price**: Middle value when all prices are sorted (less affected by outliers than average)
- **Static Site**: Website with no backend server, served as pre-built HTML/CSS/JS files

---

## Document Control

**Version:** 1.0
**Last Updated:** 2026-01-03
**Status:** Draft - Ready for Review
**Author:** Collaborative spec between user and Claude Code

**Approval:**
- [ ] User/Product Owner approval
- [ ] Technical review complete
- [ ] Ready for implementation

---

*This specification is a living document and may be updated as requirements evolve or technical discoveries are made during implementation.*
