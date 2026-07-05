/**
 * Browse Page — Postcode District League Table
 */
(function () {
    const YEAR_MIN = 1995;
    // Latest year with data — injected by the server, clock year as fallback
    const YEAR_MAX = window.DATA_MAX_YEAR || new Date().getFullYear();
    const DEFAULT_YEAR = YEAR_MAX - 1; // last complete year

    const PROP_TYPES = [
        { code: 'A', label: 'All Types' },
        { code: 'D', label: 'Detached' },
        { code: 'S', label: 'Semi-det.' },
        { code: 'T', label: 'Terraced' },
        { code: 'F', label: 'Flat' },
    ];

    let districtNames = null; // { "AL1": "St Albans", ... }
    let currentYear = DEFAULT_YEAR;
    let currentType = 'A';
    let sortCol = 'avg';
    let sortDir = -1; // -1 = descending, 1 = ascending
    let cachedYearData = null; // yearData.data object for current year
    let allRows = []; // flat array built from cachedYearData + districtNames

    // ── Data loading ──────────────────────────────────────────────────────────

    async function init() {
        showLoading(true);
        try {
            const [names, yearData] = await Promise.all([
                fetch('/api/data/district-names').then(r => {
                    if (!r.ok) throw new Error('Failed to load district names');
                    return r.json();
                }),
                DataLoader.loadPriceData(DEFAULT_YEAR)
            ]);
            districtNames = names;
            cachedYearData = yearData.data;
            buildRows();
            renderTable();
        } catch (e) {
            console.error(e);
            showError('Failed to load data. Please refresh the page.');
        } finally {
            showLoading(false);
        }
    }

    function buildRows() {
        allRows = [];
        for (const code in cachedYearData) {
            const distData = cachedYearData[code];
            const typeStats = {};
            for (const pt of PROP_TYPES) {
                typeStats[pt.code] = distData[pt.code] || null;
            }
            allRows.push({ code, name: districtNames[code] || '', typeStats });
        }
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    function getStats(row) {
        return row.typeStats[currentType];
    }

    function renderTable() {
        const withData = allRows.filter(r => getStats(r) !== null);
        const noData = allRows.filter(r => getStats(r) === null);

        // Sort rows that have data
        withData.sort((a, b) => {
            const sa = getStats(a);
            const sb = getStats(b);
            if (sortCol === 'avg') return sortDir * (sa.avg - sb.avg);
            if (sortCol === 'median') return sortDir * (sa.median - sb.median);
            if (sortCol === 'count') return sortDir * (sa.count - sb.count);
            if (sortCol === 'code') return sortDir * a.code.localeCompare(b.code);
            if (sortCol === 'name') return sortDir * a.name.localeCompare(b.name);
            return 0;
        });

        // Update summary line
        const typeLabel = PROP_TYPES.find(p => p.code === currentType)?.label || currentType;
        document.getElementById('browse-summary').textContent =
            `Showing ${withData.length.toLocaleString('en-GB')} districts · ${currentYear} · ${typeLabel}`;

        // Update sort indicators on column headers
        document.querySelectorAll('.sort-th').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.col === sortCol) {
                th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
            }
        });

        // Build table rows
        const tbody = document.getElementById('browse-tbody');
        let rank = 0;
        const html = [...withData, ...noData].map(row => {
            const stats = getStats(row);
            if (stats) {
                rank++;
                return `<tr>
                    <td class="col-rank">${rank}</td>
                    <td class="col-code"><a href="/area/${row.code}">${row.code}</a></td>
                    <td class="col-name">${escHtml(row.name) || '–'}</td>
                    <td class="col-num">${fmt(stats.avg)}</td>
                    <td class="col-num">${fmt(stats.median)}</td>
                    <td class="col-num">${stats.count.toLocaleString('en-GB')}</td>
                </tr>`;
            } else {
                return `<tr class="row-no-data">
                    <td class="col-rank">–</td>
                    <td class="col-code"><a href="/area/${row.code}">${row.code}</a></td>
                    <td class="col-name">${escHtml(row.name) || '–'}</td>
                    <td class="col-num">–</td>
                    <td class="col-num">–</td>
                    <td class="col-num">–</td>
                </tr>`;
            }
        }).join('');
        tbody.innerHTML = html;
    }

    function fmt(p) {
        return '£' + Math.round(p).toLocaleString('en-GB');
    }

    function escHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function showLoading(on) {
        document.getElementById('browse-loading').style.display = on ? 'flex' : 'none';
        document.getElementById('browse-content').style.display = on ? 'none' : '';
    }

    function showError(msg) {
        const el = document.getElementById('browse-error');
        el.textContent = msg;
        el.style.display = '';
    }

    // ── Event wiring ──────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', async () => {
        // Year dropdown
        const yearSelect = document.getElementById('browse-year');
        yearSelect.addEventListener('change', async () => {
            currentYear = parseInt(yearSelect.value, 10);
            showLoading(true);
            try {
                const d = await DataLoader.loadPriceData(currentYear);
                cachedYearData = d.data;
                buildRows();
                renderTable();
            } catch (e) {
                console.error(e);
                showError('Failed to load data for ' + currentYear);
            } finally {
                showLoading(false);
            }
        });

        // Property type toggle buttons
        document.querySelectorAll('[data-type]').forEach(btn => {
            btn.addEventListener('click', () => {
                currentType = btn.dataset.type;
                document.querySelectorAll('[data-type]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderTable();
            });
        });

        // Sortable column headers
        document.querySelectorAll('.sort-th').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.col;
                if (sortCol === col) {
                    sortDir = -sortDir;
                } else {
                    sortCol = col;
                    // Numeric columns default desc; text columns default asc
                    sortDir = (col === 'avg' || col === 'median' || col === 'count') ? -1 : 1;
                }
                renderTable();
            });
        });

        await init();
    });
})();
