/**
 * Main Application Entry Point
 * Initializes and coordinates all modules
 */
(function() {
    'use strict';

    // Application state
    const app = {
        initialized: false,
        loading: true
    };

    // Configuration
    const config = {
        defaultYear: 2024,
        defaultPropertyType: 'A',
        minYear: 1995,
        maxYear: 2024
    };

    /**
     * Initialize postcode search functionality
     */
    function initSearch() {
        const searchInput = document.getElementById('postcode-search');
        const searchBtn = document.getElementById('search-btn');
        const searchBox = document.querySelector('.search-box');

        if (!searchInput || !searchBtn) return;

        function performSearch() {
            const term = searchInput.value.trim();
            if (!term) return;

            const found = HeatmapModule.findAndZoomToSector(term);

            // Show feedback
            if (found) {
                searchBox.classList.remove('error');
                searchInput.blur();
            } else {
                searchBox.classList.add('error');
                // Remove error class after a moment
                setTimeout(() => searchBox.classList.remove('error'), 1500);
            }
        }

        // Search on Enter key
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                performSearch();
            }
        });

        // Search on button click
        searchBtn.addEventListener('click', performSearch);

        // Clear error state on input
        searchInput.addEventListener('input', function() {
            searchBox.classList.remove('error');
        });
    }

    /**
     * Initialize mobile controls collapse functionality
     */
    function initMobileCollapse() {
        const panel = document.querySelector('.controls-panel');
        const toggle = document.querySelector('.collapse-toggle');
        const handleLabel = document.querySelector('.handle-label');

        if (!toggle || !panel) return;

        // Restore state from localStorage
        const isCollapsed = localStorage.getItem('controlsCollapsed') === 'true';
        if (isCollapsed) {
            panel.classList.add('collapsed');
            toggle.setAttribute('aria-expanded', 'false');
            if (handleLabel) {
                handleLabel.textContent = 'Show Filters';
            }
        }

        toggle.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            const expanded = !panel.classList.contains('collapsed');
            toggle.setAttribute('aria-expanded', String(expanded));
            localStorage.setItem('controlsCollapsed', String(!expanded));

            // Update handle label
            if (handleLabel) {
                handleLabel.textContent = expanded ? 'Hide Filters' : 'Show Filters';
            }
        });
    }

    /**
     * Update the mobile controls summary text
     */
    function updateControlsSummary() {
        const summary = document.querySelector('.controls-summary');
        if (!summary) return;

        // Check if HeatmapModule is initialized
        if (typeof HeatmapModule === 'undefined' || !HeatmapModule.getViewMode) return;

        const viewMode = HeatmapModule.getViewMode();
        if (viewMode === 'change') {
            const state = FiltersModule.getChangeState();
            const mode = state.adjustmentMode === 'real' ? 'Real' : 'Nominal';
            summary.textContent = `${mode} • ${state.startYear}-${state.endYear}`;
        } else {
            const state = FiltersModule.getState();
            summary.textContent = `Price • ${state.year}`;
        }
    }

    /**
     * Initialize the application
     */
    async function init() {
        console.log('Initializing UK House Price Heatmap...');

        try {
            showLoading(true);

            // Initialize mobile collapse (before async operations)
            initMobileCollapse();

            // Initialize the map
            const map = MapModule.init('map');
            console.log('Map initialized');

            // Initialize tooltip module
            const mapContainer = document.querySelector('.map-container');
            TooltipModule.init(mapContainer);
            console.log('Tooltip initialized');

            // Initialize filters
            FiltersModule.init({
                onChange: handleFilterChange,
                onChangeView: handleChangeViewFilterChange,
                minYear: config.minYear,
                maxYear: config.maxYear,
                defaultPropertyType: config.defaultPropertyType,
                defaultYear: config.defaultYear
            });
            console.log('Filters initialized');

            // Initialize tabs
            TabsModule.init({
                onChange: handleTabChange
            });
            console.log('Tabs initialized');

            // Load boundaries, initial price data, and inflation data
            console.log('Loading data...');
            const [boundaries] = await Promise.all([
                DataLoader.loadBoundaries(),
                DataLoader.loadPriceData(config.defaultYear),
                DataLoader.loadInflation()
            ]);
            console.log('Data loaded');

            // Initialize heatmap
            await HeatmapModule.init(
                map,
                boundaries,
                config.defaultYear,
                config.defaultPropertyType
            );
            console.log('Heatmap initialized');

            // Initialize search (after heatmap so layer is available)
            initSearch();
            console.log('Search initialized');

            // Preload adjacent years in background
            preloadAdjacentYears(config.defaultYear);

            // Mark as initialized
            app.initialized = true;
            app.loading = false;
            showLoading(false);

            // Update mobile summary
            updateControlsSummary();

            console.log('Application ready');

        } catch (error) {
            console.error('Failed to initialize application:', error);
            showError('Failed to load application. Please refresh the page.');
        }
    }

    /**
     * Handle filter changes
     * @param {Object} event - Filter change event
     */
    async function handleFilterChange(event) {
        if (!app.initialized) return;

        console.log('Filter changed:', event);

        try {
            // Close any open tooltip
            TooltipModule.close();

            // Disable filters during update
            FiltersModule.disable();

            // Show loading state
            showLoading(true, 'Updating map...');

            // Update heatmap
            await HeatmapModule.update(event.state.year, event.state.propertyType);

            // Re-enable filters
            FiltersModule.enable();
            showLoading(false);

            // Update mobile summary
            updateControlsSummary();

            // Preload adjacent years if year changed
            if (event.type === 'year') {
                preloadAdjacentYears(event.state.year);
            }

        } catch (error) {
            console.error('Failed to update heatmap:', error);
            FiltersModule.enable();
            showLoading(false);
        }
    }

    /**
     * Handle change view filter changes
     * @param {Object} event - Filter change event
     */
    async function handleChangeViewFilterChange(event) {
        if (!app.initialized) return;

        // Only process if we're on the change tab
        if (TabsModule.getActiveTab() !== 'change') return;

        console.log('Change view filter changed:', event);

        try {
            TooltipModule.close();
            FiltersModule.disable();
            showLoading(true, 'Calculating changes...');

            const adjustInflation = event.state.adjustmentMode === 'real';
            await HeatmapModule.updateChangeView(
                event.state.startYear,
                event.state.endYear,
                event.state.propertyType,
                adjustInflation
            );

            FiltersModule.enable();
            showLoading(false);

            // Update mobile summary
            updateControlsSummary();

        } catch (error) {
            console.error('Failed to update change view:', error);
            FiltersModule.enable();
            showLoading(false);
        }
    }

    /**
     * Handle tab switching
     * @param {Object} event - Tab change event
     */
    async function handleTabChange(event) {
        if (!app.initialized) return;

        console.log('Tab changed:', event.tab);

        try {
            TooltipModule.close();
            FiltersModule.disable();

            if (event.tab === 'price') {
                showLoading(true, 'Loading price data...');
                await HeatmapModule.switchToPriceView();
            } else if (event.tab === 'change') {
                showLoading(true, 'Calculating changes...');
                const changeState = FiltersModule.getChangeState();
                const adjustInflation = changeState.adjustmentMode === 'real';
                await HeatmapModule.updateChangeView(
                    changeState.startYear,
                    changeState.endYear,
                    changeState.propertyType,
                    adjustInflation
                );
            }

            FiltersModule.enable();
            showLoading(false);

            // Update mobile summary
            updateControlsSummary();

        } catch (error) {
            console.error('Failed to switch tab:', error);
            FiltersModule.enable();
            showLoading(false);
        }
    }

    /**
     * Preload price data for adjacent years
     * @param {number} currentYear
     */
    function preloadAdjacentYears(currentYear) {
        const yearsToPreload = [];

        // Previous year
        if (currentYear > config.minYear) {
            yearsToPreload.push(currentYear - 1);
        }

        // Next year
        if (currentYear < config.maxYear) {
            yearsToPreload.push(currentYear + 1);
        }

        // Preload in background (don't await)
        DataLoader.preloadYears(yearsToPreload).catch(err => {
            console.warn('Failed to preload years:', err);
        });
    }

    /**
     * Show or hide loading overlay
     * @param {boolean} show
     * @param {string} message - Optional message to display
     */
    function showLoading(show, message) {
        const overlay = document.getElementById('loading-overlay');
        if (!overlay) return;

        if (show) {
            overlay.classList.remove('hidden');
            const messageEl = overlay.querySelector('p');
            if (messageEl && message) {
                messageEl.textContent = message;
            }
        } else {
            overlay.classList.add('hidden');
        }
    }

    /**
     * Show error message
     * @param {string} message
     */
    function showError(message) {
        const overlay = document.getElementById('loading-overlay');
        if (!overlay) return;

        overlay.innerHTML = `
            <div style="text-align: center; color: #c0392b;">
                <p style="font-size: 18px; margin-bottom: 16px;">Error</p>
                <p>${message}</p>
                <button onclick="location.reload()" style="margin-top: 16px; padding: 8px 16px; cursor: pointer;">
                    Retry
                </button>
            </div>
        `;
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Handle window resize
    window.addEventListener('resize', function() {
        MapModule.invalidateSize();
    });

    // Expose app for debugging
    window.HousePriceApp = {
        DataLoader,
        MapModule,
        HeatmapModule,
        FiltersModule,
        TabsModule,
        TooltipModule
    };
})();
