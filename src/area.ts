import * as DataLoader from './data-loader';
import type { PriceStats, SectorData, InflationData } from './types';

declare const Chart: any;

const START_YEAR = 1995;
const END_YEAR = 2025;
const YEARS: number[] = [];
for (let y = START_YEAR; y <= END_YEAR; y++) YEARS.push(y);

const PROPERTY_TYPES = [
  { code: 'A', label: 'All', color: '#2c3e50' },
  { code: 'D', label: 'Detached', color: '#e74c3c' },
  { code: 'S', label: 'Semi', color: '#3498db' },
  { code: 'T', label: 'Terraced', color: '#2ecc71' },
  { code: 'F', label: 'Flat', color: '#9b59b6' },
];

const searchParams = new URLSearchParams(window.location.search);
const pathParts = window.location.pathname.replace(/\/$/, '').split('/');
const pathCode = (pathParts[pathParts.length - 1] || '').toUpperCase();
const POSTCODE_RE = /^[A-Z]{1,2}\d{1,2}[A-Z]?$/;
const sectorCode = POSTCODE_RE.test(pathCode)
  ? pathCode
  : (searchParams.get('code') || '').toUpperCase();

const embedChart = searchParams.get('embed');
const isEmbed = !!embedChart;

const headingEl = document.getElementById('area-heading')!;
const loadingEl = document.getElementById('area-loading')!;
const contentEl = document.getElementById('area-content')!;
const errorEl = document.getElementById('area-error')!;
const filtersEl = document.getElementById('prop-type-filters')!;

let priceChart: any = null;
let medianChart: any = null;
let volumeChart: any = null;
let allYearData: Record<number, SectorData | null> = {};
let inflationData: InflationData | null = null;
let isReal = false;
let districtName: string | null = null;

// ── SEO helpers ──

function setMetaTag(selector: string, attr: string, value: string): void {
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    const parts = selector.match(/\[(\w+[^=]*)="([^"]+)"\]/);
    if (parts) el.setAttribute(parts[1]!, parts[2]!);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

function setCanonical(url: string): void {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', url);
}

function setJsonLd(data: unknown): void {
  let el = document.getElementById('area-json-ld') as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.id = 'area-json-ld';
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function applyMetaTags(code: string, description: string): void {
  const label = districtName ? districtName + ' - ' + code : code;
  const title = label + ' House Prices | UK House Price Heatmap';
  const pageUrl = 'https://housepricedashboard.co.uk/area/' + code;

  document.title = title;
  setCanonical(pageUrl);

  setMetaTag('meta[name="description"]', 'content', description);
  setMetaTag('meta[property="og:title"]', 'content', title);
  setMetaTag('meta[property="og:description"]', 'content', description);
  setMetaTag('meta[property="og:url"]', 'content', pageUrl);
  setMetaTag('meta[name="twitter:title"]', 'content', title);
  setMetaTag('meta[name="twitter:description"]', 'content', description);
  setMetaTag('meta[name="robots"]', 'content', 'index, follow');

  setJsonLd({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'UK House Price Heatmap', item: 'https://housepricedashboard.co.uk/' },
      { '@type': 'ListItem', position: 2, name: label + ' House Prices', item: pageUrl },
    ],
  });
}

function computeAllAvg(sectorData: SectorData): PriceStats | null {
  const types = ['D', 'S', 'T', 'F'];
  let totalCount = 0;
  let weightedSum = 0;
  for (const t of types) {
    if (sectorData[t]?.avg) {
      totalCount += sectorData[t]!.count;
      weightedSum += sectorData[t]!.avg * sectorData[t]!.count;
    }
  }
  if (totalCount === 0) return null;
  return { avg: Math.round(weightedSum / totalCount), count: totalCount, median: 0 };
}

