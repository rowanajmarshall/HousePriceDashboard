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

    // Extract postcode from URL: /area/SY23 → SY23
    const pathParts = window.location.pathname.replace(/\/$/, '').split('/');
    const sectorCode = (pathParts[pathParts.length - 1] || '').toUpperCase();

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

    // ------------------------------------------------------------------ init

    function init() {
        // Validate: UK postcode district is 1-2 letters + 1-2 digits + optional letter
        if (!sectorCode || !/^[A-Z]{1,2}\d{1,2}[A-Z]?$/.test(sectorCode)) {
            showError('Invalid postcode in URL. Please return to the map and click a postcode area.');
            return;
        }

        headingEl.textContent = sectorCode + ' \u2014 House Price History';
        document.title = sectorCode + ' \u2014 House Price History | UK House Price Heatmap';

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
                    legend: { position: 'top' },
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
                    legend: { position: 'top' },
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
                    legend: { position: 'top' },
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
                if (priceChart) {
                    priceChart.setDatasetVisibility(idx, cb.checked);
                    priceChart.update();
                }
                if (medianChart) {
                    medianChart.setDatasetVisibility(idx, cb.checked);
                    medianChart.update();
                }
                if (volumeChart) {
                    volumeChart.setDatasetVisibility(idx, cb.checked);
                    volumeChart.update();
                }
            });
        });

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

    function updatePriceDatasets() {
        getPriceDatasets(isReal).forEach(function (ds, i) {
            if (priceChart) priceChart.data.datasets[i].data = ds.data;
        });
        if (priceChart) priceChart.update();

        getMedianDatasets(isReal).forEach(function (ds, i) {
            if (medianChart) medianChart.data.datasets[i].data = ds.data;
        });
        if (medianChart) medianChart.update();
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
