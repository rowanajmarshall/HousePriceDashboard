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
        defaultYear: 2025,
        defaultPropertyType: 'A',
        minYear: 1995,
        maxYear: 2025
    };

    /**
     * Get postcode from URL hash (e.g., #N19)
     */
    function getPostcodeFromUrl() {
        const hash = window.location.hash;
        if (hash && hash.length > 1) {
            return decodeURIComponent(hash.slice(1));
        }
        return null;
    }

    /**
     * Get all state from URL query parameters
     */
    function getStateFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return {
            tab: params.get('tab') || 'price',
            year: parseInt(params.get('year')) || config.defaultYear,
            propertyType: params.get('type') || config.defaultPropertyType,
            startYear: parseInt(params.get('start')) || 2014,
            endYear: parseInt(params.get('end')) || config.defaultYear,
            adjustmentMode: params.get('adj') || 'nominal'
        };
    }

    /**
     * Update URL with current state (preserves hash)
     */
    function updateUrlWithState() {
        const tab = TabsModule.getActiveTab();
        const params = new URLSearchParams();

        params.set('tab', tab);

        if (tab === 'price') {
            const state = FiltersModule.getState();
            params.set('year', state.year);
            params.set('type', state.propertyType);
        } else {
            const state = FiltersModule.getChangeState();
            params.set('start', state.startYear);
            params.set('end', state.endYear);
            params.set('type', state.propertyType);
            params.set('adj', state.adjustmentMode);
        }

        const hash = window.location.hash;
        const newUrl = '?' + params.toString() + hash;
        window.history.replaceState(null, '', newUrl);
    }

    /**
     * Update URL hash with postcode (preserves query params)
     */
    function updateUrlWithPostcode(postcode) {
        const search = window.location.search;
        const newUrl = search + '#' + encodeURIComponent(postcode.toUpperCase());
        window.history.pushState({ postcode }, '', newUrl);
    }

    /**
     * Navigate to postcode from URL on page load
     */
    function handleUrlPostcode() {
        const postcode = getPostcodeFromUrl();
        if (postcode) {
            const found = HeatmapModule.findAndZoomToSector(postcode);
            if (found) {
                // Update search input to show the postcode
                const searchInput = document.getElementById('postcode-search');
                if (searchInput) {
                    searchInput.value = postcode.toUpperCase();
                }
            }
        }
    }

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
                updateUrlWithPostcode(term);
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

        // Handle browser back/forward navigation
        window.addEventListener('popstate', async function(e) {
            // Handle query param state changes
            const urlState = getStateFromUrl();

            // Apply filter states
            FiltersModule.setState({
                propertyType: urlState.propertyType,
                year: urlState.year
            });
            FiltersModule.setChangeState({
                propertyType: urlState.propertyType,
                startYear: urlState.startYear,
                endYear: urlState.endYear,
                adjustmentMode: urlState.adjustmentMode
            });

            // Switch tab and update heatmap
            if (urlState.tab === 'change') {
                TabsModule.switchTab('change');
                const adjustInflation = urlState.adjustmentMode === 'real';
                await HeatmapModule.updateChangeView(
                    urlState.startYear,
                    urlState.endYear,
                    urlState.propertyType,
                    adjustInflation
                );
            } else {
                TabsModule.switchTab('price');
                await HeatmapModule.update(urlState.year, urlState.propertyType);
            }

            updateControlsSummary();

            // Handle postcode hash
            if (e.state && e.state.postcode) {
                HeatmapModule.findAndZoomToSector(e.state.postcode);
                searchInput.value = e.state.postcode.toUpperCase();
            } else {
                const postcode = getPostcodeFromUrl();
                if (postcode) {
                    HeatmapModule.findAndZoomToSector(postcode);
                    searchInput.value = postcode.toUpperCase();
                }
            }
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

        // Check if user is on mobile device
        const isMobile = window.innerWidth <= 768;

        // Get stored state from localStorage
        const storedState = localStorage.getItem('controlsCollapsed');

        // Determine if panel should be collapsed
        // On mobile: default to collapsed unless explicitly set to expanded
        // On desktop: default to expanded unless explicitly set to collapsed
        let isCollapsed;
        if (storedState !== null) {
            // User has previously interacted with the collapse toggle
            isCollapsed = storedState === 'true';
        } else {
            // First visit - default to collapsed on mobile, expanded on desktop
            isCollapsed = isMobile;
        }

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

            // Apply URL state to filters
            const urlState = getStateFromUrl();
            FiltersModule.setState({
                propertyType: urlState.propertyType,
                year: urlState.year
            });
            FiltersModule.setChangeState({
                propertyType: urlState.propertyType,
                startYear: urlState.startYear,
                endYear: urlState.endYear,
                adjustmentMode: urlState.adjustmentMode
            });
            console.log('URL state applied:', urlState);

            // Load boundaries, initial price data, and inflation data
            console.log('Loading data...');
            const [boundaries] = await Promise.all([
                DataLoader.loadBoundaries(),
                DataLoader.loadPriceData(urlState.year),
                DataLoader.loadInflation()
            ]);
            console.log('Data loaded');

            // Initialize heatmap with URL state
            await HeatmapModule.init(
                map,
                boundaries,
                urlState.year,
                urlState.propertyType
            );
            console.log('Heatmap initialized');

            // Switch to change tab if specified in URL
            if (urlState.tab === 'change') {
                TabsModule.switchTab('change');
                const adjustInflation = urlState.adjustmentMode === 'real';
                await HeatmapModule.updateChangeView(
                    urlState.startYear,
                    urlState.endYear,
                    urlState.propertyType,
                    adjustInflation
                );
            }

            // Initialize search (after heatmap so layer is available)
            initSearch();
            console.log('Search initialized');

            // Check for postcode in URL and navigate to it
            handleUrlPostcode();

            // Update URL with initial state (in case defaults were applied)
            updateUrlWithState();

            // Preload adjacent years in background
            preloadAdjacentYears(urlState.year);

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

            // Update URL with new state
            updateUrlWithState();

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

            // Update URL with new state
            updateUrlWithState();

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

            // Update URL with new state
            updateUrlWithState();

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