function renderSummary(): void {
  if (isEmbed) return;
  const el = document.getElementById('area-summary');
  if (!el) return;

  const fmt = (p: number) => '\u00a3' + Math.round(p).toLocaleString('en-GB');

  let earliest: { year: number; price: number } | null = null;
  let latest: { year: number; price: number } | null = null;
  let peak: { year: number; price: number } | null = null;

  for (let y = START_YEAR; y <= END_YEAR; y++) {
    const yd = allYearData[y];
    if (!yd) continue;
    const td = yd['A'] || computeAllAvg(yd);
    if (!td?.avg) continue;
    if (!earliest) earliest = { year: y, price: td.avg };
    latest = { year: y, price: td.avg };
    if (!peak || td.avg > peak.price) peak = { year: y, price: td.avg };
  }

  if (!latest) return;

  let text = 'The average house price in ' + sectorCode + ' was ' + fmt(latest.price) + ' in ' + latest.year;

  if (earliest && earliest.year < latest.year) {
    const pct = Math.round(((latest.price - earliest.price) / earliest.price) * 100);
    text += ', ' + (pct >= 0 ? 'up ' + pct : 'down ' + Math.abs(pct)) + '% from ' + fmt(earliest.price) + ' in ' + earliest.year;
  }

  if (peak && peak.year !== latest.year) {
    text += '. Prices peaked at ' + fmt(peak.price) + ' in ' + peak.year;
  }

  el.textContent = text + '.';
}

function getLatestAvgPrice(): { year: number; price: number } | null {
  for (let y = END_YEAR; y >= START_YEAR; y--) {
    const yd = allYearData[y];
    if (!yd) continue;
    let typeData = yd['A'];
    if (!typeData) typeData = computeAllAvg(yd) ?? undefined;
    if (typeData?.avg) return { year: y, price: typeData.avg };
  }
  return null;
}

// ── Init ──

function init(): void {
  if (!sectorCode || !/^[A-Z]{1,2}\d{1,2}[A-Z]?$/.test(sectorCode)) {
    showError('Invalid postcode in URL. Please return to the map and click a postcode area.');
    return;
  }

  if (!isEmbed) {
    applyMetaTags(
      sectorCode,
      'House price history for the ' +
        sectorCode +
        ' postcode district \u2014 explore average and median prices from 1995 to 2025 for detached, semi-detached, terraced and flat properties.'
    );
  }

  if (isEmbed) {
    document.body.classList.add('embed-mode');
    if (searchParams.get('real') === '1') isReal = true;
  }

  if (!isEmbed) {
    window.sa_event =
      window.sa_event ||
      function (...args: unknown[]) {
        (window.sa_event!.q = window.sa_event!.q || []).push(args);
      };
    window.sa_event('area_' + sectorCode.toLowerCase());
    if (window.posthog) window.posthog.capture('area_page_viewed', { postcode_district: sectorCode });
  }

  buildPropertyTypeFilters();
  loadData();
}

function buildPropertyTypeFilters(): void {
  PROPERTY_TYPES.forEach(({ code, label, color }, index) => {
    const lbl = document.createElement('label');
    lbl.className = 'prop-type-label';
    lbl.innerHTML =
      '<input type="checkbox" class="prop-type-checkbox" data-index="' +
      index +
      '" checked>' +
      '<span class="prop-type-dot" style="background:' +
      color +
      '"></span>' +
      '<span class="prop-type-text">' +
      label +
      '</span>';
    filtersEl.appendChild(lbl);
  });
}

