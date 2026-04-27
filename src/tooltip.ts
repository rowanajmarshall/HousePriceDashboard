import * as HeatmapModule from './heatmap';
import * as FiltersModule from './filters';
import * as DataLoader from './data-loader';
import * as MapModule from './map';

let activeTooltip: HTMLElement | null = null;
let mapContainer: HTMLElement | null = null;
let currentSectorColor = '#3498db';
let currentSectorGeometry: GeoJSON.Geometry | null = null;
let currentFeature: GeoJSON.Feature | null = null;
let currentLatlng: L.LatLng | null = null;

export function init(container: HTMLElement | null): void {
  mapContainer = container;

  document.addEventListener('sectorClick', handleSectorClick as EventListener);

  document.addEventListener('click', function (e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (activeTooltip && !activeTooltip.contains(target)) {
      if (!target.closest('.sector-polygon') && !target.closest('.leaflet-interactive')) {
        close();
      }
    }
  });

  document.addEventListener('keydown', function (e: KeyboardEvent) {
    if (e.key === 'Escape' && activeTooltip) close();
  });
}

function handleSectorClick(e: CustomEvent): void {
  const { feature, latlng, color } = e.detail;

  currentSectorColor = color || '#3498db';
  currentSectorGeometry = feature.geometry;
  currentFeature = feature;
  currentLatlng = latlng;

  const sectorId: string = feature.properties.id;
  const sectorCode: string = feature.properties.sector_code || sectorId;

  const viewMode = HeatmapModule.getViewMode();

  if (viewMode === 'change') {
    const changeState = FiltersModule.getChangeState();
    const adjustInflation = changeState.adjustmentMode === 'real';
    const changeData = DataLoader.getPriceChange(
      sectorId,
      changeState.startYear,
      changeState.endYear,
      changeState.propertyType,
      adjustInflation
    );
    showChangeTooltip(sectorCode, changeData, changeState, latlng);
  } else {
    const filterState = FiltersModule.getState();
    const stats = DataLoader.getPriceStats(sectorId, filterState.year, filterState.propertyType);
    show(sectorCode, stats, filterState, latlng);
  }
}

function formatPriceFull(price: number | null | undefined): string {
  if (price === null || price === undefined) return '-';
  return '£' + price.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function show(
  sectorCode: string,
  stats: ReturnType<typeof DataLoader.getPriceStats>,
  filterState: ReturnType<typeof FiltersModule.getState>,
  latlng: L.LatLng
): void {
  close();

  const template = document.getElementById('tooltip-template');
  if (!template) return;

  const tooltip = template.cloneNode(true) as HTMLElement;
  tooltip.id = 'active-tooltip';
  tooltip.style.display = 'block';

  const name = DataLoader.getDistrictName(sectorCode);
  tooltip.querySelector('.tooltip-title')!.textContent = name ? `${name} – ${sectorCode}` : sectorCode;
  tooltip.querySelector('.tooltip-subtitle')!.textContent =
    `${FiltersModule.getPropertyTypeLabel(filterState.propertyType)} - ${filterState.year}`;

  if (stats) {
    tooltip.querySelector('.average-price')!.textContent = formatPriceFull(stats.avg);
    tooltip.querySelector('.median-price')!.textContent = formatPriceFull(stats.median);
    tooltip.querySelector('.transaction-count')!.textContent =
      `${stats.count.toLocaleString()} ${stats.count === 1 ? 'property' : 'properties'}`;
  } else {
    const content = tooltip.querySelector('.tooltip-content')!;
    content.innerHTML = '<div class="tooltip-no-data">No sales data available for this combination.</div>';
  }

  const closeBtn = tooltip.querySelector('.tooltip-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      close();
    });
  }

  const screenshotBtn = tooltip.querySelector('.screenshot-btn');
  if (screenshotBtn) {
    screenshotBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      takeScreenshot(sectorCode);
    });
  }

  const areaLink = tooltip.querySelector('.area-link') as HTMLAnchorElement | null;
  if (areaLink) areaLink.href = '/area/' + sectorCode;

  wireCompareButton(tooltip, sectorCode);

  document.body.appendChild(tooltip);
  activeTooltip = tooltip;
  positionTooltip(tooltip, latlng);
}

