import type { PriceStats, YearData, InflationData, PriceRange, PriceChange, SectorData, DistrictData } from './types';

// Cache for loaded data
const cache: {
  boundaries: GeoJSON.FeatureCollection | null;
  prices: Record<number, YearData>;
  inflation: InflationData | null;
  districtNames: Record<string, string> | null;
  districts: Record<string, DistrictData>;
} = {
  boundaries: null,
  prices: {},
  inflation: null,
  districtNames: null,
  districts: {},
};

// Configuration
const config = {
  boundariesPath: 'data/boundaries.geojson',
  pricesPath: '/api/data/prices',
  inflationPath: '/api/data/inflation',
};

// Cache API storage name
const CACHE_NAME = 'house-price-v2';

async function getCachedOrFetch(path: string): Promise<unknown> {
  if ('caches' in window) {
    try {
      const storage = await caches.open(CACHE_NAME);
      const cached = await storage.match(path);
      if (cached) {
        return cached.json();
      }
    } catch {
      // Cache API unavailable or failed
    }
  }

  const response = await fetch(path);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  if ('caches' in window) {
    try {
      const storage = await caches.open(CACHE_NAME);
      storage.put(path, response.clone());
    } catch {
      // Cache write failed
    }
  }

  return response.json();
}

export async function loadBoundaries(): Promise<GeoJSON.FeatureCollection> {
  if (cache.boundaries) return cache.boundaries;

  try {
    cache.boundaries = (await getCachedOrFetch(config.boundariesPath)) as GeoJSON.FeatureCollection;
    return cache.boundaries;
  } catch (error) {
    console.error('Error loading boundaries:', error);
    throw error;
  }
}

export async function loadInflation(): Promise<InflationData> {
  if (cache.inflation) return cache.inflation;

  try {
    cache.inflation = (await getCachedOrFetch(config.inflationPath)) as InflationData;
    return cache.inflation;
  } catch (error) {
    console.error('Error loading inflation data:', error);
    throw error;
  }
}

export function adjustForInflation(price: number, fromYear: number, toYear: number): number {
  if (!cache.inflation?.data) return price;

  const fromCPI = cache.inflation.data[fromYear];
  const toCPI = cache.inflation.data[toYear];

  if (!fromCPI || !toCPI) return price;

  return Math.round(price * (toCPI / fromCPI));
}

export async function loadPriceData(year: number): Promise<YearData> {
  if (cache.prices[year]) return cache.prices[year]!;

  try {
    cache.prices[year] = (await getCachedOrFetch(`${config.pricesPath}/${year}`)) as YearData;
    return cache.prices[year]!;
  } catch (error) {
    console.error(`Error loading price data for ${year}:`, error);
    throw error;
  }
}

export async function preloadYears(years: number[]): Promise<void> {
  const promises = years.map((year) => loadPriceData(year).catch(() => null));
  await Promise.all(promises);
}

const PROPERTY_TYPES = ['D', 'S', 'T', 'F'] as const;

function computeAllStats(sectorData: SectorData): PriceStats | null {
  let totalCount = 0;
  let weightedAvgSum = 0;
  const medians: number[] = [];

  for (const propType of PROPERTY_TYPES) {
    const stats = sectorData[propType];
    if (stats) {
      totalCount += stats.count;
      weightedAvgSum += stats.avg * stats.count;
      medians.push(stats.median);
    }
  }

  if (totalCount === 0) return null;

  return {
    avg: Math.round(weightedAvgSum / totalCount),
    median: Math.round(medians.reduce((a, b) => a + b, 0) / medians.length),
    count: totalCount,
  };
}

export function getPriceStats(sectorId: string, year: number, propertyType: string): PriceStats | null {
  const yearData = cache.prices[year];
  if (!yearData?.data?.[sectorId]) return null;

  const sectorData = yearData.data[sectorId]!;

  if (propertyType === 'A' && !sectorData['A']) {
    return computeAllStats(sectorData);
  }

  return sectorData[propertyType] ?? null;
}

export function getAllPrices(year: number, propertyType: string): number[] {
  const yearData = cache.prices[year];
  if (!yearData?.data) return [];

  const prices: number[] = [];
  for (const sectorId in yearData.data) {
    const sectorData = yearData.data[sectorId];
    if (!sectorData) continue;

    if (propertyType === 'A') {
      if (sectorData['A']?.avg) {
        prices.push(sectorData['A'].avg);
      } else {
        const allStats = computeAllStats(sectorData);
        if (allStats) prices.push(allStats.avg);
      }
    } else if (sectorData[propertyType]?.avg) {
      prices.push(sectorData[propertyType]!.avg);
    }
  }
  return prices;
}