async function loadData(): Promise<void> {
  try {
    const [districtResult, inflation] = await Promise.all([
      fetch(`/api/data/district/${sectorCode}`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      DataLoader.loadInflation(),
    ]);

    inflationData = inflation;
    districtName = districtResult.name || null;
    headingEl.textContent = districtName ? districtName + ' - ' + sectorCode : sectorCode;

    allYearData = {};
    YEARS.forEach((year) => {
      allYearData[year] = districtResult.data[String(year)] || null;
    });

    const hasAnyData = Object.values(allYearData).some((d) => d !== null);
    if (!hasAnyData) {
      showError('No sales data found for postcode district ' + sectorCode + '. This may be a very rural area or the code may not exist.');
      return;
    }

    if (!isEmbed) {
      const latest = getLatestAvgPrice();
      if (latest) {
        const priceStr = '\u00a3' + latest.price.toLocaleString('en-GB');
        const locationStr = districtName ? districtName + ' (' + sectorCode + ')' : sectorCode;
        applyMetaTags(
          sectorCode,
          locationStr +
            ' house prices: average ' +
            priceStr +
            ' (' +
            latest.year +
            '). Explore 30 years of property price history (1995\u20132025) including detached, semi-detached, terraced and flat homes. Data from UK Land Registry.'
        );
      }
    }

    renderSummary();
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

// ── Dataset builders ──

function getPriceDatasets(real: boolean) {
  return PROPERTY_TYPES.map(({ code, label, color }) => {
    const data = YEARS.map((year) => {
      const yearData = allYearData[year];
      if (!yearData) return null;

      let typeData = yearData[code];
      if (code === 'A' && !typeData) typeData = computeAllAvg(yearData) ?? undefined;
      if (!typeData?.avg) return null;

      let price = typeData.avg;
      if (real && inflationData?.data) {
        const fromCPI = inflationData.data[String(year)];
        const toCPI = inflationData.data[String(END_YEAR)];
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
      spanGaps: true,
    };
  });
}

function getMedianDatasets(real: boolean) {
  return PROPERTY_TYPES.map(({ code, label, color }) => {
    const data = YEARS.map((year) => {
      const yearData = allYearData[year];
      if (!yearData) return null;

      let typeData = yearData[code];
      if (code === 'A' && !typeData) typeData = computeAllAvg(yearData) ?? undefined;
      if (!typeData?.median) return null;

      let price = typeData.median;
      if (real && inflationData?.data) {
        const fromCPI = inflationData.data[String(year)];
        const toCPI = inflationData.data[String(END_YEAR)];
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
      spanGaps: true,
    };
  });
}

function getVolumeDatasets() {
  return PROPERTY_TYPES.map(({ code, label, color }) => {
    const data = YEARS.map((year) => {
      const yearData = allYearData[year];
      if (!yearData) return null;

      if (code === 'A') {
        if (yearData['A']?.count) return yearData['A'].count;
        let total = 0;
        for (const t of ['D', 'S', 'T', 'F']) {
          if (yearData[t]) total += yearData[t]!.count;
        }
        return total || null;
      }

      return yearData[code]?.count ?? null;
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
      spanGaps: true,
    };
  });
}

// ── Charts ──

const hiddenDatasets = new Set<number>();

const fadedLegend = {
  position: 'top' as const,
  onClick: function (_e: unknown, legendItem: { datasetIndex: number }) {
    const idx = legendItem.datasetIndex;
    if (hiddenDatasets.has(idx)) {
      hiddenDatasets.delete(idx);
    } else {
      hiddenDatasets.add(idx);
    }
    const isHidden = hiddenDatasets.has(idx);
    const cb = document.querySelector(`.prop-type-checkbox[data-index="${idx}"]`) as HTMLInputElement | null;
    if (cb) cb.checked = !isHidden;
    [priceChart, medianChart, volumeChart].forEach(function (chart: any) {
      if (chart) {
        chart.data.datasets[idx].hidden = isHidden;
        chart.update();
      }
    });
  },
  labels: {
    generateLabels: function (chart: any) {
      const labels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
      labels.forEach(function (label: any) {
        label.hidden = false;
        if (hiddenDatasets.has(label.datasetIndex)) {
          label.fontColor = 'rgba(0, 0, 0, 0.25)';
          label.strokeStyle = 'rgba(0, 0, 0, 0.1)';
          label.fillStyle = 'rgba(0, 0, 0, 0.05)';
        }
      });
      return labels;
    },
  },
};

function renderPriceChart(): void {
  const ctx = (document.getElementById('price-chart') as HTMLCanvasElement).getContext('2d')!;
  if (priceChart) priceChart.destroy();

  priceChart = new Chart(ctx, {
    type: 'line',
    data: { labels: YEARS, datasets: getPriceDatasets(isReal) },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: fadedLegend,
        tooltip: {
          callbacks: {
            label: function (ctx: any) {
              const v = ctx.parsed.y;
              if (v === null || v === undefined) return ctx.dataset.label + ': No data';
              return ctx.dataset.label + ': \u00a3' + v.toLocaleString('en-GB');
            },
          },
        },
      },
      scales: {
        y: {
          ticks: {
            callback: function (v: number) {
              if (v >= 1000000) return '\u00a3' + (v / 1000000).toFixed(1) + 'm';
              if (v >= 1000) return '\u00a3' + Math.round(v / 1000) + 'k';
              return '\u00a3' + v;
            },
          },
        },
      },
    },
  });
}

function renderMedianChart(): void {
  const ctx = (document.getElementById('median-chart') as HTMLCanvasElement).getContext('2d')!;
  if (medianChart) medianChart.destroy();

  medianChart = new Chart(ctx, {
    type: 'line',
    data: { labels: YEARS, datasets: getMedianDatasets(isReal) },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: fadedLegend,
        tooltip: {
          callbacks: {
            label: function (ctx: any) {
              const v = ctx.parsed.y;
              if (v === null || v === undefined) return ctx.dataset.label + ': No data';
              return ctx.dataset.label + ': \u00a3' + v.toLocaleString('en-GB');
            },
          },
        },
      },
      scales: {
        y: {
          ticks: {
            callback: function (v: number) {
              if (v >= 1000000) return '\u00a3' + (v / 1000000).toFixed(1) + 'm';
              if (v >= 1000) return '\u00a3' + Math.round(v / 1000) + 'k';
              return '\u00a3' + v;
            },
          },
        },
      },
    },
  });
}

function renderVolumeChart(): void {
  const ctx = (document.getElementById('volume-chart') as HTMLCanvasElement).getContext('2d')!;
  if (volumeChart) volumeChart.destroy();

  volumeChart = new Chart(ctx, {
    type: 'line',
    data: { labels: YEARS, datasets: getVolumeDatasets() },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: fadedLegend,
        tooltip: {
          callbacks: {
            label: function (ctx: any) {
              const v = ctx.parsed.y;
              if (v === null || v === undefined) return ctx.dataset.label + ': No data';
              return ctx.dataset.label + ': ' + v.toLocaleString('en-GB') + ' sales';
            },
          },
        },
      },
      scales: {
        y: {
          ticks: {
            callback: function (v: number) {
              return v.toLocaleString('en-GB');
            },
          },
        },
      },
    },
  });
}

// ── Controls wiring ──

function setupControls(): void {
  document.querySelectorAll('.mode-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      isReal = (btn as HTMLElement).dataset['mode'] === 'real';
      document.querySelectorAll('.mode-btn').forEach(function (b) {
        b.classList.toggle('active', (b as HTMLElement).dataset['mode'] === (isReal ? 'real' : 'nominal'));
      });
      updatePriceDatasets();
    });
  });

  document.querySelectorAll<HTMLInputElement>('.prop-type-checkbox').forEach(function (cb) {
    cb.addEventListener('change', function () {
      const idx = parseInt(cb.dataset['index']!, 10);
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

  document.getElementById('download-price')!.addEventListener('click', function () {
    downloadChart('price-chart', 'Average Price by Year', true, sectorCode + '-prices');
    if (window.posthog) window.posthog.capture('chart_downloaded', { chart_type: 'price', postcode_district: sectorCode });
  });
  document.getElementById('download-median')!.addEventListener('click', function () {
    downloadChart('median-chart', 'Median Price by Year', true, sectorCode + '-median');
    if (window.posthog) window.posthog.capture('chart_downloaded', { chart_type: 'median', postcode_district: sectorCode });
  });
  document.getElementById('download-volume')!.addEventListener('click', function () {
    downloadChart('volume-chart', 'Transaction Volume by Year', false, sectorCode + '-volume');
    if (window.posthog) window.posthog.capture('chart_downloaded', { chart_type: 'volume', postcode_district: sectorCode });
  });
}

// ── Embed ──

const CHART_LABELS: Record<string, string> = { price: 'Average Price', median: 'Median Price', volume: 'Transaction Volume' };

function getEmbedUrl(chartKey: string): string {
  const params = new URLSearchParams({ code: sectorCode, embed: chartKey });
  if (isReal && chartKey !== 'volume') params.set('real', '1');
  return window.location.origin + '/area-page?' + params.toString();
}

function buildIframeSnippet(chartKey: string): string {
  const url = getEmbedUrl(chartKey);
  return (
    '<iframe src="' +
    url +
    '" width="100%" height="450" frameborder="0" ' +
    'style="border:1px solid #e0e0e0;border-radius:4px;" ' +
    'title="' +
    sectorCode +
    ' ' +
    CHART_LABELS[chartKey] +
    '"></iframe>'
  );
}

function setEmbedFooter(chartKey: string): void {
  const footer = document.getElementById('embed-footer-' + chartKey);
  if (!footer) return;
  const modeLabel = chartKey !== 'volume' && isReal ? ' \u00b7 Real (2025 \u00a3)' : '';
  footer.innerHTML =
    '<span>' +
    sectorCode +
    ' \u00b7 ' +
    CHART_LABELS[chartKey] +
    modeLabel +
    '</span>' +
    '<a href="' +
    window.location.origin +
    '/area/' +
    sectorCode +
    '" target="_blank">' +
    'housepricedashboard.co.uk \u2197</a>';
}

function refreshOpenEmbedPanels(): void {
  document.querySelectorAll('.embed-panel').forEach(function (panel) {
    const htmlPanel = panel as HTMLElement;
    if (htmlPanel.style.display !== 'none') {
      const chartKey = htmlPanel.id.replace('embed-panel-', '');
      const codeEl = document.getElementById('embed-code-' + chartKey);
      if (codeEl) codeEl.textContent = buildIframeSnippet(chartKey);
    }
  });
}

function setupEmbedButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('.chart-embed-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const chartKey = btn.dataset['chart']!;
      const panel = document.getElementById('embed-panel-' + chartKey)!;
      const codeEl = document.getElementById('embed-code-' + chartKey)!;
      const isOpen = (panel as HTMLElement).style.display === 'block';

      document.querySelectorAll<HTMLElement>('.embed-panel').forEach(function (p) {
        p.style.display = 'none';
      });
      document.querySelectorAll<HTMLElement>('.chart-embed-btn').forEach(function (b) {
        b.classList.remove('active');
      });

      if (!isOpen) {
        codeEl.textContent = buildIframeSnippet(chartKey);
        (panel as HTMLElement).style.display = 'block';
        btn.classList.add('active');
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.copy-embed-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const codeEl = document.getElementById(btn.dataset['target']!)!;
      const chartKey = btn.dataset['target'] ? btn.dataset['target']!.replace('embed-code-', '') : 'unknown';
      navigator.clipboard.writeText(codeEl.textContent || '').then(function () {
        if (window.posthog) window.posthog.capture('embed_code_copied', { chart_type: chartKey, postcode_district: sectorCode });
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function () {
          btn.textContent = orig;
        }, 2000);
      });
    });
  });

  if (isEmbed) {
    document.querySelectorAll<HTMLElement>('.chart-section').forEach(function (section) {
      if (section.dataset['chart'] !== embedChart) {
        section.style.display = 'none';
      }
    });
    setEmbedFooter(embedChart!);
  }
}

