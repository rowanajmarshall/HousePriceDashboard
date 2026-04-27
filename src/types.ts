/** Leaflet types - imported from @types/leaflet */
export type { Map as LeafletMap, LatLng, LatLngBounds, GeoJSON as GeoJSONLayer, Layer, PathOptions } from 'leaflet';

/** Property type codes used throughout the app */
export type PropertyTypeCode = 'A' | 'D' | 'S' | 'T' | 'F' | 'O';

/** Price statistics for a sector/year/property-type combination */
export interface PriceStats {
  avg: number;
  median: number;
  count: number;
}

/** Year price data: sector ID -> property type -> stats */
export interface YearData {
  data: Record<string, SectorData>;
}

export type SectorData = Partial<Record<string, PriceStats>>;

/** Inflation data from the API */
export interface InflationData {
  data: Record<string, number>;
}

/** Price range for color scale */
export interface PriceRange {
  min: number;
  max: number;
  absoluteMin: number;
  absoluteMax: number;
}

/** Price change data between two years */
export interface PriceChange {
  startPrice: number;
  endPrice: number;
  nominalStartPrice: number;
  nominalEndPrice: number;
  changeAmount: number;
  changePercent: number;
  startCount: number;
  endCount: number;
  adjustedForInflation: boolean;
}

/** Filter state for the price view */
export interface FilterState {
  propertyType: string;
  year: number;
}

/** Filter state for the change view */
export interface ChangeFilterState {
  propertyType: string;
  startYear: number;
  endYear: number;
  adjustmentMode: 'nominal' | 'real';
}

/** Filter change event */
export interface FilterChangeEvent {
  type: string;
  value?: unknown;
  state: FilterState;
}

/** Change view filter change event */
export interface ChangeViewFilterEvent {
  type: string;
  state: ChangeFilterState;
}

/** Tab change event */
export interface TabChangeEvent {
  tab: string;
}

/** GeoJSON feature properties for sectors */
export interface SectorFeatureProperties {
  id: string;
  sector_code?: string;
}

/** District data from the API */
export interface DistrictData {
  name?: string;
  data: Record<string, SectorData>;
}

/** Posthog global */
declare global {
  interface Window {
    posthog?: {
      capture(event: string, properties?: Record<string, unknown>): void;
    };
    sa_event?: ((...args: unknown[]) => void) & { q?: unknown[][] };
    HousePriceApp?: unknown;
    CompareModule?: typeof import('./compare-module').CompareModule;
  }
}
