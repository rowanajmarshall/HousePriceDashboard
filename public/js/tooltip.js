/**
 * Tooltip Module
 * Handles display and interaction of sector information tooltips
 */
const TooltipModule = (function() {
    // Active tooltip element
    let activeTooltip = null;

    // Reference to map container for positioning
    let mapContainer = null;

    /**
     * Initialize the tooltip module
     * @param {HTMLElement} container - Map container element
     */
    function init(container) {
        mapContainer = container;

        // Listen for sector click events
        document.addEventListener('sectorClick', handleSectorClick);

        // Close tooltip when clicking outside
        document.addEventListener('click', function(e) {
            if (activeTooltip && !activeTooltip.contains(e.target)) {
                // Check if click was on a map sector (those events are handled separately)
                if (!e.target.closest('.sector-polygon') && !e.target.closest('.leaflet-interactive')) {
                    close();
                }
            }
        });

        // Close tooltip on escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && activeTooltip) {
                close();
            }
        });
    }

    /**
     * Handle sector click event
     * @param {CustomEvent} e
     */
    function handleSectorClick(e) {
        const { feature, latlng } = e.detail;

        // Get sector info
        const sectorId = feature.properties.id;
        const sectorCode = feature.properties.sector_code || sectorId;

        // Check which view mode we're in
        const viewMode = HeatmapModule.getViewMode();

        if (viewMode === 'change') {
            // Get change view filter state
            const changeState = FiltersModule.getChangeState();
            const adjustInflation = changeState.adjustmentMode === 'real';
            const changeData = DataLoader.getPriceChange(
                sectorId,
                changeState.startYear,
                changeState.endYear,
                changeState.propertyType,
                adjustInflation
            );
            showChangeTooltip(sectorCode, changeData, changeState, latlng);
        } else {
            // Get current filter state
            const filterState = FiltersModule.getState();
            const stats = DataLoader.getPriceStats(sectorId, filterState.year, filterState.propertyType);
            show(sectorCode, stats, filterState, latlng);
        }
    }

    /**
     * Show tooltip with sector data
     * @param {string} sectorCode - Postcode sector code
     * @param {Object|null} stats - Price statistics
     * @param {Object} filterState - Current filter state
     * @param {L.LatLng} latlng - Click position
     */
    function show(sectorCode, stats, filterState, latlng) {
        // Close existing tooltip
        close();

        // Clone the template
        const template = document.getElementById('tooltip-template');
        if (!template) return;

        const tooltip = template.cloneNode(true);
        tooltip.id = 'active-tooltip';
        tooltip.style.display = 'block';

        // Populate content
        tooltip.querySelector('.tooltip-title').textContent = sectorCode;
        tooltip.querySelector('.tooltip-subtitle').textContent =
            `${FiltersModule.getPropertyTypeLabel(filterState.propertyType)} - ${filterState.year}`;

        if (stats) {
            tooltip.querySelector('.average-price').textContent = formatPriceFull(stats.avg);
            tooltip.querySelector('.median-price').textContent = formatPriceFull(stats.median);
            tooltip.querySelector('.transaction-count').textContent =
                `${stats.count.toLocaleString()} ${stats.count === 1 ? 'property' : 'properties'}`;
        } else {
            // No data state
            const content = tooltip.querySelector('.tooltip-content');
            content.innerHTML = '<div class="tooltip-no-data">No sales data available for this combination.</div>';
        }

        // Add close button handler
        const closeBtn = tooltip.querySelector('.tooltip-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                close();
            });
        }

        // Add to DOM
        document.body.appendChild(tooltip);
        activeTooltip = tooltip;

        // Position tooltip
        positionTooltip(tooltip, latlng);
    }

    /**
     * Show tooltip with change data
     * @param {string} sectorCode - Postcode sector code
     * @param {Object|null} changeData - Price change data
     * @param {Object} changeState - Current change filter state
     * @param {L.LatLng} latlng - Click position
     */
    function showChangeTooltip(sectorCode, changeData, changeState, latlng) {
        // Close existing tooltip
        close();

        // Clone the template
        const template = document.getElementById('tooltip-template');
        if (!template) return;

        const tooltip = template.cloneNode(true);
        tooltip.id = 'active-tooltip';
        tooltip.style.display = 'block';

        // Check if we're showing inflation-adjusted values
        const isReal = changeState.adjustmentMode === 'real';
        const modeLabel = isReal ? ' (Real)' : '';

        // Populate content
        tooltip.querySelector('.tooltip-title').textContent = sectorCode;
        tooltip.querySelector('.tooltip-subtitle').textContent =
            `${FiltersModule.getPropertyTypeLabel(changeState.propertyType)} - ${changeState.startYear} to ${changeState.endYear}${modeLabel}`;

        const content = tooltip.querySelector('.tooltip-content');

        if (changeData) {
            // Format the change percentage with color (red = increase, green = decrease)
            const changePercent = changeData.changePercent;
            const changeColor = changePercent >= 0 ? '#c0392b' : '#27ae60';
            const changeSign = changePercent >= 0 ? '+' : '';

            let html = '';

            if (isReal) {
                // Show inflation-adjusted comparison
                html = `
                    <div class="tooltip-row">
                        <span class="tooltip-label">${changeState.startYear} (in ${changeState.endYear} £):</span>
                        <span class="tooltip-value">${formatPriceFull(changeData.startPrice)}</span>
                    </div>
                    <div class="tooltip-row" style="font-size: 11px; color: #888;">
                        <span class="tooltip-label">Nominal:</span>
                        <span class="tooltip-value">${formatPriceFull(changeData.nominalStartPrice)}</span>
                    </div>
                    <div class="tooltip-row" style="margin-top: 6px;">
                        <span class="tooltip-label">${changeState.endYear} Avg:</span>
                        <span class="tooltip-value">${formatPriceFull(changeData.endPrice)}</span>
                    </div>
                `;
            } else {
                // Show nominal values
                html = `
                    <div class="tooltip-row">
                        <span class="tooltip-label">${changeState.startYear} Avg:</span>
                        <span class="tooltip-value">${formatPriceFull(changeData.startPrice)}</span>
                    </div>
                    <div class="tooltip-row">
                        <span class="tooltip-label">${changeState.endYear} Avg:</span>
                        <span class="tooltip-value">${formatPriceFull(changeData.endPrice)}</span>
                    </div>
                `;
            }

            html += `
                <div class="tooltip-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e0e0e0;">
                    <span class="tooltip-label">${isReal ? 'Real Change:' : 'Change:'}</span>
                    <span class="tooltip-value" style="color: ${changeColor}; font-size: 16px;">
                        ${changeSign}${Math.round(changePercent)}%
                    </span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">Amount:</span>
                    <span class="tooltip-value" style="color: ${changeColor};">
                        ${changeSign}${formatPriceFull(changeData.changeAmount)}
                    </span>
                </div>
            `;

            content.innerHTML = html;
        } else {
            content.innerHTML = '<div class="tooltip-no-data">No comparable data available for this period.</div>';
        }

        // Add close button handler
        const closeBtn = tooltip.querySelector('.tooltip-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                close();
            });
        }

        // Add to DOM
        document.body.appendChild(tooltip);
        activeTooltip = tooltip;

        // Position tooltip
        positionTooltip(tooltip, latlng);
    }

    /**
     * Position tooltip near click location
     * @param {HTMLElement} tooltip
     * @param {L.LatLng} latlng
     */
    function positionTooltip(tooltip, latlng) {
        if (!mapContainer) return;

        // Get map container position
        const map = MapModule.getMap();
        if (!map) return;

        // Convert latlng to pixel coordinates
        const point = map.latLngToContainerPoint(latlng);

        // Get map container bounds
        const containerRect = mapContainer.getBoundingClientRect();

        // Calculate tooltip position (offset from click)
        const offsetX = 15;
        const offsetY = 15;

        let left = containerRect.left + point.x + offsetX;
        let top = containerRect.top + point.y + offsetY;

        // Get tooltip dimensions
        const tooltipRect = tooltip.getBoundingClientRect();
        const tooltipWidth = tooltipRect.width || 250;
        const tooltipHeight = tooltipRect.height || 150;

        // Adjust if tooltip would go off right edge
        if (left + tooltipWidth > window.innerWidth - 10) {
            left = containerRect.left + point.x - tooltipWidth - offsetX;
        }

        // Adjust if tooltip would go off bottom edge
        if (top + tooltipHeight > window.innerHeight - 10) {
            top = containerRect.top + point.y - tooltipHeight - offsetY;
        }

        // Ensure tooltip doesn't go off left or top edge
        left = Math.max(10, left);
        top = Math.max(10, top);

        // Apply position
        tooltip.style.position = 'fixed';
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }

    /**
     * Close the active tooltip
     */
    function close() {
        if (activeTooltip) {
            activeTooltip.remove();
            activeTooltip = null;
        }
    }

    /**
     * Format price with full formatting
     * @param {number} price
     * @returns {string}
     */
    function formatPriceFull(price) {
        if (price === null || price === undefined) {
            return '-';
        }
        return '£' + price.toLocaleString('en-GB');
    }

    /**
     * Check if tooltip is currently visible
     * @returns {boolean}
     */
    function isVisible() {
        return activeTooltip !== null;
    }

    // Public API
    return {
        init,
        show,
        close,
        isVisible
    };
})();
