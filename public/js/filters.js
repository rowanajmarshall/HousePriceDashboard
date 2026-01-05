/**
 * Filters Module
 * Manages filter UI controls and state for both Price View and Change View
 */
const FiltersModule = (function() {
    // Price view filter state
    let state = {
        propertyType: 'A', // Default: All Types
        year: new Date().getFullYear() // Default: Current year
    };

    // Change view filter state
    let changeState = {
        propertyType: 'A',
        startYear: 2014,
        endYear: new Date().getFullYear()
    };

    // Callback for filter changes
    let onChangeCallback = null;
    let onChangeViewCallback = null;

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
     * @param {Function} options.onChange - Callback when price view filters change
     * @param {Function} options.onChangeView - Callback when change view filters change
     * @param {number} options.minYear - Minimum year for slider
     * @param {number} options.maxYear - Maximum year for slider
     * @param {string} options.defaultPropertyType - Default property type
     * @param {number} options.defaultYear - Default year
     */
    function init(options = {}) {
        const {
            onChange,
            onChangeView,
            minYear = 1995,
            maxYear = new Date().getFullYear(),
            defaultPropertyType = 'F',
            defaultYear = maxYear
        } = options;

        onChangeCallback = onChange;
        onChangeViewCallback = onChangeView;

        // Set initial state
        state.propertyType = defaultPropertyType;
        state.year = defaultYear;

        // Set initial change state
        changeState.propertyType = defaultPropertyType;
        changeState.startYear = Math.max(minYear, maxYear - 10); // Default: 10 years ago
        changeState.endYear = maxYear;

        // Initialize price view controls
        initPropertyTypeFilter();
        initYearSlider(minYear, maxYear, defaultYear);

        // Initialize change view controls
        initChangePropertyTypeFilter();
        initChangeYearSliders(minYear, maxYear);
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
     * Initialize change view property type radio buttons
     */
    function initChangePropertyTypeFilter() {
        const container = document.getElementById('change-property-type-filter');
        if (!container) return;

        const radios = container.querySelectorAll('input[type="radio"]');
        radios.forEach(radio => {
            // Set initial checked state
            if (radio.value === changeState.propertyType) {
                radio.checked = true;
            }

            // Add change listener
            radio.addEventListener('change', function() {
                if (this.checked) {
                    changeState.propertyType = this.value;
                    triggerChangeViewCallback('propertyType');
                }
            });
        });
    }

    /**
     * Initialize change view year sliders
     * @param {number} minYear
     * @param {number} maxYear
     */
    function initChangeYearSliders(minYear, maxYear) {
        // Start year slider
        const startSlider = document.getElementById('start-year-slider');
        const startDisplay = document.getElementById('start-year-value');

        if (startSlider && startDisplay) {
            startSlider.min = minYear;
            startSlider.max = maxYear;
            startSlider.value = changeState.startYear;
            startDisplay.textContent = changeState.startYear;

            startSlider.addEventListener('input', function() {
                startDisplay.textContent = this.value;
            });

            startSlider.addEventListener('change', function() {
                const newYear = parseInt(this.value, 10);
                // Ensure start year is strictly before end year
                if (newYear >= changeState.endYear) {
                    const maxStart = changeState.endYear - 1;
                    this.value = maxStart;
                    startDisplay.textContent = maxStart;
                    changeState.startYear = maxStart;
                } else {
                    changeState.startYear = newYear;
                }
                triggerChangeViewCallback('startYear');
            });
        }

        // End year slider
        const endSlider = document.getElementById('end-year-slider');
        const endDisplay = document.getElementById('end-year-value');

        if (endSlider && endDisplay) {
            endSlider.min = minYear;
            endSlider.max = maxYear;
            endSlider.value = changeState.endYear;
            endDisplay.textContent = changeState.endYear;

            endSlider.addEventListener('input', function() {
                endDisplay.textContent = this.value;
            });

            endSlider.addEventListener('change', function() {
                const newYear = parseInt(this.value, 10);
                // Ensure end year is strictly after start year
                if (newYear <= changeState.startYear) {
                    const minEnd = changeState.startYear + 1;
                    this.value = minEnd;
                    endDisplay.textContent = minEnd;
                    changeState.endYear = minEnd;
                } else {
                    changeState.endYear = newYear;
                }
                triggerChangeViewCallback('endYear');
            });
        }
    }

    /**
     * Trigger callback for change view updates
     * @param {string} changedField
     */
    function triggerChangeViewCallback(changedField) {
        if (onChangeViewCallback) {
            onChangeViewCallback({
                type: changedField,
                state: { ...changeState }
            });
        }
    }

    /**
     * Get current price view filter state
     * @returns {Object}
     */
    function getState() {
        return { ...state };
    }

    /**
     * Get current change view filter state
     * @returns {Object}
     */
    function getChangeState() {
        return { ...changeState };
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
        const controls = document.querySelectorAll(
            '#property-type-filter input, #year-slider, ' +
            '#change-property-type-filter input, #start-year-slider, #end-year-slider'
        );
        controls.forEach(el => el.disabled = true);
    }

    /**
     * Enable all filter controls
     */
    function enable() {
        const controls = document.querySelectorAll(
            '#property-type-filter input, #year-slider, ' +
            '#change-property-type-filter input, #start-year-slider, #end-year-slider'
        );
        controls.forEach(el => el.disabled = false);
    }

    // Public API
    return {
        init,
        getState,
        getChangeState,
        getPropertyTypeLabel,
        setState,
        disable,
        enable
    };
})();
