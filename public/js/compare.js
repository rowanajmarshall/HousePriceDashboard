(function () {
    'use strict';

    const START_YEAR = 1995;
    const END_YEAR = 2026;
    const YEARS = [];
    for (let y = START_YEAR; y <= END_YEAR; y++) YEARS.push(y);

    const COLORS = ['#3498db', '#e67e22', '#27ae60', '#9b59b6'];
    const MAX_AREAS = 4;

    // State
    let areas = [];          // Array of postcode district codes
    let districtNames = {};  // { "SW1A": "Westminster", ... }
    let inflationData = null;
    let allYearData = {};    // { [code]: { [year]: sectorData | null } }
    let propType = 'A';
    let isReal = false;
    let priceChart = null;
    let medianChart = null;
    let volumeChart = null;

    // DOM
    const loadingEl  = document.getElementById('compare-loading');
    const emptyEl    = document.getElementById('compare-empty');
    const contentEl  = document.getElementById('compare-content');
    const chipsRowEl = document.getElementById('compare-chips-row');
    const promptEl   = document.getElementById('compare-prompt');
    const statsGridEl = document.getElementById('compare-stats-grid');

    // ── Initialise ──────────────────────────────────────────────────────────

    function init() {
        areas = parseAreasFromUrl();

        if (areas.length === 0) {
            showEmpty();
            return;
        }

        loadData();
    }

    function parseAreasFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get('areas') || '';
        return raw
            .split(',')
            .map(s => s.trim().toUpperCase())
            .filter(s => /^[A-Z]{1,2}\d{1,2}[A-Z]?$/.test(s))
            .slice(0, MAX_AREAS);
    }

    // ── Data loading ────────────────────────────────────────────────────────

    function storeDistrictData(code, result) {
        allYearData[code] = {};
        if (result && result.data) {
            YEARS.forEach(year => {
                allYearData[code][year] = result.data[String(year)] || null;
            });
            if (result.name) districtNames[code] = result.name || districtNames[code];
        }
    }

    async function loadData() {
        try {
            const [areaResults, namesResult, inflResult] = await Promise.all([
                Promise.all(areas.map(code => DataLoader.loadDistrictData(code).catch(() => null))),
                DataLoader.loadDistrictNames().catch(() => ({})),
                DataLoader.loadInflation()
            ]);

            districtNames = namesResult || {};
            inflationData = inflResult;
            areaResults.forEach((result, i) => storeDistrictData(areas[i], result));

            showContent();
        } catch (err) {
            console.error('Failed to load compare data:', err);
        }
    }

    async function addArea(code) {
        areas.push(code);
        storeDistrictData(code, null); // initialise empty so charts don't error
        updateUrl();
        renderChips(); // optimistic: show chip immediately
        if (window.posthog) posthog.capture('area_added_to_comparison', { postcode_district: code, total_areas: areas.length });
        try {
            const result = await DataLoader.loadDistrictData(code);
            storeDistrictData(code, result);
        } catch (e) {
            console.error('Failed to load data for ' + code, e);
        }
        renderChips(); // re-render with name populated
        renderStats();
        updateCharts();
    }

    // ── Show states ─────────────────────────────────────────────────────────

    function showEmpty() {
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
        contentEl.style.display = 'none';
    }

    function showContent() {
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'none';
        contentEl.style.display = 'block';

        renderChips();
        renderStats();
        renderCharts();
        setupControls();
        trackAreas(areas);
    }

    function trackAreas(codes) {
        if (typeof sa_event !== 'function') return;
        var name = 'compare_area_' + codes.slice().sort().join('_').toLowerCase();
        sa_event(name);
        if (window.posthog) posthog.capture('comparison_viewed', { area_count: codes.length });
    }

    // ── Chips row ───────────────────────────────────────────────────────────

    function renderChips() {
        chipsRowEl.innerHTML = '';

        areas.forEach(function(code, i) {
            const name = districtNames[code] || null;
            const color = COLORS[i % COLORS.length];

            const chip = document.createElement('span');
            chip.className = 'compare-area-chip';
            chip.style.borderColor = color;

            chip.innerHTML =
                '<span class="compare-area-chip-dot" style="background:' + color + '"></span>' +
                '<span>' + code + '</span>' +
                (name ? '<span class="compare-area-chip-name">– ' + name + '</span>' : '') +
                (areas.length > 1 ? '<button class="compare-area-chip-remove" aria-label="Remove ' + code + '">&times;</button>' : '');

            const removeBtn = chip.querySelector('.compare-area-chip-remove');
            if (removeBtn) {
                removeBtn.addEventListener('click', function() {
                    removeArea(code);
                });
            }

            chipsRowEl.appendChild(chip);
        });

        // Add area button (only if < max)
        if (areas.length < MAX_AREAS) {
            const addWrap = document.createElement('div');
            addWrap.className = 'compare-add-area-wrap';
            addWrap.id = 'add-area-wrap';

            const addBtn = document.createElement('button');
            addBtn.className = 'compare-add-area-btn';
            addBtn.id = 'add-area-btn';
            addBtn.textContent = '+ Add area';

            addWrap.appendChild(addBtn);
            chipsRowEl.appendChild(addWrap);

            addBtn.addEventListener('click', function() {
                showAddAreaInput(addWrap, addBtn);
            });
        }

        // Show prompt if only 1 area
        if (promptEl) {
            promptEl.style.display = areas.length === 1 ? 'block' : 'none';
        }
    }

    function showAddAreaInput(wrap, btn) {
        btn.style.display = 'none';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'compare-add-area-input';
        input.placeholder = 'e.g. E1, SW1A';
        input.autocomplete = 'off';
        wrap.appendChild(input);

        const dropdown = document.createElement('ul');
        dropdown.className = 'compare-add-area-dropdown';
        dropdown.style.display = 'none';
        wrap.appendChild(dropdown);

        let suggestions = [];
        let activeIdx = -1;

        input.addEventListener('input', function() {
            const q = input.value.trim().toUpperCase().replace(/\s+/g, '');
            if (!q) { dropdown.style.display = 'none'; return; }

            suggestions = Object.keys(districtNames)
                .filter(c => c.startsWith(q) && !areas.includes(c))
                .slice(0, 6);

            // Also add exact match from areas keys even without name
            if (!suggestions.length) {
                const allCodes = getKnownCodes();
                suggestions = allCodes.filter(c => c.startsWith(q) && !areas.includes(c)).slice(0, 6);
            }

            renderDropdown();
        });

        function renderDropdown() {
            dropdown.innerHTML = '';
            activeIdx = -1;
            if (!suggestions.length) { dropdown.style.display = 'none'; return; }

            suggestions.forEach(function(code, i) {
                const li = document.createElement('li');
                const name = districtNames[code] || '';
                li.textContent = code + (name ? ' – ' + name : '');
                li.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                    selectCode(code);
                });
                dropdown.appendChild(li);
            });
            dropdown.style.display = 'block';
        }

        input.addEventListener('keydown', function(e) {
            const items = dropdown.querySelectorAll('li');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIdx = Math.min(activeIdx + 1, items.length - 1);
                items.forEach((li, i) => li.classList.toggle('active', i === activeIdx));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIdx = Math.max(activeIdx - 1, -1);
                items.forEach((li, i) => li.classList.toggle('active', i === activeIdx));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeIdx >= 0 && suggestions[activeIdx]) {
                    selectCode(suggestions[activeIdx]);
                } else {
                    const q = input.value.trim().toUpperCase().replace(/\s+/g, '');
                    if (/^[A-Z]{1,2}\d{1,2}[A-Z]?$/.test(q) && !areas.includes(q)) {
                        selectCode(q);
                    }
                }
            } else if (e.key === 'Escape') {
                cancelAdd();
            }
        });

        input.addEventListener('blur', function() {
            setTimeout(cancelAdd, 150);
        });

        function cancelAdd() {
            wrap.removeChild(input);
            if (dropdown.parentNode) wrap.removeChild(dropdown);
            btn.style.display = '';
        }

        function selectCode(code) {
            cancelAdd();
            addArea(code);
        }

        input.focus();
    }

    function getKnownCodes() {
        return Object.keys(districtNames);
    }

    function removeArea(code) {
        areas = areas.filter(c => c !== code);
        delete allYearData[code];
        updateUrl();

        if (areas.length === 0) {
            showEmpty();
            return;
        }

        renderChips();
        renderStats();
        updateCharts();
    }

    function updateUrl() {
        const params = new URLSearchParams(window.location.search);
        params.set('areas', areas.join(','));
        window.history.replaceState(null, '', '?' + params.toString());
    }

    // ── Dataset builders ────────────────────────────────────────────────────

    function getSeriesValue(code, year, metric) {
        const sectorData = allYearData[code] && allYearData[code][year];
        if (!sectorData) return null;

        let typeData = sectorData[propType];
        if (propType === 'A' && !typeData) {
            // compute weighted avg from individual types
            typeData = computeAllAvg(sectorData);
        }
        if (!typeData) return null;

        let val;
        if (metric === 'avg')    val = typeData.avg;
        else if (metric === 'median') val = typeData.median;
        else if (metric === 'count')  return typeData.count;

        if (val == null) return null;

        if (isReal && inflationData && inflationData.data) {
            const fromCPI = inflationData.data[String(year)];
            const toCPI   = inflationData.data[String(END_YEAR)];
            if (fromCPI && toCPI) val = Math.round(val * (toCPI / fromCPI));
        }
        return val;
    }

    function computeAllAvg(sectorData) {
        const types = ['D', 'S', 'T', 'F'];
        let totalCount = 0, weightedSum = 0;
        let medians = [];
        for (const t of types) {
            if (sectorData[t] && sectorData[t].avg) {
                totalCount += sectorData[t].count;
                weightedSum += sectorData[t].avg * sectorData[t].count;
                medians.push(sectorData[t].median);
            }
        }
        if (totalCount === 0) return null;
        return {
            avg: Math.round(weightedSum / totalCount),
            median: medians.length ? Math.round(medians.reduce((a, b) => a + b, 0) / medians.length) : null,
            count: totalCount
        };
    }

    function buildDatasets(metric) {
        return areas.map(function(code, i) {
            const color = COLORS[i % COLORS.length];
            const name = districtNames[code] || code;
            const data = YEARS.map(y => getSeriesValue(code, y, metric));

            return {
                label: code + (name !== code ? ' – ' + name : ''),
                data,
                borderColor: color,
                backgroundColor: color + '22',
                borderWidth: 2.5,
                pointRadius: 3,
                pointHoverRadius: 5,
                tension: 0.3,
                spanGaps: true
            };
        });
    }

    // ── Charts ──────────────────────────────────────────────────────────────

    function priceTick(v) {
        if (v >= 1000000) return '\u00a3' + (v / 1000000).toFixed(1) + 'm';
        if (v >= 1000)    return '\u00a3' + Math.round(v / 1000) + 'k';
        return '\u00a3' + v;
    }

    function priceTooltipLabel(ctx) {
        const v = ctx.parsed.y;
        if (v === null || v === undefined) return ctx.dataset.label + ': No data';
        return ctx.dataset.label + ': \u00a3' + v.toLocaleString('en-GB');
    }

    function volumeTooltipLabel(ctx) {
        const v = ctx.parsed.y;
        if (v === null || v === undefined) return ctx.dataset.label + ': No data';
        return ctx.dataset.label + ': ' + v.toLocaleString('en-GB') + ' sales';
    }

    function baseChartOptions(tooltipLabelFn, tickFn) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top' },
                tooltip: { callbacks: { label: tooltipLabelFn } }
            },
            scales: {
                y: { ticks: { callback: tickFn } }
            }
        };
    }

    function renderCharts() {
        const priceCtx  = document.getElementById('compare-price-chart').getContext('2d');
        const medianCtx = document.getElementById('compare-median-chart').getContext('2d');
        const volumeCtx = document.getElementById('compare-volume-chart').getContext('2d');

        if (priceChart)  priceChart.destroy();
        if (medianChart) medianChart.destroy();
        if (volumeChart) volumeChart.destroy();

        priceChart = new Chart(priceCtx, {
            type: 'line',
            data: { labels: YEARS, datasets: buildDatasets('avg') },
            options: baseChartOptions(priceTooltipLabel, priceTick)
        });

        medianChart = new Chart(medianCtx, {
            type: 'line',
            data: { labels: YEARS, datasets: buildDatasets('median') },
            options: baseChartOptions(priceTooltipLabel, priceTick)
        });

        volumeChart = new Chart(volumeCtx, {
            type: 'line',
            data: { labels: YEARS, datasets: buildDatasets('count') },
            options: baseChartOptions(volumeTooltipLabel, function(v) { return v.toLocaleString('en-GB'); })
        });
    }

    function updateCharts() {
        if (!priceChart || !medianChart || !volumeChart) return;

        priceChart.data.datasets  = buildDatasets('avg');
        medianChart.data.datasets = buildDatasets('median');
        volumeChart.data.datasets = buildDatasets('count');

        priceChart.update();
        medianChart.update();
        volumeChart.update();
    }

    // ── Stats grid ───────────────────────────────────────────────────────────

    function renderStats() {
        if (!statsGridEl) return;
        statsGridEl.innerHTML = '';

        areas.forEach(function(code, i) {
            const color = COLORS[i % COLORS.length];
            const name = districtNames[code] || null;

            // Latest stats (most recent year with data)
            let latestStats = null;
            let latestYear = null;
            for (let y = END_YEAR; y >= START_YEAR; y--) {
                const s = getSeriesValue(code, y, 'avg');
                if (s !== null) { latestStats = { avg: s }; latestYear = y; break; }
            }

            // 5-year change
            let fiveYearChange = null;
            const refYear = END_YEAR - 5;
            const refVal = getSeriesValue(code, refYear, 'avg');
            if (latestStats && refVal) {
                fiveYearChange = Math.round((latestStats.avg - refVal) / refVal * 100);
            }

            // Median
            const medianVal = latestYear ? getSeriesValue(code, latestYear, 'median') : null;

            // Sales count (not inflation-adjusted)
            let salesCount = null;
            if (latestYear) {
                const sectorData = allYearData[code] && allYearData[code][latestYear];
                if (sectorData) {
                    let td = sectorData[propType];
                    if (propType === 'A' && !td) td = computeAllAvg(sectorData);
                    if (td) salesCount = td.count;
                }
            }

            const fmt = p => p != null ? '\u00a3' + Math.round(p).toLocaleString('en-GB') : '–';
            const fmtChange = p => p != null ? (p >= 0 ? '+' + p + '%' : p + '%') : '–';

            const card = document.createElement('div');
            card.className = 'compare-stat-card';
            card.style.borderTopColor = color;

            card.innerHTML =
                '<div class="compare-stat-card-title">' +
                    '<span class="compare-stat-card-dot" style="background:' + color + '"></span>' +
                    '<span>' + code + (name ? ' – ' + name : '') + '</span>' +
                '</div>' +
                '<div class="compare-stat-row">' +
                    '<span class="compare-stat-label">Avg price</span>' +
                    '<span class="compare-stat-value">' + fmt(latestStats && latestStats.avg) + '</span>' +
                '</div>' +
                '<div class="compare-stat-row">' +
                    '<span class="compare-stat-label">Median</span>' +
                    '<span class="compare-stat-value">' + fmt(medianVal) + '</span>' +
                '</div>' +
                '<div class="compare-stat-row">' +
                    '<span class="compare-stat-label">Sales (' + (latestYear || '–') + ')</span>' +
                    '<span class="compare-stat-value">' + (salesCount != null ? salesCount.toLocaleString('en-GB') : '–') + '</span>' +
                '</div>' +
                '<div class="compare-stat-row">' +
                    '<span class="compare-stat-label">5-year change</span>' +
                    '<span class="compare-stat-value" style="color:' + (fiveYearChange >= 0 ? '#27ae60' : '#c0392b') + '">' + fmtChange(fiveYearChange) + '</span>' +
                '</div>';

            statsGridEl.appendChild(card);
        });
    }

    // ── Controls ─────────────────────────────────────────────────────────────

    function setupControls() {
        const propSelect = document.getElementById('compare-prop-type');
        if (propSelect) {
            propSelect.addEventListener('change', function() {
                propType = propSelect.value;
                renderStats();
                updateCharts();
            });
        }

        document.querySelectorAll('.compare-mode-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                isReal = btn.dataset.mode === 'real';
                document.querySelectorAll('.compare-mode-btn').forEach(function(b) {
                    b.classList.toggle('active', b === btn);
                });
                renderStats();
                updateCharts();
            });
        });
    }

    // ── Boot ─────────────────────────────────────────────────────────────────

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