function updatePriceDatasets(): void {
  getPriceDatasets(isReal).forEach(function (ds, i) {
    if (priceChart) priceChart.data.datasets[i].data = ds.data;
  });
  if (priceChart) priceChart.update();

  getMedianDatasets(isReal).forEach(function (ds, i) {
    if (medianChart) medianChart.data.datasets[i].data = ds.data;
  });
  if (medianChart) medianChart.update();

  refreshOpenEmbedPanels();
  if (isEmbed) setEmbedFooter(embedChart!);
}

// ── Download ──

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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

function downloadChart(canvasId: string, chartTitle: string, showMode: boolean, filename: string): void {
  const sourceCanvas = document.getElementById(canvasId) as HTMLCanvasElement;

  const chartW = sourceCanvas.offsetWidth;
  const chartH = sourceCanvas.offsetHeight;
  const headerH = 72;
  const footerH = 38;
  const scale = 2;

  const output = document.createElement('canvas');
  output.width = chartW * scale;
  output.height = (headerH + chartH + footerH) * scale;

  const ctx = output.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, chartW, headerH + chartH + footerH);

  ctx.fillStyle = '#2c3e50';
  ctx.fillRect(0, 0, chartW, headerH);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'left';
  const headerLabel = districtName ? districtName + ' \u2014 ' + sectorCode : sectorCode;
  ctx.fillText(headerLabel, 20, 35);

  ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillText(chartTitle, 20, 56);

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

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, headerH, chartW, chartH);
  ctx.drawImage(sourceCanvas, 0, headerH, chartW, chartH);

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

  const link = document.createElement('a');
  link.download = filename + '.png';
  link.href = output.toDataURL('image/png');
  link.click();
}

function showError(msg: string): void {
  loadingEl.style.display = 'none';
  errorEl.textContent = msg;
  errorEl.style.display = 'block';
  headingEl.textContent = 'Area not found';
}

// Run
init();
