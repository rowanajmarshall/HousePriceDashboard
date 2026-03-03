/**
 * Data Loader Module
 * Handles fetching and caching of geographic boundaries and price data
 */
const DataLoader = (function() {
    // Cache for loaded data
    const cache = {
        boundaries: null,
        prices: {}, // Keyed by year
        inflation: null, // CPI data
        districtNames: null // { "AL1": "St Albans", ... }
    };

    // Configuration
    const config = {
        boundariesPath: 'data/boundaries.geojson',
        pricesPath: 'data/prices', // Will append /{year}.json
        inflationPath: 'data/inflation.json'
    };

    // Cache API storage name — increment to bust persisted cache
    const CACHE_NAME = 'house-price-v1';

    /**
     * Fetch a JSON resource, using the Cache API for persistence across page loads.
     * Falls back to a plain fetch if the Cache API is unavailable or errors.
     * @param {string} path - Relative URL to fetch
     * @returns {Promise<any>} Parsed JSON
     */
    async function getCachedOrFetch(path) {
        if ('caches' in window) {
            try {
                const storage = await caches.open(CACHE_NAME);
                const cached = await storage.match(path);
                if (cached) {
                    return cached.json();
                }
            } catch (err) {
                // Cache API unavailable or failed — fall through to network
            }
        }

        const response = await fetch(path);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        if ('caches' in window) {
            try {
                const storage = await caches.open(CACHE_NAME);
                storage.put(path, response.clone()); // fire-and-forget
            } catch (err) {
                // Cache write failed — that's OK, we still have the response
            }
        }

        return response.json();
    }

    /**
     * Load GeoJSON boundaries for all postcode sectors
     * @returns {Promise<Object>} GeoJSON FeatureCollection
     */
    async function loadBoundaries() {
        if (cache.boundaries) {
            return cache.boundaries;
        }

        try {
            cache.boundaries = await getCachedOrFetch(config.boundariesPath);
            return cache.boundaries;
        } catch (error) {
            console.error('Error loading boundaries:', error);
            throw error;
        }
    }

    /**
     * Load inflation data
     * @returns {Promise<Object>} Inflation data
     */
    async function loadInflation() {
        if (cache.inflation) {
            return cache.inflation;
        }

        try {
            cache.inflation = await getCachedOrFetch(config.inflationPath);
            return cache.inflation;
        } catch (error) {
            console.error('Error loading inflation data:', error);
            throw error;
        }
    }

    /**
     * Adjust a price for inflation (convert to end year's terms)
     * @param {number} price - Nominal price
     * @param {number} fromYear - Year the price is from
     * @param {number} toYear - Year to adjust to
     * @returns {number} Real price in toYear's terms
     */
    function adjustForInflation(price, fromYear, toYear) {
        if (!cache.inflation || !cache.inflation.data) {
            return price; // Return nominal if no inflation data
        }

        const fromCPI = cache.inflation.data[fromYear];
        const toCPI = cache.inflation.data[toYear];

        if (!fromCPI || !toCPI) {
            return price;
        }

        return Math.round(price * (toCPI / fromCPI));
    }

    /**
     * Load price data for a specific year
     * @param {number} year - The year to load
     * @returns {Promise<Object>} Price data object keyed by sector ID
     */
    async function loadPriceData(year) {
        if (cache.prices[year]) {
            return cache.prices[year];
        }

        try {
            cache.prices[year] = await getCachedOrFetch(`${config.pricesPath}/${year}.json`);
            return cache.prices[year];
        } catch (error) {
            console.error(`Error loading price data for ${year}:`, error);
            throw error;
        }
    }

    /**
     * Preload price data for multiple years
     * @param {number[]} years - Array of years to preload
     */
    async function preloadYears(years) {
        const promises = years.map(year => loadPriceData(year).catch(() => null));
        await Promise.all(promises);
    }

    // Property types for aggregation
    const PROPERTY_TYPES = ['D', 'S', 'T', 'F'];

    /**
     * Get price statistics for a specific sector, year, and property type
     * @param {string} sectorId - Postcode sector ID
     * @param {number} year - Year
     * @param {string} propertyType - Property type code (D, S, T, F, A)
     * @returns {Object|null} Price statistics or null if not available
     */
    function getPriceStats(sectorId, year, propertyType) {
        const yearData = cache.prices[year];
        if (!yearData || !yearData.data || !yearData.data[sectorId]) {
            return null;
        }

        const sectorData = yearData.data[sectorId];

        // If "All" is requested and not pre-computed, calculate on the fly
        if (propertyType === 'A' && !sectorData['A']) {
            return computeAllStats(sectorData);
        }

        if (!sectorData[propertyType]) {
            return null;
        }

        return sectorData[propertyType];
    }

    /**
     * Compute aggregate stats for all property types
     * @param {Object} sectorData - Data for a single sector
     * @returns {Object|null} Aggregated statistics
     */
    function computeAllStats(sectorData) {
        let totalCount = 0;
        let weightedAvgSum = 0;
        let medians = [];

        for (const propType of PROPERTY_TYPES) {
            if (sectorData[propType]) {
                const stats = sectorData[propType];
                totalCount += stats.count;
                weightedAvgSum += stats.avg * stats.count;
                medians.push(stats.median);
            }
        }

        if (totalCount === 0) {
            return null;
        }

        return {
            avg: Math.round(weightedAvgSum / totalCount),
            median: Math.round(medians.reduce((a, b) => a + b, 0) / medians.length),
            count: totalCount
        };
    }

    /**
     * Get all prices for a given year and property type
     * Used for calculating color scale ranges
     * @param {number} year - Year
     * @param {string} propertyType - Property type code
     * @returns {number[]} Array of average prices
     */
    function getAllPrices(year, propertyType) {
        const yearData = cache.prices[year];
        if (!yearData || !yearData.data) {
            return [];
        }

        const prices = [];
        for (const sectorId in yearData.data) {
            const sectorData = yearData.data[sectorId];
            if (!sectorData) continue;

            // Handle "All" property type
            if (propertyType === 'A') {
                // Use pre-computed if available, otherwise compute on the fly
                if (sectorData['A'] && sectorData['A'].avg) {
                    prices.push(sectorData['A'].avg);
                } else {
                    const allStats = computeAllStats(sectorData);
                    if (allStats) {
                        prices.push(allStats.avg);
                    }
                }
            } else if (sectorData[propertyType] && sectorData[propertyType].avg) {
                prices.push(sectorData[propertyType].avg);
            }
        }
        return prices;
    }

    /**
     * Calculate min and max prices for color scale
     * @param {number} year - Year
     * @param {string} propertyType - Property type code
     * @returns {Object} { min, max } or null if no data
     */
    function getPriceRange(year, propertyType) {
        const prices = getAllPrices(year, propertyType);
        if (prices.length === 0) {
            return null;
        }

        // Use percentiles to avoid outliers skewing the scale
        prices.sort((a, b) => a - b);
        const p5Index = Math.floor(prices.length * 0.05);
        const p95Index = Math.floor(prices.length * 0.95);

        return {
            min: prices[p5Index],
            max: prices[p95Index],
            absoluteMin: prices[0],
            absoluteMax: prices[prices.length - 1]
        };
    }

    /**
     * Get price change data for a sector between two years
     * @param {string} sectorId - Postcode sector ID
     * @param {number} startYear - Starting year
     * @param {number} endYear - Ending year
     * @param {string} propertyType - Property type code
     * @param {boolean} adjustInflation - Whether to adjust for inflation
     * @returns {Object|null} Change data or null if insufficient data
     */
    function getPriceChange(sectorId, startYear, endYear, propertyType, adjustInflation = false) {
        const startStats = getPriceStats(sectorId, startYear, propertyType);
        const endStats = getPriceStats(sectorId, endYear, propertyType);

        if (!startStats || !endStats || !startStats.avg || !endStats.avg) {
            return null;
        }

        // Get nominal prices
        const nominalStartPrice = startStats.avg;
        const nominalEndPrice = endStats.avg;

        // Calculate prices to use (adjusted or nominal)
        let startPrice, endPrice;
        if (adjustInflation) {
            // Adjust start price to end year's terms
            startPrice = adjustForInflation(nominalStartPrice, startYear, endYear);
            endPrice = nominalEndPrice;
        } else {
            startPrice = nominalStartPrice;
            endPrice = nominalEndPrice;
        }

        const changeAmount = endPrice - startPrice;
        const changePercent = (changeAmount / startPrice) * 100;

        return {
            startPrice: startPrice,
            endPrice: endPrice,
            nominalStartPrice: nominalStartPrice,
            nominalEndPrice: nominalEndPrice,
            changeAmount: changeAmount,
            changePercent: changePercent,
            startCount: startStats.count,
            endCount: endStats.count,
            adjustedForInflation: adjustInflation
        };
    }

    /**
     * Get all percentage changes for a given year range and property type
     * Used for calculating color scale ranges
     * @param {number} startYear - Starting year
     * @param {number} endYear - Ending year
     * @param {string} propertyType - Property type code
     * @param {boolean} adjustInflation - Whether to adjust for inflation
     * @returns {number[]} Array of percentage changes
     */
    function getAllPriceChanges(startYear, endYear, propertyType, adjustInflation = false) {
        const startData = cache.prices[startYear];
        const endData = cache.prices[endYear];

        if (!startData?.data || !endData?.data) {
            return [];
        }

        const changes = [];

        // Get all sector IDs that exist in both years
        const sectorIds = new Set([
            ...Object.keys(startData.data),
            ...Object.keys(endData.data)
        ]);

        for (const sectorId of sectorIds) {
            const change = getPriceChange(sectorId, startYear, endYear, propertyType, adjustInflation);
            if (change) {
                changes.push(change.changePercent);
            }
        }

        return changes;
    }

    /**
     * Calculate min and max percentage changes for color scale
     * @param {number} startYear - Starting year
     * @param {number} endYear - Ending year
     * @param {string} propertyType - Property type code
     * @param {boolean} adjustInflation - Whether to adjust for inflation
     * @returns {Object} { min, max } or null if no data
     */
    function getChangeRange(startYear, endYear, propertyType, adjustInflation = false) {
        const changes = getAllPriceChanges(startYear, endYear, propertyType, adjustInflation);
        if (changes.length === 0) {
            return null;
        }

        changes.sort((a, b) => a - b);
        const p5Index = Math.floor(changes.length * 0.05);
        const p95Index = Math.floor(changes.length * 0.95);

        return {
            min: changes[p5Index],
            max: changes[p95Index],
            absoluteMin: changes[0],
            absoluteMax: changes[changes.length - 1]
        };
    }

    /**
     * Load human-readable names for postcode districts
     * @returns {Promise<Object>} Map of district code → name
     */
    async function loadDistrictNames() {
        if (cache.districtNames) {
            return cache.districtNames;
        }

        try {
            cache.districtNames = await getCachedOrFetch('data/district-names.json');
            return cache.districtNames;
        } catch (error) {
            console.error('Error loading district names:', error);
            throw error;
        }
    }

    /**
     * Get the human-readable name for a postcode district
     * @param {string} code - District code (e.g. "AL1")
     * @returns {string|null} Name or null if not loaded / not found
     */
    function getDistrictName(code) {
        if (!cache.districtNames) return null;
        return cache.districtNames[code] || null;
    }

    /**
     * Check if data is loaded for a specific year
     * @param {number} year - Year to check
     * @returns {boolean}
     */
    function isYearLoaded(year) {
        return !!cache.prices[year];
    }

    /**
     * Check if boundaries are loaded
     * @returns {boolean}
     */
    function areBoundariesLoaded() {
        return !!cache.boundaries;
    }

    /**
     * Get list of available years
     * @returns {number[]}
     */
    function getAvailableYears() {
        // Return years from 1995 to current year
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let year = 1995; year <= currentYear; year++) {
            years.push(year);
        }
        return years;
    }

    /**
     * Clear the cache (useful for testing or memory management)
     */
    function clearCache() {
        cache.boundaries = null;
        cache.prices = {};
    }

    // Public API
    return {
        loadBoundaries,
        loadPriceData,
        loadInflation,
        loadDistrictNames,
        getDistrictName,
        preloadYears,
        getPriceStats,
        getAllPrices,
        getPriceRange,
        getPriceChange,
        getAllPriceChanges,
        getChangeRange,
        adjustForInflation,
        isYearLoaded,
        areBoundariesLoaded,
        getAvailableYears,
        clearCache
    };
})();
