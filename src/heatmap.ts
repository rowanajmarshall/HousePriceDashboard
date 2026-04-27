import L from './leaflet-shim';
import * as DataLoader from './data-loader';
import * as MapModule from './map';
import type { PriceRange } from './types';

let geoJsonLayer: L.GeoJSON | null = null;
let viewMode: 'price' | 'change' = 'price';

// Price view state
let currentYear: number | null = null;
let currentPropertyType: string | null = null;
let currentPriceRange: PriceRange | null = null;

// Change view state
let currentStartYear: number | null = null;
let currentEndYear: number | null = null;
let currentChangePropertyType: string | null = null;
let currentChangeRange: PriceRange | null = null;
let currentAdjustInflation = false;

const colors = {
  low: { r: 0, g: 0, b: 255 },
  high: { r: 255, g: 0, b: 0 },
  noData: '#cccccc',
};

const changeColors = {
  decrease: { r: 192, g: 57, b: 43 },
  neutral: { r: 255, g: 255, b: 255 },
  increase: { r: 30, g: 132, b: 73 },
  noData: '#cccccc',
};

export function getColor(price: number | null | undefined, min: number, max: number): string {
  if (price === null || price === undefined) return colors.noData;

  const clampedPrice = Math.max(min, Math.min(max, price));
  const range = max - min;
  if (range === 0) return `rgb(128, 0, 128)`;

  const normalized = (clampedPrice - min) / range;
  const r = Math.round(colors.low.r + normalized * (colors.high.r - colors.low.r));
  const g = Math.round(colors.low.g + normalized * (colors.high.g - colors.low.g));
  const b = Math.round(colors.low.b + normalized * (colors.high.b - colors.low.b));

  return `rgb(${r}, ${g}, ${b})`;
}

export function getChangeColor(changePercent: number | null | undefined, min: number, max: number): string {
  if (changePercent === null || changePercent === undefined) return changeColors.noData;

  let r: number, g: number, b: number;

  if (changePercent <= 0) {
    const normalizedNeg = min === 0 ? 0 : Math.max(0, Math.min(1, changePercent / min));
    r = Math.round(changeColors.neutral.r + normalizedNeg * (changeColors.decrease.r - changeColors.neutral.r));
    g = Math.round(changeColors.neutral.g + normalizedNeg * (changeColors.decrease.g - changeColors.neutral.g));
    b = Math.round(changeColors.neutral.b + normalizedNeg * (changeColors.decrease.b - changeColors.neutral.b));
  } else {
    const normalizedPos = max === 0 ? 0 : Math.max(0, Math.min(1, changePercent / max));
    r = Math.round(changeColors.neutral.r + normalizedPos * (changeColors.increase.r - changeColors.neutral.r));
    g = Math.round(changeColors.neutral.g + normalizedPos * (changeColors.increase.g - changeColors.neutral.g));
    b = Math.round(changeColors.neutral.b + normalizedPos * (changeColors.increase.b - changeColors.neutral.b));
  }

  return `rgb(${r}, ${g}, ${b})`;
}

function getFeatureStyle(feature: GeoJSON.Feature): L.PathOptions {
  const sectorId = (feature.properties as { id: string }).id;
  const stats = DataLoader.getPriceStats(sectorId, currentYear!, currentPropertyType!);

  let fillColor: string = colors.noData;
  let fillOpacity = 0.4;

  if (stats?.avg && currentPriceRange) {
    fillColor = getColor(stats.avg, currentPriceRange.min, currentPriceRange.max);
    fillOpacity = 0.6;
  }

  return {
    fillColor,
    fillOpacity,
    color: '#333333',
    weight: 1.5,
    opacity: 0.6,
  };
}

function getChangeFeatureStyle(feature: GeoJSON.Feature): L.PathOptions {
  const sectorId = (feature.properties as { id: string }).id;
  const change = DataLoader.getPriceChange(
    sectorId,
    currentStartYear!,
    currentEndYear!,
    currentChangePropertyType!,
    currentAdjustInflation
  );

  let fillColor: string = changeColors.noData;
  let fillOpacity = 0.4;

  if (change && currentChangeRange) {
    fillColor = getChangeColor(change.changePercent, currentChangeRange.min, currentChangeRange.max);
    fillOpacity = 0.6;
  }

  return {
    fillColor,
    fillOpacity,
    color: '#333333',
    weight: 1.5,
    opacity: 0.6,
  };
}

