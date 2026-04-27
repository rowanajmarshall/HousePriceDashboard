import * as DataLoader from './data-loader';
import * as MapModule from './map';
import * as HeatmapModule from './heatmap';

const VALID_TYPES = ['A', 'D', 'S', 'T', 'F'];
const PROP_LABELS: Record<string, string> = { A: 'All Types', D: 'Detached', S: 'Semi-Detached', T: 'Terraced', F: 'Flats' };

const params = new URLSearchParams(window.location.search);
let year = Math.max(1995, Math.min(2025, parseInt(params.get('year') || '') || 2025));
let propertyType = VALID_TYPES.includes(params.get('type') || '') ? params.get('type')! : 'A';

const slider = document.getElementById('year-slider') as HTMLInputElement;
const yearDisp = document.getElementById('year-value')!;
const loadingEl = document.getElementById('embed-loading')!;

let activeTooltip: HTMLElement | null = null;

function showLoading(on: boolean): void {
  loadingEl.classList.toggle('hidden', !on);
}

function setActiveType(type: string): void {
  document.querySelectorAll('.embed-type-btn').forEach(function (btn) {
    btn.classList.toggle('active', (btn as HTMLElement).dataset['type'] === type);
  });
}

function closeTooltip(): void {
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
}

async function updateMap(newYear: number, newType: string): Promise<void> {
  year = newYear;
  propertyType = newType;
  closeTooltip();
  showLoading(true);
  try {
    await HeatmapModule.update(year, propertyType);
  } finally {
    showLoading(false);
  }
  const url = new URL(window.location.href);
  url.searchParams.set('year', String(year));
  url.searchParams.set('type', propertyType);
  window.history.replaceState(null, '', url.toString());
}

// Sync slider to initial year
slider.value = String(year);
yearDisp.textContent = String(year);
setActiveType(propertyType);

slider.addEventListener('input', function () {
  yearDisp.textContent = this.value;
});

slider.addEventListener('change', function () {
  updateMap(parseInt(this.value, 10), propertyType);
});

document.querySelectorAll<HTMLElement>('.embed-type-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    const type = btn.dataset['type']!;
    setActiveType(type);
    updateMap(year, type);
  });
});

async function init(): Promise<void> {
  showLoading(true);
  try {
    const map = MapModule.init('map');
    const [boundaries] = await Promise.all([
      DataLoader.loadBoundaries(),
      DataLoader.loadPriceData(year),
      DataLoader.loadDistrictNames(),
    ]);
    await HeatmapModule.init(map, boundaries, year, propertyType);
  } catch (err) {
    console.error('Embed failed to initialise:', err);
  } finally {
    showLoading(false);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.addEventListener('resize', function () {
  MapModule.invalidateSize();
});

// --- Tooltip ---

function fmt(price: number | null | undefined): string {
  return price == null ? '-' : '£' + price.toLocaleString('en-GB');
}

function positionTooltip(el: HTMLElement, latlng: L.LatLng): void {
  const map = MapModule.getMap();
  if (!map) return;
  const pt = map.latLngToContainerPoint(latlng);
  const rect = document.getElementById('map')!.getBoundingClientRect();
  const ox = 15,
    oy = 15;
  let left = rect.left + pt.x + ox;
  let top = rect.top + pt.y + oy;
  requestAnimationFrame(function () {
    const w = el.offsetWidth || 220;
    const h = el.offsetHeight || 150;
    if (left + w > window.innerWidth - 10) left = rect.left + pt.x - w - ox;
    if (top + h > window.innerHeight - 10) top = rect.top + pt.y - h - oy;
    el.style.left = Math.max(10, left) + 'px';
    el.style.top = Math.max(10, top) + 'px';
  });
}

document.addEventListener('sectorClick', function (e: Event) {
  const { feature, latlng } = (e as CustomEvent).detail;
  const sectorId: string = feature.properties.id;
  closeTooltip();

  const stats = DataLoader.getPriceStats(sectorId, year, propertyType);
  const name = DataLoader.getDistrictName(sectorId);

  const titleText = name ? name + ' \u2013 ' + sectorId : sectorId;
  const subText = (PROP_LABELS[propertyType] || 'All Types') + ' \u00b7 ' + year;

  let bodyHTML: string;
  if (stats) {
    bodyHTML =
      '<div class="embed-tt-row"><span class="embed-tt-lbl">Average:</span><span class="embed-tt-val">' +
      fmt(stats.avg) +
      '</span></div>' +
      '<div class="embed-tt-row"><span class="embed-tt-lbl">Median:</span> <span class="embed-tt-val">' +
      fmt(stats.median) +
      '</span></div>' +
      '<div class="embed-tt-row"><span class="embed-tt-lbl">Sales:</span>  <span class="embed-tt-val">' +
      stats.count.toLocaleString('en-GB') +
      '</span></div>';
  } else {
    bodyHTML = '<div style="color:#999;font-style:italic;font-size:12px">No data for this selection.</div>';
  }

  const tt = document.createElement('div');
  tt.className = 'embed-tooltip';
  tt.style.cssText = 'left:0;top:0';
  tt.innerHTML =
    '<div class="embed-tt-header">' +
    '<span class="embed-tt-title">' +
    titleText +
    '</span>' +
    '<button class="embed-tt-close" aria-label="Close">\u00d7</button>' +
    '</div>' +
    '<div class="embed-tt-sub">' +
    subText +
    '</div>' +
    '<div class="embed-tt-body">' +
    bodyHTML +
    '</div>' +
    '<div class="embed-tt-footer"><a href="https://housepricedashboard.co.uk/area/' +
    sectorId +
    '" target="_blank" rel="noopener">View full history \u2192</a></div>';

  document.body.appendChild(tt);
  activeTooltip = tt;
  tt.querySelector('.embed-tt-close')!.addEventListener('click', closeTooltip);
  positionTooltip(tt, latlng);
});

document.addEventListener('click', function (e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (activeTooltip && !activeTooltip.contains(target) && !target.closest('.leaflet-interactive')) {
    closeTooltip();
  }
});

document.addEventListener('keydown', function (e: KeyboardEvent) {
  if (e.key === 'Escape') closeTooltip();
});