export function getPriceRange(year: number, propertyType: string): PriceRange | null {
  const prices = getAllPrices(year, propertyType);
  if (prices.length === 0) return null;

  prices.sort((a, b) => a - b);
  const p5Index = Math.floor(prices.length * 0.05);
  const p95Index = Math.floor(prices.length * 0.95);

  return {
    min: prices[p5Index]!,
    max: prices[p95Index]!,
    absoluteMin: prices[0]!,
    absoluteMax: prices[prices.length - 1]!,
  };
}

export function getPriceChange(
  sectorId: string,
  startYear: number,
  endYear: number,
  propertyType: string,
  adjustInflationFlag = false
): PriceChange | null {
  const startStats = getPriceStats(sectorId, startYear, propertyType);
  const endStats = getPriceStats(sectorId, endYear, propertyType);

  if (!startStats?.avg || !endStats?.avg) return null;

  const nominalStartPrice = startStats.avg;
  const nominalEndPrice = endStats.avg;

  let startPrice: number, endPrice: number;
  if (adjustInflationFlag) {
    startPrice = adjustForInflation(nominalStartPrice, startYear, endYear);
    endPrice = nominalEndPrice;
  } else {
    startPrice = nominalStartPrice;
    endPrice = nominalEndPrice;
  }

  const changeAmount = endPrice - startPrice;
  const changePercent = (changeAmount / startPrice) * 100;

  return {
    startPrice,
    endPrice,
    nominalStartPrice,
    nominalEndPrice,
    changeAmount,
    changePercent,
    startCount: startStats.count,
    endCount: endStats.count,
    adjustedForInflation: adjustInflationFlag,
  };
}

export function getAllPriceChanges(
  startYear: number,
  endYear: number,
  propertyType: string,
  adjustInflationFlag = false
): number[] {
  const startData = cache.prices[startYear];
  const endData = cache.prices[endYear];

  if (!startData?.data || !endData?.data) return [];

  const changes: number[] = [];
  const sectorIds = new Set([...Object.keys(startData.data), ...Object.keys(endData.data)]);

  for (const sectorId of sectorIds) {
    const change = getPriceChange(sectorId, startYear, endYear, propertyType, adjustInflationFlag);
    if (change) changes.push(change.changePercent);
  }

  return changes;
}

export function getChangeRange(
  startYear: number,
  endYear: number,
  propertyType: string,
  adjustInflationFlag = false
): PriceRange | null {
  const changes = getAllPriceChanges(startYear, endYear, propertyType, adjustInflationFlag);
  if (changes.length === 0) return null;

  changes.sort((a, b) => a - b);
  const p5Index = Math.floor(changes.length * 0.05);
  const p95Index = Math.floor(changes.length * 0.95);

  return {
    min: changes[p5Index]!,
    max: changes[p95Index]!,
    absoluteMin: changes[0]!,
    absoluteMax: changes[changes.length - 1]!,
  };
}

export async function loadDistrictNames(): Promise<Record<string, string>> {
  if (cache.districtNames) return cache.districtNames;

  try {
    cache.districtNames = (await getCachedOrFetch('/api/data/district-names')) as Record<string, string>;
    return cache.districtNames;
  } catch (error) {
    console.error('Error loading district names:', error);
    throw error;
  }
}

export async function loadDistrictData(code: string): Promise<DistrictData> {
  if (cache.districts[code]) return cache.districts[code]!;

  try {
    cache.districts[code] = (await getCachedOrFetch(`/api/data/district/${code}`)) as DistrictData;
    return cache.districts[code]!;
  } catch (error) {
    console.error(`Error loading district data for ${code}:`, error);
    throw error;
  }
}

export function getDistrictName(code: string): string | null {
  if (!cache.districtNames) return null;
  return cache.districtNames[code] ?? null;
}

export function getDistrictNames(): Record<string, string> | null {
  return cache.districtNames ?? null;
}

export function isYearLoaded(year: number): boolean {
  return !!cache.prices[year];
}

export function areBoundariesLoaded(): boolean {
  return !!cache.boundaries;
}

export function getAvailableYears(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let year = 1995; year <= currentYear; year++) {
    years.push(year);
  }
  return years;
}

export function clearCache(): void {
  cache.boundaries = null;
  cache.prices = {};
}