function onEachFeature(feature: GeoJSON.Feature, layer: L.Layer): void {
  layer.on({
    click: function (e: L.LeafletMouseEvent) {
      const sectorId = (feature.properties as { id: string }).id;
      window.history.pushState({ postcode: sectorId }, '', '#' + sectorId);

      const fillColor = (e.target as L.Path).options.fillColor || '#3498db';

      const event = new CustomEvent('sectorClick', {
        detail: {
          feature,
          latlng: e.latlng,
          layer,
          color: fillColor,
        },
      });
      document.dispatchEvent(event);
    },
    mouseover: function (e: L.LeafletMouseEvent) {
      const target = e.target as L.Path;
      target.setStyle({
        color: '#333333',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.75,
      });
      (target as L.Path & { bringToFront(): void }).bringToFront();
    },
    mouseout: function (e: L.LeafletMouseEvent) {
      if (geoJsonLayer) {
        const target = e.target as L.Path & { feature: GeoJSON.Feature };
        if (viewMode === 'change') {
          target.setStyle(getChangeFeatureStyle(target.feature));
        } else {
          target.setStyle(getFeatureStyle(target.feature));
        }
      }
    },
  });
}

export async function init(
  map: L.Map,
  geojson: GeoJSON.FeatureCollection,
  year: number,
  propertyType: string
): Promise<L.GeoJSON> {
  currentYear = year;
  currentPropertyType = propertyType;

  await DataLoader.loadPriceData(year);
  currentPriceRange = DataLoader.getPriceRange(year, propertyType);

  geoJsonLayer = L.geoJSON(geojson, {
    style: getFeatureStyle as L.StyleFunction,
    onEachFeature,
  }).addTo(map);

  updateLegend();
  return geoJsonLayer;
}

export async function update(year: number, propertyType: string): Promise<void> {
  if (!geoJsonLayer) {
    console.warn('Heatmap not initialized');
    return;
  }

  const yearChanged = year !== currentYear;
  const typeChanged = propertyType !== currentPropertyType;

  if (!yearChanged && !typeChanged) return;

  currentYear = year;
  currentPropertyType = propertyType;

  if (yearChanged) await DataLoader.loadPriceData(year);

  currentPriceRange = DataLoader.getPriceRange(year, propertyType);

  geoJsonLayer.eachLayer(function (layer) {
    const pathLayer = layer as L.Path & { feature: GeoJSON.Feature };
    pathLayer.setStyle(getFeatureStyle(pathLayer.feature));
  });

  updateLegend();
}

export async function updateChangeView(
  startYear: number,
  endYear: number,
  propertyType: string,
  adjustInflation = false
): Promise<void> {
  if (!geoJsonLayer) {
    console.warn('Heatmap not initialized');
    return;
  }

  viewMode = 'change';

  await Promise.all([DataLoader.loadPriceData(startYear), DataLoader.loadPriceData(endYear)]);

  currentStartYear = startYear;
  currentEndYear = endYear;
  currentChangePropertyType = propertyType;
  currentAdjustInflation = adjustInflation;

  currentChangeRange = DataLoader.getChangeRange(startYear, endYear, propertyType, adjustInflation);

  geoJsonLayer.eachLayer(function (layer) {
    const pathLayer = layer as L.Path & { feature: GeoJSON.Feature };
    pathLayer.setStyle(getChangeFeatureStyle(pathLayer.feature));
  });

  updateChangeLegend();
}

export async function switchToPriceView(): Promise<void> {
  if (viewMode === 'price') return;

  viewMode = 'price';

  if (currentYear && currentPropertyType) {
    currentPriceRange = DataLoader.getPriceRange(currentYear, currentPropertyType);

    geoJsonLayer?.eachLayer(function (layer) {
      const pathLayer = layer as L.Path & { feature: GeoJSON.Feature };
      pathLayer.setStyle(getFeatureStyle(pathLayer.feature));
    });

    updateLegend();
  }
}

