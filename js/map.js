/**
 * Map Module
 * Handles Leaflet map initialization and configuration
 */
const MapModule = (function() {
    // Map instance
    let map = null;

    // Configuration
    const config = {
        // Center of UK (approximately)
        defaultCenter: [54.5, -3.5],
        defaultZoom: 6,
        minZoom: 5,
        maxZoom: 14,
        // UK bounds to restrict panning
        maxBounds: [
            [49.5, -11], // Southwest
            [61, 3]      // Northeast
        ]
    };

    /**
     * Initialize the Leaflet map
     * @param {string} containerId - ID of the container element
     * @returns {L.Map} Leaflet map instance
     */
    function init(containerId) {
        if (map) {
            return map;
        }

        // Create map
        map = L.map(containerId, {
            center: config.defaultCenter,
            zoom: config.defaultZoom,
            minZoom: config.minZoom,
            maxZoom: config.maxZoom,
            maxBounds: config.maxBounds,
            maxBoundsViscosity: 1.0
        });

        // Add tile layer (OpenStreetMap)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Data: <a href="https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads">UK Land Registry</a>'
        }).addTo(map);

        // Add scale control
        L.control.scale({
            imperial: false,
            metric: true,
            position: 'bottomright'
        }).addTo(map);

        return map;
    }

    /**
     * Get the map instance
     * @returns {L.Map|null}
     */
    function getMap() {
        return map;
    }

    /**
     * Fit the map to specific bounds
     * @param {L.LatLngBounds} bounds
     */
    function fitBounds(bounds) {
        if (map && bounds) {
            map.fitBounds(bounds, {
                padding: [20, 20]
            });
        }
    }

    /**
     * Reset view to default UK view
     */
    function resetView() {
        if (map) {
            map.setView(config.defaultCenter, config.defaultZoom);
        }
    }

    /**
     * Get current zoom level
     * @returns {number}
     */
    function getZoom() {
        return map ? map.getZoom() : config.defaultZoom;
    }

    /**
     * Invalidate map size (call after container resize)
     */
    function invalidateSize() {
        if (map) {
            map.invalidateSize();
        }
    }

    // Public API
    return {
        init,
        getMap,
        fitBounds,
        resetView,
        getZoom,
        invalidateSize
    };
})();
