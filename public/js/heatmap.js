/**
 * Heatmap Module
 * Handles rendering of postcode sector polygons with price-based coloring
 */
const HeatmapModule = (function() {
    // Layer reference
    let geoJsonLayer = null;

    // Current view mode
    let viewMode = 'price'; // 'price' or 'change'

    // Price view state
    let currentYear = null;
    let currentPropertyType = null;
    let currentPriceRange = null;

    // Change view state
    let currentStartYear = null;
    let currentEndYear = null;
    let currentChangePropertyType = null;
    let currentChangeRange = null;
    let currentAdjustInflation = false;

    // Colors for price view
    const colors = {
        low: { r: 0, g: 0, b: 255 },      // Blue
        high: { r: 255, g: 0, b: 0 },      // Red
        noData: '#cccccc'
    };

    // Colors for change view (red = price increase, green = price decrease)
    const changeColors = {
        decrease: { r: 30, g: 132, b: 73 },    // Dark green (prices fell)
        neutral: { r: 255, g: 255, b: 255 },   // White
        increase: { r: 192, g: 57, b: 43 },    // Dark red (prices rose)
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
     * Calculate color based on percentage change
     * @param {number} changePercent - The percentage change
     * @param {number} min - Minimum change in range (negative)
     * @param {number} max - Maximum change in range (positive)
     * @returns {string} RGB color string
     */
    function getChangeColor(changePercent, min, max) {
        if (changePercent === null || changePercent === undefined) {
            return changeColors.noData;
        }

        // Normalize: negative values go from red to white, positive from white to green
        let r, g, b;

        if (changePercent <= 0) {
            // Red to white (for negative/zero change)
            const normalizedNeg = min === 0 ? 0 : Math.max(0, Math.min(1, changePercent / min));
            r = Math.round(changeColors.neutral.r + normalizedNeg * (changeColors.decrease.r - changeColors.neutral.r));
            g = Math.round(changeColors.neutral.g + normalizedNeg * (changeColors.decrease.g - changeColors.neutral.g));
            b = Math.round(changeColors.neutral.b + normalizedNeg * (changeColors.decrease.b - changeColors.neutral.b));
        } else {
            // White to green (for positive change)
            const normalizedPos = max === 0 ? 0 : Math.max(0, Math.min(1, changePercent / max));
            r = Math.round(changeColors.neutral.r + normalizedPos * (changeColors.increase.r - changeColors.neutral.r));
            g = Math.round(changeColors.neutral.g + normalizedPos * (changeColors.increase.g - changeColors.neutral.g));
            b = Math.round(changeColors.neutral.b + normalizedPos * (changeColors.increase.b - changeColors.neutral.b));
        }

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
            color: fillColor,  // Match stroke to fill to eliminate seam artifacts
            weight: 1,
            opacity: 1
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
                    color: '#333333',  // Dark border on hover for contrast
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.85
                });
                layer.bringToFront();
            },
            mouseout: function(e) {
                if (geoJsonLayer) {
                    // Apply the correct style based on current view mode
                    const layer = e.target;
                    if (viewMode === 'change') {
                        layer.setStyle(getChangeFeatureStyle(layer.feature));
                    } else {
                        layer.setStyle(getFeatureStyle(layer.feature));
                    }
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
     * Style function for change view
     * @param {Object} feature - GeoJSON feature
     * @returns {Object} Leaflet path options
     */
    function getChangeFeatureStyle(feature) {
        const sectorId = feature.properties.id;
        const change = DataLoader.getPriceChange(
            sectorId,
            currentStartYear,
            currentEndYear,
            currentChangePropertyType,
            currentAdjustInflation
        );

        let fillColor = changeColors.noData;
        let fillOpacity = 0.5;

        if (change && currentChangeRange) {
            fillColor = getChangeColor(
                change.changePercent,
                currentChangeRange.min,
                currentChangeRange.max
            );
            fillOpacity = 0.7;
        }

        return {
            fillColor: fillColor,
            fillOpacity: fillOpacity,
            color: fillColor,
            weight: 1,
            opacity: 1
        };
    }

    /**
     * Update heatmap with change view data
     * @param {number} startYear - Start year
     * @param {number} endYear - End year
     * @param {string} propertyType - Property type
     * @param {boolean} adjustInflation - Whether to adjust for inflation
     */
    async function updateChangeView(startYear, endYear, propertyType, adjustInflation = false) {
        if (!geoJsonLayer) {
            console.warn('Heatmap not initialized');
            return;
        }

        viewMode = 'change';

        // Load both years' data
        await Promise.all([
            DataLoader.loadPriceData(startYear),
            DataLoader.loadPriceData(endYear)
        ]);

        currentStartYear = startYear;
        currentEndYear = endYear;
        currentChangePropertyType = propertyType;
        currentAdjustInflation = adjustInflation;

        // Calculate change range
        currentChangeRange = DataLoader.getChangeRange(startYear, endYear, propertyType, adjustInflation);

        // Update all polygon styles
        geoJsonLayer.eachLayer(function(layer) {
            const newStyle = getChangeFeatureStyle(layer.feature);
            layer.setStyle(newStyle);
        });

        // Update legend for change view
        updateChangeLegend();
    }

    /**
     * Switch back to price view
     */
    async function switchToPriceView() {
        if (viewMode === 'price') return;

        viewMode = 'price';

        // Recalculate and update with current price view settings
        if (currentYear && currentPropertyType) {
            currentPriceRange = DataLoader.getPriceRange(currentYear, currentPropertyType);

            geoJsonLayer.eachLayer(function(layer) {
                const newStyle = getFeatureStyle(layer.feature);
                layer.setStyle(newStyle);
            });

            updateLegend();
        }
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
     * Update the legend for change view
     */
    function updateChangeLegend() {
        const minEl = document.getElementById('change-legend-min');
        const maxEl = document.getElementById('change-legend-max');

        if (currentChangeRange && minEl && maxEl) {
            minEl.textContent = formatPercent(currentChangeRange.min);
            maxEl.textContent = formatPercent(currentChangeRange.max);
        }
    }

    /**
     * Format percentage for display
     * @param {number} percent - Percentage value
     * @returns {string} Formatted percentage string
     */
    function formatPercent(percent) {
        if (percent === null || percent === undefined) {
            return '-';
        }
        const sign = percent >= 0 ? '+' : '';
        return sign + Math.round(percent) + '%';
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
     * Get current view mode
     * @returns {string} 'price' or 'change'
     */
    function getViewMode() {
        return viewMode;
    }

    /**
     * Get current filter state
     * @returns {Object}
     */
    function getState() {
        if (viewMode === 'change') {
            return {
                viewMode: 'change',
                startYear: currentStartYear,
                endYear: currentEndYear,
                propertyType: currentChangePropertyType
            };
        }
        return {
            viewMode: 'price',
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
        updateChangeView,
        switchToPriceView,
        getColor,
        getChangeColor,
        formatPrice,
        formatPercent,
        getPriceRange,
        getViewMode,
        getState,
        destroy
    };
})();