function updateLegend(): void {
  const minEl = document.getElementById('legend-min');
  const maxEl = document.getElementById('legend-max');

  if (currentPriceRange) {
    if (minEl) minEl.textContent = formatPrice(currentPriceRange.min);
    if (maxEl) maxEl.textContent = formatPrice(currentPriceRange.max);
  } else {
    if (minEl) minEl.textContent = '-';
    if (maxEl) maxEl.textContent = '-';
  }
}

function updateChangeLegend(): void {
  const minEl = document.getElementById('change-legend-min');
  const maxEl = document.getElementById('change-legend-max');

  if (currentChangeRange && minEl && maxEl) {
    minEl.textContent = formatPercent(currentChangeRange.min);
    maxEl.textContent = formatPercent(currentChangeRange.max);
  }
}

export function formatPercent(percent: number | null | undefined): string {
  if (percent === null || percent === undefined) return '-';
  const sign = percent >= 0 ? '+' : '';
  return sign + Math.round(percent) + '%';
}

export function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return '-';

  if (price >= 1000000) return '£' + (price / 1000000).toFixed(1) + 'M';
  if (price >= 1000) return '£' + Math.round(price / 1000) + 'k';
  return '£' + price;
}

export function getPriceRange(): PriceRange | null {
  return currentPriceRange;
}

export function getViewMode(): 'price' | 'change' {
  return viewMode;
}

export function getState(): {
  viewMode: string;
  year?: number | null;
  propertyType?: string | null;
  startYear?: number | null;
  endYear?: number | null;
} {
  if (viewMode === 'change') {
    return {
      viewMode: 'change',
      startYear: currentStartYear,
      endYear: currentEndYear,
      propertyType: currentChangePropertyType,
    };
  }
  return {
    viewMode: 'price',
    year: currentYear,
    propertyType: currentPropertyType,
  };
}

export function findAndZoomToSector(searchTerm: string): boolean {
  if (!geoJsonLayer || !searchTerm) return false;

  const normalized = searchTerm.replace(/\s+/g, '').toUpperCase();
  const districtMatch = normalized.match(/^([A-Z]{1,2}[0-9][0-9A-Z]?)/);
  if (!districtMatch) return false;

  const districtId = districtMatch[1];

  let foundLayer: (L.Path & { feature: GeoJSON.Feature; getBounds(): L.LatLngBounds }) | null = null;
  geoJsonLayer.eachLayer(function (layer) {
    const pathLayer = layer as L.Path & { feature: GeoJSON.Feature; getBounds(): L.LatLngBounds };
    if ((pathLayer.feature.properties as { id: string }).id === districtId) {
      foundLayer = pathLayer;
    }
  });

  if (foundLayer) {
    const fl = foundLayer as L.Path & { feature: GeoJSON.Feature; getBounds(): L.LatLngBounds };
    MapModule.fitBounds(fl.getBounds());

    const fillColor = fl.options.fillColor || '#3498db';
    const center = fl.getBounds().getCenter();

    const event = new CustomEvent('sectorClick', {
      detail: {
        feature: fl.feature,
        latlng: center,
        color: fillColor,
      },
    });
    document.dispatchEvent(event);

    return true;
  }

  return false;
}

export function getSectorIds(): string[] {
  const ids: string[] = [];
  if (geoJsonLayer) {
    geoJsonLayer.eachLayer(function (layer) {
      const pathLayer = layer as L.Path & { feature: GeoJSON.Feature };
      if (pathLayer.feature?.properties) {
        ids.push((pathLayer.feature.properties as { id: string }).id);
      }
    });
  }
  return ids;
}

export function destroy(): void {
  if (geoJsonLayer) {
    geoJsonLayer.remove();
    geoJsonLayer = null;
  }
  currentYear = null;
  currentPropertyType = null;
  currentPriceRange = null;
}
