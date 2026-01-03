/**
 * Heatmap Module
 * Handles rendering of postcode sector polygons with price-based coloring
 */
const HeatmapModule = (function() {
    // Layer reference
    let geoJsonLayer = null;

    // Current state
    let currentYear = null;
    let currentPropertyType = null;
    let currentPriceRange = null;

    // Colors
    const colors = {
        low: { r: 0, g: 0, b: 255 },      // Blue
        high: { r: 255, g: 0, b: 0 },      // Red
        noData: '#cccccc'
    };

    /**
     * Calculate color based on price value
     * @param {number} price - The price value
     * @param {number} min - Minimum price in range
     * @param {number} max - Maximum price in range
     * @returns {string} RGB color string
     */
    function getColor(price, min, max) {
        if (price === null || price === undefined) {
            return colors.noData;
        }

        // Clamp price to range
        const clampedPrice = Math.max(min, Math.min(max, price));

        // Normalize to 0-1 range
        const range = max - min;
        if (range === 0) {
            return `rgb(128, 0, 128)`; // Purple for equal min/max
        }

        const normalized = (clampedPrice - min) / range;

        // Interpolate between blue and red through purple
        const r = Math.round(colors.low.r + normalized * (colors.high.r - colors.low.r));
        const g = Math.round(colors.low.g + normalized * (colors.high.g - colors.low.g));
        const b = Math.round(colors.low.b + normalized * (colors.high.b - colors.low.b));

        return `rgb(${r}, ${g}, ${b})`;
    }

    /**
     * Style function for GeoJSON features
     * @param {Object} feature - GeoJSON feature
     * @returns {Object} Leaflet path options
     */
    function getFeatureStyle(feature) {
        const sectorId = feature.properties.id;
        const stats = DataLoader.getPriceStats(sectorId, currentYear, currentPropertyType);

        let fillColor = colors.noData;
        let fillOpacity = 0.5; // Lower opacity for no-data

        if (stats && stats.avg && currentPriceRange) {
            fillColor = getColor(stats.avg, currentPriceRange.min, currentPriceRange.max);
            fillOpacity = 0.7;
        }

        return {
            fillColor: fillColor,
            fillOpacity: fillOpacity,
            color: '#333333',
            weight: 0.5,
            opacity: 0.4
        };
    }

    /**
     * Event handlers for polygon interactions
     */
    function onEachFeature(feature, layer) {
        layer.on({
            click: function(e) {
                // Emit custom event for tooltip handling
                const event = new CustomEvent('sectorClick', {
                    detail: {
                        feature: feature,
                        latlng: e.latlng,
                        layer: layer
                    }
                });
                document.dispatchEvent(event);
            },
            mouseover: function(e) {
                const layer = e.target;
                layer.setStyle({
                    weight: 2,
                    opacity: 0.8,
                    fillOpacity: 0.85
                });
                layer.bringToFront();
            },
            mouseout: function(e) {
                if (geoJsonLayer) {
                    geoJsonLayer.resetStyle(e.target);
                }
            }
        });
    }

    /**
     * Initialize the heatmap layer
     * @param {L.Map} map - Leaflet map instance
     * @param {Object} geojson - GeoJSON data
     * @param {number} year - Initial year
     * @param {string} propertyType - Initial property type
     */
    async function init(map, geojson, year, propertyType) {
        currentYear = year;
        currentPropertyType = propertyType;

        // Ensure price data is loaded
        await DataLoader.loadPriceData(year);

        // Calculate price range
        currentPriceRange = DataLoader.getPriceRange(year, propertyType);

        // Create GeoJSON layer
        geoJsonLayer = L.geoJSON(geojson, {
            style: getFeatureStyle,
            onEachFeature: onEachFeature
        }).addTo(map);

        // Update legend
        updateLegend();

        return geoJsonLayer;
    }

    /**
     * Update heatmap with new filters
     * @param {number} year - Year to display
     * @param {string} propertyType - Property type to display
     */
    async function update(year, propertyType) {
        if (!geoJsonLayer) {
            console.warn('Heatmap not initialized');
            return;
        }

        const yearChanged = year !== currentYear;
        const typeChanged = propertyType !== currentPropertyType;

        if (!yearChanged && !typeChanged) {
            return;
        }

        currentYear = year;
        currentPropertyType = propertyType;

        // Load price data if year changed
        if (yearChanged) {
            await DataLoader.loadPriceData(year);
        }

        // Recalculate price range
        currentPriceRange = DataLoader.getPriceRange(year, propertyType);

        // Update all polygon styles
        geoJsonLayer.eachLayer(function(layer) {
            const newStyle = getFeatureStyle(layer.feature);
            layer.setStyle(newStyle);
        });

        // Update legend
        updateLegend();
    }

    /**
     * Update the legend with current price range
     */
    function updateLegend() {
        const minEl = document.getElementById('legend-min');
        const maxEl = document.getElementById('legend-max');

        if (currentPriceRange) {
            minEl.textContent = formatPrice(currentPriceRange.min);
            maxEl.textContent = formatPrice(currentPriceRange.max);
        } else {
            minEl.textContent = '-';
            maxEl.textContent = '-';
        }
    }

    /**
     * Format price for display
     * @param {number} price - Price in pounds
     * @returns {string} Formatted price string
     */
    function formatPrice(price) {
        if (price === null || price === undefined) {
            return '-';
        }

        if (price >= 1000000) {
            return '£' + (price / 1000000).toFixed(1) + 'M';
        } else if (price >= 1000) {
            return '£' + Math.round(price / 1000) + 'k';
        } else {
            return '£' + price;
        }
    }

    /**
     * Get the current price range
     * @returns {Object|null}
     */
    function getPriceRange() {
        return currentPriceRange;
    }

    /**
     * Get current filter state
     * @returns {Object}
     */
    function getState() {
        return {
            year: currentYear,
            propertyType: currentPropertyType
        };
    }

    /**
     * Destroy the heatmap layer
     */
    function destroy() {
        if (geoJsonLayer) {
            geoJsonLayer.remove();
            geoJsonLayer = null;
        }
        currentYear = null;
        currentPropertyType = null;
        currentPriceRange = null;
    }

    // Public API
    return {
        init,
        update,
        getColor,
        formatPrice,
        getPriceRange,
        getState,
        destroy
    };
})();
