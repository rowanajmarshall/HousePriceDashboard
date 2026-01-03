/**
 * Filters Module
 * Manages filter UI controls and state
 */
const FiltersModule = (function() {
    // Current filter state
    let state = {
        propertyType: 'A', // Default: All Types
        year: new Date().getFullYear() // Default: Current year
    };

    // Callback for filter changes
    let onChangeCallback = null;

    // Property type labels
    const propertyTypeLabels = {
        'A': 'All Types',
        'D': 'Detached',
        'S': 'Semi-Detached',
        'T': 'Terraced',
        'F': 'Flats/Maisonettes'
    };

    /**
     * Initialize filter controls
     * @param {Object} options - Configuration options
     * @param {Function} options.onChange - Callback when filters change
     * @param {number} options.minYear - Minimum year for slider
     * @param {number} options.maxYear - Maximum year for slider
     * @param {string} options.defaultPropertyType - Default property type
     * @param {number} options.defaultYear - Default year
     */
    function init(options = {}) {
        const {
            onChange,
            minYear = 1995,
            maxYear = new Date().getFullYear(),
            defaultPropertyType = 'F',
            defaultYear = maxYear
        } = options;

        onChangeCallback = onChange;

        // Set initial state
        state.propertyType = defaultPropertyType;
        state.year = defaultYear;

        // Initialize property type filter
        initPropertyTypeFilter();

        // Initialize year slider
        initYearSlider(minYear, maxYear, defaultYear);
    }

    /**
     * Initialize property type radio buttons
     */
    function initPropertyTypeFilter() {
        const container = document.getElementById('property-type-filter');
        if (!container) return;

        const radios = container.querySelectorAll('input[type="radio"]');
        radios.forEach(radio => {
            // Set initial checked state
            if (radio.value === state.propertyType) {
                radio.checked = true;
            }

            // Add change listener
            radio.addEventListener('change', function() {
                if (this.checked) {
                    const oldType = state.propertyType;
                    state.propertyType = this.value;

                    if (oldType !== state.propertyType && onChangeCallback) {
                        onChangeCallback({
                            type: 'propertyType',
                            value: state.propertyType,
                            state: { ...state }
                        });
                    }
                }
            });
        });
    }

    /**
     * Initialize year slider
     * @param {number} minYear
     * @param {number} maxYear
     * @param {number} defaultYear
     */
    function initYearSlider(minYear, maxYear, defaultYear) {
        const slider = document.getElementById('year-slider');
        const display = document.getElementById('year-value');

        if (!slider || !display) return;

        // Configure slider
        slider.min = minYear;
        slider.max = maxYear;
        slider.value = defaultYear;

        // Update display
        display.textContent = defaultYear;

        // Add input listener (fires continuously while dragging)
        slider.addEventListener('input', function() {
            display.textContent = this.value;
        });

        // Add change listener (fires when released)
        slider.addEventListener('change', function() {
            const newYear = parseInt(this.value, 10);
            const oldYear = state.year;
            state.year = newYear;

            if (oldYear !== newYear && onChangeCallback) {
                onChangeCallback({
                    type: 'year',
                    value: newYear,
                    state: { ...state }
                });
            }
        });
    }

    /**
     * Get current filter state
     * @returns {Object}
     */
    function getState() {
        return { ...state };
    }

    /**
     * Get property type label
     * @param {string} code - Property type code
     * @returns {string}
     */
    function getPropertyTypeLabel(code) {
        return propertyTypeLabels[code] || code;
    }

    /**
     * Set filter values programmatically
     * @param {Object} newState - New filter state
     * @param {boolean} triggerCallback - Whether to trigger onChange callback
     */
    function setState(newState, triggerCallback = true) {
        const changed = {};

        if (newState.propertyType && newState.propertyType !== state.propertyType) {
            state.propertyType = newState.propertyType;
            changed.propertyType = true;

            // Update radio button
            const radio = document.querySelector(`input[name="property-type"][value="${state.propertyType}"]`);
            if (radio) {
                radio.checked = true;
            }
        }

        if (newState.year && newState.year !== state.year) {
            state.year = newState.year;
            changed.year = true;

            // Update slider
            const slider = document.getElementById('year-slider');
            const display = document.getElementById('year-value');
            if (slider) slider.value = state.year;
            if (display) display.textContent = state.year;
        }

        if (triggerCallback && onChangeCallback && Object.keys(changed).length > 0) {
            onChangeCallback({
                type: 'multiple',
                changed: changed,
                state: { ...state }
            });
        }
    }

    /**
     * Disable all filter controls
     */
    function disable() {
        const controls = document.querySelectorAll('#property-type-filter input, #year-slider');
        controls.forEach(el => el.disabled = true);
    }

    /**
     * Enable all filter controls
     */
    function enable() {
        const controls = document.querySelectorAll('#property-type-filter input, #year-slider');
        controls.forEach(el => el.disabled = false);
    }

    // Public API
    return {
        init,
        getState,
        getPropertyTypeLabel,
        setState,
        disable,
        enable
    };
})();
