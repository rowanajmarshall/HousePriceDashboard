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

        // Get current filter state
        const filterState = FiltersModule.getState();

        // Get price data for this sector
        const sectorId = feature.properties.id;
        const sectorCode = feature.properties.sector_code || sectorId;
        const stats = DataLoader.getPriceStats(sectorId, filterState.year, filterState.propertyType);

        // Show tooltip
        show(sectorCode, stats, filterState, latlng);
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
