import * as DataLoader from './data-loader';
import type { PriceStats, SectorData } from './types';

const YEAR_MIN = 1995;
const YEAR_MAX = 2025;
const DEFAULT_YEAR = 2025;

const PROP_TYPES = [
  { code: 'A', label: 'All Types' },
  { code: 'D', label: 'Detached' },
  { code: 'S', label: 'Semi-det.' },
  { code: 'T', label: 'Terraced' },
  { code: 'F', label: 'Flat' },
];

let districtNames: Record<string, string> | null = null;
let currentYear = DEFAULT_YEAR;
let currentType = 'A';
let sortCol = 'avg';
let sortDir = -1;
let cachedYearData: Record<string, SectorData> | null = null;
let allRows: Array<{ code: string; name: string; typeStats: Record<string, PriceStats | null> }> = [];

async function initBrowse(): Promise<void> {
  showLoading(true);
  try {
    const [names, yearData] = await Promise.all([
      fetch('/api/data/district-names').then((r) => {
        if (!r.ok) throw new Error('Failed to load district names');
        return r.json();
      }),
      DataLoader.loadPriceData(DEFAULT_YEAR),
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

function buildRows(): void {
  allRows = [];
  if (!cachedYearData) return;
  for (const code in cachedYearData) {
    const distData = cachedYearData[code]!;
    const typeStats: Record<string, PriceStats | null> = {};
    for (const pt of PROP_TYPES) {
      typeStats[pt.code] = distData[pt.code] ?? null;
    }
    allRows.push({ code, name: districtNames?.[code] ?? '', typeStats });
  }
}

function getStats(row: (typeof allRows)[number]): PriceStats | null {
  return row.typeStats[currentType] ?? null;
}

function renderTable(): void {
  const withData = allRows.filter((r) => getStats(r) !== null);
  const noData = allRows.filter((r) => getStats(r) === null);

  withData.sort((a, b) => {
    const sa = getStats(a)!;
    const sb = getStats(b)!;
    if (sortCol === 'avg') return sortDir * (sa.avg - sb.avg);
    if (sortCol === 'median') return sortDir * (sa.median - sb.median);
    if (sortCol === 'count') return sortDir * (sa.count - sb.count);
    if (sortCol === 'code') return sortDir * a.code.localeCompare(b.code);
    if (sortCol === 'name') return sortDir * a.name.localeCompare(b.name);
    return 0;
  });

  const typeLabel = PROP_TYPES.find((p) => p.code === currentType)?.label || currentType;
  document.getElementById('browse-summary')!.textContent =
    `Showing ${withData.length.toLocaleString('en-GB')} districts \u00b7 ${currentYear} \u00b7 ${typeLabel}`;

  document.querySelectorAll<HTMLElement>('.sort-th').forEach((th) => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset['col'] === sortCol) {
      th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
    }
  });

  const tbody = document.getElementById('browse-tbody')!;
  let rank = 0;
  const html = [...withData, ...noData]
    .map((row) => {
      const stats = getStats(row);
      if (stats) {
        rank++;
        return `<tr>
        <td class="col-rank">${rank}</td>
        <td class="col-code"><a href="/area/${row.code}">${row.code}</a></td>
        <td class="col-name">${escHtml(row.name) || '\u2013'}</td>
        <td class="col-num">${fmt(stats.avg)}</td>
        <td class="col-num">${fmt(stats.median)}</td>
        <td class="col-num">${stats.count.toLocaleString('en-GB')}</td>
      </tr>`;
      } else {
        return `<tr class="row-no-data">
        <td class="col-rank">\u2013</td>
        <td class="col-code"><a href="/area/${row.code}">${row.code}</a></td>
        <td class="col-name">${escHtml(row.name) || '\u2013'}</td>
        <td class="col-num">\u2013</td>
        <td class="col-num">\u2013</td>
        <td class="col-num">\u2013</td>
      </tr>`;
      }
    })
    .join('');
  tbody.innerHTML = html;
}

function fmt(p: number): string {
  return '\u00a3' + Math.round(p).toLocaleString('en-GB');
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showLoading(on: boolean): void {
  document.getElementById('browse-loading')!.style.display = on ? 'flex' : 'none';
  document.getElementById('browse-content')!.style.display = on ? 'none' : '';
}

function showError(msg: string): void {
  const el = document.getElementById('browse-error')!;
  el.textContent = msg;
  el.style.display = '';
}

document.addEventListener('DOMContentLoaded', async () => {
  const yearSelect = document.getElementById('browse-year') as HTMLSelectElement;
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

  document.querySelectorAll<HTMLElement>('[data-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentType = btn.dataset['type']!;
      document.querySelectorAll('[data-type]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderTable();
    });
  });

  document.querySelectorAll<HTMLElement>('.sort-th').forEach((th) => {
    th.addEventListener('click', () => {
      const col = th.dataset['col']!;
      if (sortCol === col) {
        sortDir = -sortDir;
      } else {
        sortCol = col;
        sortDir = col === 'avg' || col === 'median' || col === 'count' ? -1 : 1;
      }
      renderTable();
    });
  });

  await initBrowse();
});