function showChangeTooltip(
  sectorCode: string,
  changeData: ReturnType<typeof DataLoader.getPriceChange>,
  changeState: ReturnType<typeof FiltersModule.getChangeState>,
  latlng: L.LatLng
): void {
  close();

  const template = document.getElementById('tooltip-template');
  if (!template) return;

  const tooltip = template.cloneNode(true) as HTMLElement;
  tooltip.id = 'active-tooltip';
  tooltip.style.display = 'block';

  const isReal = changeState.adjustmentMode === 'real';
  const modeLabel = isReal ? ' (Real)' : '';

  const name = DataLoader.getDistrictName(sectorCode);
  tooltip.querySelector('.tooltip-title')!.textContent = name ? `${name} – ${sectorCode}` : sectorCode;
  tooltip.querySelector('.tooltip-subtitle')!.textContent =
    `${FiltersModule.getPropertyTypeLabel(changeState.propertyType)} - ${changeState.startYear} to ${changeState.endYear}${modeLabel}`;

  const content = tooltip.querySelector('.tooltip-content')!;

  if (changeData) {
    const changePercent = changeData.changePercent;
    const changeColor = changePercent >= 0 ? '#27ae60' : '#c0392b';
    const changeSign = changePercent >= 0 ? '+' : '';

    let html = '';

    if (isReal) {
      html = `
        <div class="tooltip-row">
          <span class="tooltip-label">${changeState.startYear} (in ${changeState.endYear} £):</span>
          <span class="tooltip-value">${formatPriceFull(changeData.startPrice)}</span>
        </div>
        <div class="tooltip-row" style="font-size: 11px; color: #888;">
          <span class="tooltip-label">Nominal:</span>
          <span class="tooltip-value">${formatPriceFull(changeData.nominalStartPrice)}</span>
        </div>
        <div class="tooltip-row" style="margin-top: 6px;">
          <span class="tooltip-label">${changeState.endYear} Avg:</span>
          <span class="tooltip-value">${formatPriceFull(changeData.endPrice)}</span>
        </div>
      `;
    } else {
      html = `
        <div class="tooltip-row">
          <span class="tooltip-label">${changeState.startYear} Avg:</span>
          <span class="tooltip-value">${formatPriceFull(changeData.startPrice)}</span>
        </div>
        <div class="tooltip-row">
          <span class="tooltip-label">${changeState.endYear} Avg:</span>
          <span class="tooltip-value">${formatPriceFull(changeData.endPrice)}</span>
        </div>
      `;
    }

    html += `
      <div class="tooltip-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e0e0e0;">
        <span class="tooltip-label">${isReal ? 'Real Change:' : 'Change:'}</span>
        <span class="tooltip-value" style="color: ${changeColor}; font-size: 16px;">
          ${changeSign}${Math.round(changePercent)}%
        </span>
      </div>
      <div class="tooltip-row">
        <span class="tooltip-label">Amount:</span>
        <span class="tooltip-value" style="color: ${changeColor};">
          ${changeSign}${formatPriceFull(changeData.changeAmount)}
        </span>
      </div>
    `;

    content.innerHTML = html;
  } else {
    content.innerHTML = '<div class="tooltip-no-data">No comparable data available for this period.</div>';
  }

  const closeBtn = tooltip.querySelector('.tooltip-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      close();
    });
  }

  const screenshotBtn = tooltip.querySelector('.screenshot-btn');
  if (screenshotBtn) {
    screenshotBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      takeScreenshot(sectorCode);
    });
  }

  const areaLink = tooltip.querySelector('.area-link') as HTMLAnchorElement | null;
  if (areaLink) areaLink.href = '/area/' + sectorCode;

  wireCompareButton(tooltip, sectorCode);

  document.body.appendChild(tooltip);
  activeTooltip = tooltip;
  positionTooltip(tooltip, latlng);
}

function wireCompareButton(tooltip: HTMLElement, sectorCode: string): void {
  const compareBtn = tooltip.querySelector('.compare-btn') as HTMLElement | null;
  if (!compareBtn || !window.CompareModule) return;

  const areas = window.CompareModule.get();
  const alreadyAdded = areas.includes(sectorCode);
  compareBtn.dataset['code'] = sectorCode;
  const compareLbl = compareBtn.querySelector('.compare-btn-label');
  if (compareLbl) compareLbl.textContent = alreadyAdded ? 'Added' : 'Compare';
  if (alreadyAdded) compareBtn.classList.add('added');

  compareBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    const currentAreas = window.CompareModule!.get();
    const lbl = compareBtn.querySelector('.compare-btn-label');
    if (currentAreas.includes(sectorCode)) {
      window.CompareModule!.remove(sectorCode);
      if (lbl) lbl.textContent = 'Compare';
      compareBtn.classList.remove('added');
    } else {
      const added = window.CompareModule!.add(sectorCode);
      if (added) {
        if (lbl) lbl.textContent = 'Added';
        compareBtn.classList.add('added');
      }
    }
  });
}

