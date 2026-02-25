(function () {
    const START_YEAR = 1995;
    const END_YEAR = 2025;
    const YEARS = [];
    for (let y = START_YEAR; y <= END_YEAR; y++) YEARS.push(y);

    const PROPERTY_TYPES = [
        { code: 'A', label: 'All',        color: '#2c3e50' },
        { code: 'D', label: 'Detached',   color: '#e74c3c' },
        { code: 'S', label: 'Semi',       color: '#3498db' },
        { code: 'T', label: 'Terraced',   color: '#2ecc71' },
        { code: 'F', label: 'Flat',       color: '#9b59b6' }
    ];

    // Extract postcode from URL path (/area/SW1) or query param (?code=SW1).
    // Regular pages arrive via the Worker with the path intact.
    // Embed iframes use /area-page?code=SW1&embed=price (static file, no Worker).
    const searchParams = new URLSearchParams(window.location.search);
    const pathParts    = window.location.pathname.replace(/\/$/, '').split('/');
    const pathCode     = (pathParts[pathParts.length - 1] || '').toUpperCase();
    const POSTCODE_RE  = /^[A-Z]{1,2}\d{1,2}[A-Z]?$/;
    const sectorCode   = POSTCODE_RE.test(pathCode)
        ? pathCode
        : (searchParams.get('code') || '').toUpperCase();

    // Embed mode: ?embed=price|median|volume  (+ optional &real=1)
    const embedChart = searchParams.get('embed');  // null if not an embed
    const isEmbed    = !!embedChart;

    // DOM references
    const headingEl  = document.getElementById('area-heading');
    const loadingEl  = document.getElementById('area-loading');
    const contentEl  = document.getElementById('area-content');
    const errorEl    = document.getElementById('area-error');
    const filtersEl  = document.getElementById('prop-type-filters');

    let priceChart  = null;
    let medianChart = null;
    let volumeChart = null;
    let allYearData = null;  // { [year]: sectorData | null }
    let inflationData = null;
    let isReal = false;

    // ------------------------------------------------------------------ SEO helpers

    function setMetaTag(selector, attr, value) {
        let el = document.querySelector(selector);
        if (!el) {
            el = document.createElement('meta');
            const parts = selector.match(/\[(\w+[^=]*)="([^"]+)"\]/);
            if (parts) el.setAttribute(parts[1], parts[2]);
            document.head.appendChild(el);
        }
        el.setAttribute(attr, value);
    }

    function setCanonical(url) {
        let el = document.querySelector('link[rel="canonical"]');
        if (!el) {
            el = document.createElement('link');
            el.setAttribute('rel', 'canonical');
            document.head.appendChild(el);
        }
        el.setAttribute('href', url);
    }

    function setJsonLd(data) {
        let el = document.getElementById('area-json-ld');
        if (!el) {
            el = document.createElement('script');
            el.id = 'area-json-ld';
            el.type = 'application/ld+json';
            document.head.appendChild(el);
        }
        el.textContent = JSON.stringify(data);
    }

    function applyMetaTags(code, description) {
        const title = code + ' House Prices | UK House Price Heatmap';
        const pageUrl = 'https://housepricedashboard.co.uk/area/' + code;

        document.title = code + ' \u2014 House Price History | UK House Price Heatmap';
        setCanonical(pageUrl);

        setMetaTag('meta[name="description"]', 'content', description);
        setMetaTag('meta[property="og:title"]', 'content', title);
        setMetaTag('meta[property="og:description"]', 'content', description);
        setMetaTag('meta[property="og:url"]', 'content', pageUrl);
        setMetaTag('meta[name="twitter:title"]', 'content', title);
        setMetaTag('meta[name="twitter:description"]', 'content', description);

        setJsonLd({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            'itemListElement': [
                { '@type': 'ListItem', 'position': 1, 'name': 'UK House Price Heatmap', 'item': 'https://housepricedashboard.co.uk/' },
                { '@type': 'ListItem', 'position': 2, 'name': code + ' House Prices', 'item': pageUrl }
            ]
        });
    }

    function getLatestAvgPrice() {
        for (let y = END_YEAR; y >= START_YEAR; y--) {
            const yd = allYearData[y];
            if (!yd) continue;
            let typeData = yd['A'];
            if (!typeData) typeData = computeAllAvg(yd);
            if (typeData && typeData.avg) return { year: y, price: typeData.avg };
        }
        return null;
    }

    // ------------------------------------------------------------------ init

    function init() {
        // Validate: UK postcode district is 1-2 letters + 1-2 digits + optional letter
        if (!sectorCode || !/^[A-Z]{1,2}\d{1,2}[A-Z]?$/.test(sectorCode)) {
            showError('Invalid postcode in URL. Please return to the map and click a postcode area.');
            return;
        }

        headingEl.textContent = sectorCode + ' \u2014 House Price History';

        // Set initial meta tags with template description (updated with real data after load)
        if (!isEmbed) {
            applyMetaTags(sectorCode, 'House price history for ' + sectorCode + ' postcode district \u2014 explore average and median prices from 1995 to 2025 for detached, semi-detached, terraced and flat properties.');
        }

        // Apply embed mode
        if (isEmbed) {
            document.body.classList.add('embed-mode');
            if (searchParams.get('real') === '1') isReal = true;
        }

        // Fire a named Simple Analytics event with the postcode (non-embed only).
        if (!isEmbed) {
            window.sa_event = window.sa_event || function () {
                (window.sa_event.q = window.sa_event.q || []).push([].slice.call(arguments));
            };
            window.sa_event('area_' + sectorCode.toLowerCase());
        }

        buildPropertyTypeFilters();
        loadData();
    }

    // -------------------------------------------------------- build controls

    function buildPropertyTypeFilters() {
        PROPERTY_TYPES.forEach(({ code, label, color }, index) => {
            const lbl = document.createElement('label');
            lbl.className = 'prop-type-label';
            lbl.innerHTML =
                '<input type="checkbox" class="prop-type-checkbox" data-index="' + index + '" checked>' +
                '<span class="prop-type-dot" style="background:' + color + '"></span>' +
                '<span class="prop-type-text">' + label + '</span>';
            filtersEl.appendChild(lbl);
        });
    }

    // --------------------------------------------------------------- data load

    async function loadData() {
        try {
            const promises = [
                ...YEARS.map(y => DataLoader.loadPriceData(y).catch(() => null)),
                DataLoader.loadInflation()
            ];
            const results = await Promise.all(promises);

            inflationData = results[YEARS.length];

            allYearData = {};
            YEARS.forEach((year, i) => {
                const yearResult = results[i];
                if (yearResult && yearResult.data) {
                    allYearData[year] = yearResult.data[sectorCode] || null;
                } else {
                    allYearData[year] = null;
                }
            });

            const hasAnyData = Object.values(allYearData).some(d => d !== null);
            if (!hasAnyData) {
                showError('No sales data found for postcode district ' + sectorCode + '. This may be a very rural area or the code may not exist.');
                return;
            }

            // Update meta description with real price data
            if (!isEmbed) {
                const latest = getLatestAvgPrice();
                if (latest) {
                    const priceStr = '\u00a3' + latest.price.toLocaleString('en-GB');
                    applyMetaTags(sectorCode, sectorCode + ' house prices: average ' + priceStr + ' (' + latest.year + '). Explore 30 years of property price history (1995\u20132025) including detached, semi-detached, terraced and flat homes. Data from UK Land Registry.');
                }
            }

            setupControls();
            renderPriceChart();
            renderMedianChart();
            renderVolumeChart();

            loadingEl.style.display = 'none';
            contentEl.style.display = 'block';
        } catch (err) {
            console.error('Failed to load area data:', err);
            showError('Failed to load price data. Please try refreshing the page.');
        }
    }

    // ----------------------------------------------------------- dataset builders

    function getPriceDatasets(real) {
        return PROPERTY_TYPES.map(({ code, label, color }) => {
            const data = YEARS.map(year => {
                const yearData = allYearData[year];
                if (!yearData) return null;

                let typeData = yearData[code];

                // For 'A', fall back to computing from individual types if not pre-computed
                if (code === 'A' && !typeData) {
                    typeData = computeAllAvg(yearData);
                }

                if (!typeData || !typeData.avg) return null;

                let price = typeData.avg;
                if (real && inflationData && inflationData.data) {
                    const fromCPI = inflationData.data[String(year)];
                    const toCPI   = inflationData.data[String(END_YEAR)];
                    if (fromCPI && toCPI) {
                        price = Math.round(price * (toCPI / fromCPI));
                    }
                }
                return price;
            });

            return {
                label,
                data,
                borderColor: color,
                backgroundColor: color + '18',
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5,
                tension: 0.3,
                spanGaps: true
            };
        });
    }

    function computeAllAvg(sectorData) {
        const types = ['D', 'S', 'T', 'F'];
        let totalCount = 0;
        let weightedSum = 0;
        for (const t of types) {
            if (sectorData[t] && sectorData[t].avg) {
                totalCount += sectorData[t].count;
                weightedSum += sectorData[t].avg * sectorData[t].count;
            }
        }
        if (totalCount === 0) return null;
        return { avg: Math.round(weightedSum / totalCount), count: totalCount };
    }

    function getMedianDatasets(real) {
        return PROPERTY_TYPES.map(({ code, label, color }) => {
            const data = YEARS.map(year => {
                const yearData = allYearData[year];
                if (!yearData) return null;

                let typeData = yearData[code];
                if (code === 'A' && !typeData) typeData = computeAllAvg(yearData);
                if (!typeData || !typeData.median) return null;

                let price = typeData.median;
                if (real && inflationData && inflationData.data) {
                    const fromCPI = inflationData.data[String(year)];
                    const toCPI   = inflationData.data[String(END_YEAR)];
                    if (fromCPI && toCPI) price = Math.round(price * (toCPI / fromCPI));
                }
                return price;
            });

            return {
                label,
                data,
                borderColor: color,
                backgroundColor: color + '18',
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5,
                tension: 0.3,
                spanGaps: true
            };
        });
    }

    function getVolumeDatasets() {
        return PROPERTY_TYPES.map(({ code, label, color }) => {
            const data = YEARS.map(year => {
                const yearData = allYearData[year];
                if (!yearData) return null;

                if (code === 'A') {
                    if (yearData['A'] && yearData['A'].count) return yearData['A'].count;
                    let total = 0;
                    for (const t of ['D', 'S', 'T', 'F']) {
                        if (yearData[t]) total += yearData[t].count;
                    }
                    return total || null;
                }

                return (yearData[code] && yearData[code].count) ? yearData[code].count : null;
            });

            return {
                label,
                data,
                borderColor: color,
                backgroundColor: color + '18',
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5,
                tension: 0.3,
                spanGaps: true
            };
        });
    }

    // ------------------------------------------------------------------ charts

    // Tracks which dataset indices the user has hidden — single source of truth
    // used by all three charts' generateLabels so Chart.js internals can't interfere.
    const hiddenDatasets = new Set();

    // Shared legend config: fades hidden datasets instead of striking through them
    const fadedLegend = {
        position: 'top',
        onClick: function (e, legendItem) {
            const idx = legendItem.datasetIndex;
            if (hiddenDatasets.has(idx)) {
                hiddenDatasets.delete(idx);
            } else {
                hiddenDatasets.add(idx);
            }
            const isHidden = hiddenDatasets.has(idx);
            // Sync the checkbox
            const cb = document.querySelector('.prop-type-checkbox[data-index="' + idx + '"]');
            if (cb) cb.checked = !isHidden;
            // Update all charts so all legends redraw with faded style
            [priceChart, medianChart, volumeChart].forEach(function (chart) {
                if (chart) {
                    chart.data.datasets[idx].hidden = isHidden;
                    chart.update();
                }
            });
        },
        labels: {
            generateLabels: function (chart) {
                const labels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                labels.forEach(function (label) {
                    label.hidden = false; // always suppress strikethrough
                    if (hiddenDatasets.has(label.datasetIndex)) {
                        label.fontColor   = 'rgba(0, 0, 0, 0.25)';
                        label.strokeStyle = 'rgba(0, 0, 0, 0.1)';
                        label.fillStyle   = 'rgba(0, 0, 0, 0.05)';
                    }
                });
                return labels;
            }
        }
    };

    function renderPriceChart() {
        const ctx = document.getElementById('price-chart').getContext('2d');
        if (priceChart) priceChart.destroy();

        priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: YEARS,
                datasets: getPriceDatasets(isReal)
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: fadedLegend,
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const v = ctx.parsed.y;
                                if (v === null || v === undefined) return ctx.dataset.label + ': No data';
                                return ctx.dataset.label + ': \u00a3' + v.toLocaleString('en-GB');
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: function (v) {
                                if (v >= 1000000) return '\u00a3' + (v / 1000000).toFixed(1) + 'm';
                                if (v >= 1000)    return '\u00a3' + Math.round(v / 1000) + 'k';
                                return '\u00a3' + v;
                            }
                        }
                    }
                }
            }
        });
    }

    function renderMedianChart() {
        const ctx = document.getElementById('median-chart').getContext('2d');
        if (medianChart) medianChart.destroy();

        medianChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: YEARS,
                datasets: getMedianDatasets(isReal)
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: fadedLegend,
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const v = ctx.parsed.y;
                                if (v === null || v === undefined) return ctx.dataset.label + ': No data';
                                return ctx.dataset.label + ': \u00a3' + v.toLocaleString('en-GB');
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: function (v) {
                                if (v >= 1000000) return '\u00a3' + (v / 1000000).toFixed(1) + 'm';
                                if (v >= 1000)    return '\u00a3' + Math.round(v / 1000) + 'k';
                                return '\u00a3' + v;
                            }
                        }
                    }
                }
            }
        });
    }

    function renderVolumeChart() {
        const ctx = document.getElementById('volume-chart').getContext('2d');
        if (volumeChart) volumeChart.destroy();

        volumeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: YEARS,
                datasets: getVolumeDatasets()
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: fadedLegend,
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const v = ctx.parsed.y;
                                if (v === null || v === undefined) return ctx.dataset.label + ': No data';
                                return ctx.dataset.label + ': ' + v.toLocaleString('en-GB') + ' sales';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: function (v) {
                                return v.toLocaleString('en-GB');
                            }
                        }
                    }
                }
            }
        });
    }

    // ---------------------------------------------------------- controls wiring

    function setupControls() {
        // Nominal / Real toggle
        document.querySelectorAll('.mode-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                isReal = btn.dataset.mode === 'real';
                document.querySelectorAll('.mode-btn').forEach(function (b) {
                    b.classList.toggle('active', b.dataset.mode === (isReal ? 'real' : 'nominal'));
                });
                updatePriceDatasets();
            });
        });

        // Property type checkboxes
        document.querySelectorAll('.prop-type-checkbox').forEach(function (cb) {
            cb.addEventListener('change', function () {
                const idx = parseInt(cb.dataset.index, 10);
                if (cb.checked) {
                    hiddenDatasets.delete(idx);
                } else {
                    hiddenDatasets.add(idx);
                }
                if (priceChart) {
                    priceChart.data.datasets[idx].hidden = !cb.checked;
                    priceChart.update();
                }
                if (medianChart) {
                    medianChart.data.datasets[idx].hidden = !cb.checked;
                    medianChart.update();
                }
                if (volumeChart) {
                    volumeChart.data.datasets[idx].hidden = !cb.checked;
                    volumeChart.update();
                }
            });
        });

        setupEmbedButtons();

        // Download buttons
        document.getElementById('download-price').addEventListener('click', function () {
            downloadChart('price-chart', 'Average Price by Year', true, sectorCode + '-prices');
        });
        document.getElementById('download-median').addEventListener('click', function () {
            downloadChart('median-chart', 'Median Price by Year', true, sectorCode + '-median');
        });
        document.getElementById('download-volume').addEventListener('click', function () {
            downloadChart('volume-chart', 'Transaction Volume by Year', false, sectorCode + '-volume');
        });
    }

    // --------------------------------------------------------------- embed

    const CHART_LABELS = { price: 'Average Price', median: 'Median Price', volume: 'Transaction Volume' };

    function getEmbedUrl(chartKey) {
        // Use /area-page directly (static file, no Worker needed) with code as a query param.
        const params = new URLSearchParams({ code: sectorCode, embed: chartKey });
        if (isReal && chartKey !== 'volume') params.set('real', '1');
        return window.location.origin + '/area-page?' + params.toString();
    }

    function buildIframeSnippet(chartKey) {
        const url = getEmbedUrl(chartKey);
        return '<iframe src="' + url + '" width="100%" height="450" frameborder="0" ' +
               'style="border:1px solid #e0e0e0;border-radius:4px;" ' +
               'title="' + sectorCode + ' ' + CHART_LABELS[chartKey] + '"></iframe>';
    }

    function setEmbedFooter(chartKey) {
        const footer = document.getElementById('embed-footer-' + chartKey);
        if (!footer) return;
        const modeLabel = (chartKey !== 'volume' && isReal) ? ' · Real (2025 \u00a3)' : '';
        footer.innerHTML =
            '<span>' + sectorCode + ' \u00b7 ' + CHART_LABELS[chartKey] + modeLabel + '</span>' +
            '<a href="' + window.location.origin + '/area/' + sectorCode + '" target="_blank">' +
            'housepricedashboard.co.uk \u2197</a>';
    }

    function refreshOpenEmbedPanels() {
        document.querySelectorAll('.embed-panel').forEach(function (panel) {
            if (panel.style.display !== 'none') {
                const chartKey = panel.id.replace('embed-panel-', '');
                const codeEl = document.getElementById('embed-code-' + chartKey);
                if (codeEl) codeEl.textContent = buildIframeSnippet(chartKey);
            }
        });
    }

    function setupEmbedButtons() {
        // Embed buttons — toggle panel visibility and populate code
        document.querySelectorAll('.chart-embed-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const chartKey = btn.dataset.chart;
                const panel    = document.getElementById('embed-panel-' + chartKey);
                const codeEl   = document.getElementById('embed-code-' + chartKey);
                const isOpen   = panel.style.display === 'block';

                // Close all panels first
                document.querySelectorAll('.embed-panel').forEach(function (p) { p.style.display = 'none'; });
                document.querySelectorAll('.chart-embed-btn').forEach(function (b) { b.classList.remove('active'); });

                if (!isOpen) {
                    codeEl.textContent = buildIframeSnippet(chartKey);
                    panel.style.display = 'block';
                    btn.classList.add('active');
                }
            });
        });

        // Copy buttons
        document.querySelectorAll('.copy-embed-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const codeEl = document.getElementById(btn.dataset.target);
                navigator.clipboard.writeText(codeEl.textContent).then(function () {
                    const orig = btn.textContent;
                    btn.textContent = 'Copied!';
                    setTimeout(function () { btn.textContent = orig; }, 2000);
                });
            });
        });

        // In embed mode: hide all chart sections except the target, populate footer
        if (isEmbed) {
            document.querySelectorAll('.chart-section').forEach(function (section) {
                if (section.dataset.chart !== embedChart) {
                    section.style.display = 'none';
                }
            });
            setEmbedFooter(embedChart);
        }
    }

    function updatePriceDatasets() {
        getPriceDatasets(isReal).forEach(function (ds, i) {
            if (priceChart) priceChart.data.datasets[i].data = ds.data;
        });
        if (priceChart) priceChart.update();

        getMedianDatasets(isReal).forEach(function (ds, i) {
            if (medianChart) medianChart.data.datasets[i].data = ds.data;
        });
        if (medianChart) medianChart.update();

        // Refresh any open embed code panels (real/nominal affects the URL)
        refreshOpenEmbedPanels();
        if (isEmbed) setEmbedFooter(embedChart);
    }

    // --------------------------------------------------------------- download

    function downloadChart(canvasId, chartTitle, showMode, filename) {
        const sourceCanvas = document.getElementById(canvasId);

        const chartW  = sourceCanvas.offsetWidth;
        const chartH  = sourceCanvas.offsetHeight;
        const headerH = 72;
        const footerH = 38;
        const scale   = 2; // retina

        const output = document.createElement('canvas');
        output.width  = chartW  * scale;
        output.height = (headerH + chartH + footerH) * scale;

        const ctx = output.getContext('2d');
        ctx.scale(scale, scale);

        // White base
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, chartW, headerH + chartH + footerH);

        // ── Header ──────────────────────────────────────────────────────────
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(0, 0, chartW, headerH);

        // Postcode
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(sectorCode, 20, 35);

        // Chart subtitle
        ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        ctx.fillText(chartTitle, 20, 56);

        // Mode badge (price chart only)
        if (showMode) {
            const modeLabel = isReal ? 'Real (2025 \u00a3)' : 'Nominal';
            ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
            const badgeW = ctx.measureText(modeLabel).width + 18;
            const badgeX = chartW - badgeW - 16;

            ctx.fillStyle = isReal ? '#27ae60' : '#3498db';
            drawRoundRect(ctx, badgeX, 24, badgeW, 22, 4);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'right';
            ctx.fillText(modeLabel, chartW - 25, 39);
        }

        // ── Chart ────────────────────────────────────────────────────────────
        // Fill white behind chart in case Chart.js canvas is transparent
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, headerH, chartW, chartH);
        ctx.drawImage(sourceCanvas, 0, headerH, chartW, chartH);

        // ── Footer ───────────────────────────────────────────────────────────
        const footerY = headerH + chartH;

        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, footerY, chartW, footerH);

        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, footerY);
        ctx.lineTo(chartW, footerY);
        ctx.stroke();

        ctx.fillStyle = '#888888';
        ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('housepricedashboard.co.uk', chartW / 2, footerY + 25);

        // ── Download ─────────────────────────────────────────────────────────
        const link = document.createElement('a');
        link.download = filename + '.png';
        link.href = output.toDataURL('image/png');
        link.click();
    }

    function drawRoundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    // --------------------------------------------------------------- error

    function showError(msg) {
        loadingEl.style.display = 'none';
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
        headingEl.textContent = 'Area not found';
    }

    // Run
    init();
})();
