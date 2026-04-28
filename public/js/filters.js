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
        startYear: 2020,
        endYear: new Date().getFullYear(),
        adjustmentMode: 'nominal' // 'nominal' or 'real'
    };

    // Callback for filter changes
    let onChangeCallback = null;
    let onChangeViewCallback = null;

    /**
     * Update the slider track fill to reflect current position
     * @param {HTMLInputElement} slider
     */
    function updateSliderFill(slider) {
        const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
        slider.style.background = `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-border) ${pct}%)`;
    }

    /**
     * Update the dual-range fill div to span between the two thumbs
     * @param {HTMLInputElement} startSlider
     * @param {HTMLInputElement} endSlider
     * @param {HTMLElement} fill
     */
    function updateDualRangeFill(startSlider, endSlider, fill) {
        if (!fill) return;
        const min = parseFloat(startSlider.min);
        const max = parseFloat(startSlider.max);
        const range = max - min;
        const leftPct  = ((startSlider.value - min) / range) * 100;
        const rightPct = ((endSlider.value   - min) / range) * 100;
        fill.style.left  = leftPct + '%';
        fill.style.width = (rightPct - leftPct) + '%';
    }

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
        changeState.startYear = 2020;
        changeState.endYear = defaultYear;

        // Initialize controls
        initPropertyTypeFilter();
        initYearSlider(minYear, maxYear, defaultYear);
        initChangeYearSliders(minYear, maxYear);
        initAdjustmentModeFilter();
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
                    changeState.propertyType = this.value;

                    if (oldType !== state.propertyType) {
                        if (onChangeCallback) {
                            onChangeCallback({
                                type: 'propertyType',
                                value: state.propertyType,
                                state: { ...state }
                            });
                        }
                        if (onChangeViewCallback) {
                            onChangeViewCallback({
                                type: 'propertyType',
                                state: { ...changeState }
                            });
                        }
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
        const disclaimer = document.getElementById('year-disclaimer');

        if (!slider || !display) return;

        // Configure slider
        slider.min = minYear;
        slider.max = maxYear;
        slider.value = defaultYear;

        // Update display
        display.textContent = defaultYear;
        updateSliderFill(slider);
        if (disclaimer) disclaimer.style.visibility = defaultYear >= maxYear ? 'visible' : 'hidden';

        // Add input listener (fires continuously while dragging)
        slider.addEventListener('input', function() {
            display.textContent = this.value;
            updateSliderFill(this);
            if (disclaimer) disclaimer.style.visibility = parseInt(this.value, 10) >= maxYear ? 'visible' : 'hidden';
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
     * Initialize the dual-handle year range slider for change view
     * @param {number} minYear
     * @param {number} maxYear
     */
    function initChangeYearSliders(minYear, maxYear) {
        const startSlider  = document.getElementById('start-year-slider');
        const endSlider    = document.getElementById('end-year-slider');
        const startDisplay = document.getElementById('start-year-value');
        const endDisplay   = document.getElementById('end-year-value');
        const fill         = document.getElementById('change-range-fill');

        if (!startSlider || !endSlider) return;

        startSlider.min = endSlider.min = minYear;
        startSlider.max = endSlider.max = maxYear;
        startSlider.value = changeState.startYear;
        endSlider.value   = changeState.endYear;
        if (startDisplay) startDisplay.textContent = changeState.startYear;
        if (endDisplay)   endDisplay.textContent   = changeState.endYear;
        updateDualRangeFill(startSlider, endSlider, fill);

        startSlider.addEventListener('input', function() {
            if (parseInt(this.value, 10) >= parseInt(endSlider.value, 10)) {
                this.value = parseInt(endSlider.value, 10) - 1;
            }
            if (startDisplay) startDisplay.textContent = this.value;
            updateDualRangeFill(startSlider, endSlider, fill);
        });

        startSlider.addEventListener('change', function() {
            const newYear = parseInt(this.value, 10);
            if (newYear >= changeState.endYear) {
                const clamped = changeState.endYear - 1;
                this.value = clamped;
                if (startDisplay) startDisplay.textContent = clamped;
                changeState.startYear = clamped;
            } else {
                changeState.startYear = newYear;
            }
            updateDualRangeFill(startSlider, endSlider, fill);
            triggerChangeViewCallback('startYear');
        });

        endSlider.addEventListener('input', function() {
            if (parseInt(this.value, 10) <= parseInt(startSlider.value, 10)) {
                this.value = parseInt(startSlider.value, 10) + 1;
            }
            if (endDisplay) endDisplay.textContent = this.value;
            updateDualRangeFill(startSlider, endSlider, fill);
        });

        endSlider.addEventListener('change', function() {
            const newYear = parseInt(this.value, 10);
            if (newYear <= changeState.startYear) {
                const clamped = changeState.startYear + 1;
                this.value = clamped;
                if (endDisplay) endDisplay.textContent = clamped;
                changeState.endYear = clamped;
            } else {
                changeState.endYear = newYear;
            }
            updateDualRangeFill(startSlider, endSlider, fill);
            triggerChangeViewCallback('endYear');
        });
    }

    /**
     * Initialize adjustment mode radio buttons
     */
    function initAdjustmentModeFilter() {
        const container = document.getElementById('adjustment-mode-filter');
        if (!container) return;

        const radios = container.querySelectorAll('input[type="radio"]');
        radios.forEach(radio => {
            // Set initial checked state
            if (radio.value === changeState.adjustmentMode) {
                radio.checked = true;
            }

            // Add change listener
            radio.addEventListener('change', function() {
                if (this.checked) {
                    changeState.adjustmentMode = this.value;
                    triggerChangeViewCallback('adjustmentMode');
                }
            });
        });
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
            const disclaimer = document.getElementById('year-disclaimer');
            if (slider) { slider.value = state.year; updateSliderFill(slider); }
            if (display) display.textContent = state.year;
            if (disclaimer) disclaimer.style.visibility = state.year >= parseInt(slider?.max || 0, 10) ? 'visible' : 'hidden';
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
     * Set change view filter values programmatically
     * @param {Object} newState - New filter state
     * @param {boolean} triggerCallback - Whether to trigger onChangeView callback
     */
    function setChangeState(newState, triggerCallback = false) {
        if (newState.propertyType && newState.propertyType !== changeState.propertyType) {
            changeState.propertyType = newState.propertyType;
            state.propertyType = newState.propertyType;
            const radio = document.querySelector(`input[name="property-type"][value="${changeState.propertyType}"]`);
            if (radio) radio.checked = true;
        }

        if (newState.startYear && newState.startYear !== changeState.startYear) {
            changeState.startYear = newState.startYear;
            const slider = document.getElementById('start-year-slider');
            const display = document.getElementById('start-year-value');
            if (slider) slider.value = changeState.startYear;
            if (display) display.textContent = changeState.startYear;
        }

        if (newState.endYear && newState.endYear !== changeState.endYear) {
            changeState.endYear = newState.endYear;
            const slider = document.getElementById('end-year-slider');
            const display = document.getElementById('end-year-value');
            if (slider) slider.value = changeState.endYear;
            if (display) display.textContent = changeState.endYear;
        }

        const startSlider = document.getElementById('start-year-slider');
        const endSlider   = document.getElementById('end-year-slider');
        const fill        = document.getElementById('change-range-fill');
        if (startSlider && endSlider) updateDualRangeFill(startSlider, endSlider, fill);

        if (newState.adjustmentMode && newState.adjustmentMode !== changeState.adjustmentMode) {
            changeState.adjustmentMode = newState.adjustmentMode;
            const radio = document.querySelector(`input[name="adjustment-mode"][value="${changeState.adjustmentMode}"]`);
            if (radio) radio.checked = true;
        }

        if (triggerCallback && onChangeViewCallback) {
            onChangeViewCallback({
                type: 'multiple',
                state: { ...changeState }
            });
        }
    }

    /**
     * Disable all filter controls
     */
    function disable() {
        const controls = document.querySelectorAll(
            '#property-type-filter input, #year-slider, ' +
            '#start-year-slider, #end-year-slider, #adjustment-mode-filter input'
        );
        controls.forEach(el => el.disabled = true);
    }

    /**
     * Enable all filter controls
     */
    function enable() {
        const controls = document.querySelectorAll(
            '#property-type-filter input, #year-slider, ' +
            '#start-year-slider, #end-year-slider, #adjustment-mode-filter input'
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
        setChangeState,
        disable,
        enable
    };
})();