function positionTooltip(tooltip: HTMLElement, latlng: L.LatLng): void {
  if (!mapContainer) return;

  const map = MapModule.getMap();
  if (!map) return;

  const point = map.latLngToContainerPoint(latlng);
  const containerRect = mapContainer.getBoundingClientRect();

  const offsetX = 15;
  const offsetY = 15;

  let left = containerRect.left + point.x + offsetX;
  let top = containerRect.top + point.y + offsetY;

  const tooltipRect = tooltip.getBoundingClientRect();
  const tooltipWidth = tooltipRect.width || 250;
  const tooltipHeight = tooltipRect.height || 150;

  if (left + tooltipWidth > window.innerWidth - 10) {
    left = containerRect.left + point.x - tooltipWidth - offsetX;
  }
  if (top + tooltipHeight > window.innerHeight - 10) {
    top = containerRect.top + point.y - tooltipHeight - offsetY;
  }

  left = Math.max(10, left);
  top = Math.max(10, top);

  tooltip.style.position = 'fixed';
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function drawPolygonOutline(
  ctx: CanvasRenderingContext2D,
  geometry: GeoJSON.Geometry,
  x: number,
  y: number,
  size: number
): void {
  let rings: number[][][];
  if (geometry.type === 'Polygon') {
    rings = geometry.coordinates as number[][][];
  } else if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates as number[][][][];
    rings = polys.reduce((largest, current) =>
      current[0]!.length > largest[0]!.length ? current : largest,
      polys[0]!
    );
  } else {
    return;
  }

  const coords = rings[0]!;

  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;

  coords.forEach(([lng, lat]) => {
    minX = Math.min(minX, lng!);
    maxX = Math.max(maxX, lng!);
    minY = Math.min(minY, lat!);
    maxY = Math.max(maxY, lat!);
  });

  const geoWidth = maxX - minX;
  const geoHeight = maxY - minY;
  const scale = Math.min(size / geoWidth, size / geoHeight) * 0.9;

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  ctx.beginPath();
  coords.forEach(([lng, lat], i) => {
    const px = x + (lng! - centerX) * scale;
    const py = y - (lat! - centerY) * scale;

    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
}

async function takeScreenshot(sectorCode: string): Promise<void> {
  if (!activeTooltip) return;

  const screenshotBtn = activeTooltip.querySelector('.screenshot-btn') as HTMLButtonElement | null;
  const originalText = screenshotBtn ? screenshotBtn.innerHTML : '';

  try {
    if (screenshotBtn) {
      screenshotBtn.innerHTML = 'Capturing...';
      screenshotBtn.disabled = true;
    }

    const title = activeTooltip.querySelector('.tooltip-title')?.textContent || sectorCode;
    const subtitle = activeTooltip.querySelector('.tooltip-subtitle')?.textContent || '';

    const content = activeTooltip.querySelector('.tooltip-content');
    const dataRows: { label: string; value: string }[] = [];

    if (content) {
      const rows = content.querySelectorAll('.tooltip-row');
      rows.forEach((row) => {
        const label = row.querySelector('.tooltip-label')?.textContent?.trim() || '';
        const value = row.querySelector('.tooltip-value')?.textContent?.trim() || '';
        if (label && value) dataRows.push({ label, value });
      });
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const width = 400;
    const headerHeight = 130;
    const rowHeight = 40;
    const footerHeight = 40;
    const padding = 20;
    const height = headerHeight + dataRows.length * rowHeight + padding + footerHeight;

    canvas.width = width * 2;
    canvas.height = height * 2;
    ctx.scale(2, 2);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = currentSectorColor;
    ctx.fillRect(0, 0, width, headerHeight);

    const polySize = 70;
    const gap = 15;

    ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, sans-serif';
    const textWidth = ctx.measureText(title).width;
    const totalWidth = textWidth + gap + polySize;
    const startX = (width - totalWidth) / 2;
    const canvasCenterY = 55;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, startX, canvasCenterY + 12);

    if (currentSectorGeometry) {
      drawPolygonOutline(ctx, currentSectorGeometry, startX + textWidth + gap + polySize / 2, canvasCenterY, polySize);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(subtitle, width / 2, headerHeight - 15);

    ctx.textAlign = 'left';
    let drawY = headerHeight + padding;

    dataRows.forEach((row, index) => {
      if (index > 0) {
        ctx.strokeStyle = '#eeeeee';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, drawY);
        ctx.lineTo(width - padding, drawY);
        ctx.stroke();
      }

      drawY += 28;

      ctx.textAlign = 'left';
      ctx.fillStyle = '#666666';
      ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(row.label, padding, drawY);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#333333';
      ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(row.value, width - padding, drawY);

      drawY += 12;
    });

    ctx.textAlign = 'left';

    const footerY = height - footerHeight;
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, footerY, width, footerHeight);

    ctx.fillStyle = '#888888';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('housepricedashboard.co.uk', width / 2, footerY + 25);

    const link = document.createElement('a');
    link.download = `house-prices-${sectorCode}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    if (screenshotBtn) {
      screenshotBtn.innerHTML = 'Done!';
      setTimeout(() => {
        screenshotBtn.innerHTML = originalText;
        screenshotBtn.disabled = false;
      }, 1500);
    }
  } catch (error) {
    console.error('Screenshot failed:', error);

    if (screenshotBtn) {
      screenshotBtn.innerHTML = 'Failed';
      setTimeout(() => {
        screenshotBtn.innerHTML = originalText;
        screenshotBtn.disabled = false;
      }, 1500);
    }
  }
}

export function refresh(): void {
  if (!activeTooltip || !currentFeature) return;

  handleSectorClick({
    detail: {
      feature: currentFeature,
      latlng: currentLatlng,
      color: currentSectorColor,
    },
  } as CustomEvent);
}

export function close(): void {
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
  currentFeature = null;
  currentLatlng = null;
}

export function isVisible(): boolean {
  return activeTooltip !== null;
}
