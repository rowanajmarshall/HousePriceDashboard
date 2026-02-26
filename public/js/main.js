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

    // Major UK cities: bounding boxes for hash-based navigation (e.g. /#manchester)
    const CITIES = {
        'london':        { bounds: [[51.28, -0.51], [51.69,  0.33]], name: 'London' },
        'manchester':    { bounds: [[53.35, -2.35], [53.60, -1.95]], name: 'Manchester' },
        'birmingham':    { bounds: [[52.35, -2.05], [52.60, -1.70]], name: 'Birmingham' },
        'leeds':         { bounds: [[53.70, -1.75], [53.90, -1.40]], name: 'Leeds' },
        'liverpool':     { bounds: [[53.32, -3.05], [53.52, -2.80]], name: 'Liverpool' },
        'sheffield':     { bounds: [[53.30, -1.70], [53.50, -1.35]], name: 'Sheffield' },
        'bristol':       { bounds: [[51.37, -2.75], [51.55, -2.45]], name: 'Bristol' },
        'edinburgh':     { bounds: [[55.87, -3.40], [55.99, -3.05]], name: 'Edinburgh' },
        'glasgow':       { bounds: [[55.78, -4.40], [55.93, -4.10]], name: 'Glasgow' },
        'newcastle':     { bounds: [[54.92, -1.75], [55.05, -1.50]], name: 'Newcastle' },
        'nottingham':    { bounds: [[52.87, -1.25], [53.07, -1.05]], name: 'Nottingham' },
        'cardiff':       { bounds: [[51.42, -3.30], [51.55, -3.05]], name: 'Cardiff' },
        'oxford':        { bounds: [[51.70, -1.30], [51.80, -1.20]], name: 'Oxford' },
        'cambridge':     { bounds: [[52.17, -0.16], [52.23,  0.15]], name: 'Cambridge' },
        'brighton':      { bounds: [[50.80, -0.20], [50.87, -0.10]], name: 'Brighton' },
        'southampton':   { bounds: [[50.88, -1.45], [50.95, -1.35]], name: 'Southampton' },
        'portsmouth':    { bounds: [[50.78, -1.12], [50.85, -1.05]], name: 'Portsmouth' },
        'leicester':     { bounds: [[52.58, -1.18], [52.68, -1.09]], name: 'Leicester' },
        'coventry':      { bounds: [[52.37, -1.58], [52.45, -1.47]], name: 'Coventry' },
        'plymouth':      { bounds: [[50.36, -4.20], [50.42, -4.10]], name: 'Plymouth' },
        'exeter':        { bounds: [[50.70, -3.55], [50.74, -3.51]], name: 'Exeter' },
        'york':          { bounds: [[53.95, -1.10], [54.00, -1.07]], name: 'York' },
        'norwich':       { bounds: [[52.61,  1.26], [52.65,  1.30]], name: 'Norwich' },
        'derby':         { bounds: [[52.90, -1.53], [52.95, -1.47]], name: 'Derby' },
        'wolverhampton': { bounds: [[52.56, -2.16], [52.61, -2.09]], name: 'Wolverhampton' },
        'swansea':       { bounds: [[51.60, -3.98], [51.65, -3.92]], name: 'Swansea' },
        'aberdeen':      { bounds: [[57.10, -2.12], [57.20, -2.05]], name: 'Aberdeen' },
        'bournemouth':   { bounds: [[50.71, -1.90], [50.76, -1.84]], name: 'Bournemouth' },
        'reading':       { bounds: [[51.44, -1.00], [51.48, -0.97]], name: 'Reading' },
        'sunderland':    { bounds: [[54.88, -1.41], [54.92, -1.37]], name: 'Sunderland' },
        'stoke':         { bounds: [[53.00, -2.22], [53.06, -2.13]], name: 'Stoke-on-Trent' },
        'bradford':      { bounds: [[53.77, -1.80], [53.83, -1.73]], name: 'Bradford' },
        'luton':         { bounds: [[51.87, -0.43], [51.91, -0.39]], name: 'Luton' },
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
     * Update URL hash with city slug (preserves query params)
     */
    function updateUrlWithCity(slug) {
        const search = window.location.search;
        window.history.pushState({ city: slug }, '', search + '#' + slug);
    }

    /**
     * Navigate to a city or postcode from a hash string.
     * Tries city name first, then falls back to postcode district.
     */
    function navigateToHash(hash) {
        const searchInput = document.getElementById('postcode-search');
        const city = CITIES[hash.toLowerCase()];
        if (city) {
            MapModule.fitBounds(city.bounds);
            if (searchInput) searchInput.value = city.name;
            return true;
        }
        const found = HeatmapModule.findAndZoomToSector(hash);
        if (found && searchInput) searchInput.value = hash.toUpperCase();
        return found;
    }

    /**
     * Navigate to postcode or city from URL hash on page load
     */
    function handleUrlPostcode() {
        const hash = getPostcodeFromUrl();
        if (hash) navigateToHash(hash);
    }

    /**
     * Initialize postcode search functionality
     */
    function initSearch() {
        const searchInput = document.getElementById('postcode-search');
        const searchBtn = document.getElementById('search-btn');
        const searchBox = document.querySelector('.search-box');
        const autocompleteList = document.getElementById('search-autocomplete');

        if (!searchInput || !searchBtn) return;

        let activeIndex = -1;
        let currentSuggestions = [];

        function getSuggestions(query) {
            if (!query) return [];
            const q = query.toLowerCase();
            const results = [];

            // City matches
            for (const [key, city] of Object.entries(CITIES)) {
                if (city.name.toLowerCase().startsWith(q) || key.startsWith(q)) {
                    results.push({ type: 'city', label: city.name, key });
                    if (results.length >= 4) break;
                }
            }

            // Postcode district matches (only if input looks like a postcode)
            if (/^[a-z]/i.test(query)) {
                const qUpper = query.toUpperCase().replace(/\s+/g, '');
                const sectorIds = HeatmapModule.getSectorIds();
                let added = 0;
                for (const id of sectorIds) {
                    if (id.startsWith(qUpper) && added < 5) {
                        results.push({ type: 'postcode', label: id, key: id });
                        added++;
                    }
                }
            }

            return results.slice(0, 8);
        }

        function renderSuggestions(suggestions) {
            autocompleteList.innerHTML = '';
            activeIndex = -1;

            if (suggestions.length === 0) {
                autocompleteList.classList.remove('visible');
                return;
            }

            suggestions.forEach(function(s, i) {
                const li = document.createElement('li');
                li.setAttribute('role', 'option');

                const iconSvg = s.type === 'city'
                    ? '<svg class="autocomplete-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>'
                    : '<svg class="autocomplete-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>';

                li.innerHTML = iconSvg +
                    '<span class="autocomplete-label">' + s.label + '</span>' +
                    '<span class="autocomplete-type">' + (s.type === 'city' ? 'City' : 'Postcode') + '</span>';

                li.addEventListener('mousedown', function(e) {
                    e.preventDefault(); // Prevent input blur before click fires
                    searchInput.value = s.label;
                    closeAutocomplete();
                    performSearch();
                });

                autocompleteList.appendChild(li);
            });

            autocompleteList.classList.add('visible');
            currentSuggestions = suggestions;
        }

        function closeAutocomplete() {
            autocompleteList.classList.remove('visible');
            activeIndex = -1;
        }

        function setActiveItem(index) {
            const items = autocompleteList.querySelectorAll('li');
            items.forEach(function(li) { li.classList.remove('active'); });
            if (index >= 0 && index < items.length) {
                items[index].classList.add('active');
                searchInput.value = currentSuggestions[index].label;
            }
            activeIndex = index;
        }

        function performSearch() {
            const term = searchInput.value.trim();
            if (!term) return;

            closeAutocomplete();

            // Try city name first
            const city = CITIES[term.toLowerCase()];
            if (city) {
                MapModule.fitBounds(city.bounds);
                searchBox.classList.remove('error');
                searchInput.blur();
                updateUrlWithCity(term.toLowerCase());
                return;
            }

            // Try city display name match (e.g. "London" not just "london")
            const cityByName = Object.entries(CITIES).find(([, c]) => c.name.toLowerCase() === term.toLowerCase());
            if (cityByName) {
                MapModule.fitBounds(cityByName[1].bounds);
                searchBox.classList.remove('error');
                searchInput.blur();
                updateUrlWithCity(cityByName[0]);
                return;
            }

            const found = HeatmapModule.findAndZoomToSector(term);

            if (found) {
                searchBox.classList.remove('error');
                searchInput.blur();
                updateUrlWithPostcode(term);
            } else {
                searchBox.classList.add('error');
                setTimeout(() => searchBox.classList.remove('error'), 1500);
            }
        }

        // Search on Enter key; arrow keys navigate suggestions
        searchInput.addEventListener('keydown', function(e) {
            const items = autocompleteList.querySelectorAll('li');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveItem(Math.min(activeIndex + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveItem(Math.max(activeIndex - 1, -1));
            } else if (e.key === 'Escape') {
                closeAutocomplete();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                performSearch();
            }
        });

        // Search on button click
        searchBtn.addEventListener('click', performSearch);

        // Build autocomplete suggestions on input
        searchInput.addEventListener('input', function() {
            searchBox.classList.remove('error');
            const suggestions = getSuggestions(searchInput.value.trim());
            renderSuggestions(suggestions);
        });

        // Close dropdown when focus leaves the search area
        searchInput.addEventListener('blur', function() {
            // Small delay so mousedown on a suggestion fires first
            setTimeout(closeAutocomplete, 150);
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

            // Handle postcode/city hash
            if (e.state && e.state.city) {
                const city = CITIES[e.state.city];
                if (city) {
                    MapModule.fitBounds(city.bounds);
                    searchInput.value = city.name;
                }
            } else if (e.state && e.state.postcode) {
                HeatmapModule.findAndZoomToSector(e.state.postcode);
                searchInput.value = e.state.postcode.toUpperCase();
            } else {
                const hash = getPostcodeFromUrl();
                if (hash) navigateToHash(hash);
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

            // Recalculate map size after layout change
            // Small delay ensures CSS transition completes
            setTimeout(() => {
                MapModule.invalidateSize();
            }, 300);
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
