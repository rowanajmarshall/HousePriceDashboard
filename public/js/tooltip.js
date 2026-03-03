/**
 * Tooltip Module
 * Handles display and interaction of sector information tooltips
 */
const TooltipModule = (function() {
    // Active tooltip element
    let activeTooltip = null;

    // Reference to map container for positioning
    let mapContainer = null;

    // Store current sector color for screenshots
    let currentSectorColor = '#3498db';

    // Store current sector geometry for screenshots
    let currentSectorGeometry = null;

    /**
     * Initialize the tooltip module
     * @param {HTMLElement} container - Map container element
     */
    function init(container) {
        mapContainer = container;

        // Listen for sector click events
        document.addEventListener('sectorClick', handleSectorClick);

        // Close tooltip when clicking outside
        document.addEventListener('click', function(e) {
            if (activeTooltip && !activeTooltip.contains(e.target)) {
                // Check if click was on a map sector (those events are handled separately)
                if (!e.target.closest('.sector-polygon') && !e.target.closest('.leaflet-interactive')) {
                    close();
                }
            }
        });

        // Close tooltip on escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && activeTooltip) {
                close();
            }
        });
    }

    /**
     * Handle sector click event
     * @param {CustomEvent} e
     */
    function handleSectorClick(e) {
        const { feature, latlng, color } = e.detail;

        // Store the color and geometry for screenshots
        currentSectorColor = color || '#3498db';
        currentSectorGeometry = feature.geometry;

        // Get sector info
        const sectorId = feature.properties.id;
        const sectorCode = feature.properties.sector_code || sectorId;

        // Check which view mode we're in
        const viewMode = HeatmapModule.getViewMode();

        if (viewMode === 'change') {
            // Get change view filter state
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
            // Get current filter state
            const filterState = FiltersModule.getState();
            const stats = DataLoader.getPriceStats(sectorId, filterState.year, filterState.propertyType);
            show(sectorCode, stats, filterState, latlng);
        }
    }

    /**
     * Show tooltip with sector data
     * @param {string} sectorCode - Postcode sector code
     * @param {Object|null} stats - Price statistics
     * @param {Object} filterState - Current filter state
     * @param {L.LatLng} latlng - Click position
     */
    function show(sectorCode, stats, filterState, latlng) {
        // Close existing tooltip
        close();

        // Clone the template
        const template = document.getElementById('tooltip-template');
        if (!template) return;

        const tooltip = template.cloneNode(true);
        tooltip.id = 'active-tooltip';
        tooltip.style.display = 'block';

        // Populate content
        const name = DataLoader.getDistrictName(sectorCode);
        tooltip.querySelector('.tooltip-title').textContent = name ? `${name} – ${sectorCode}` : sectorCode;
        tooltip.querySelector('.tooltip-subtitle').textContent =
            `${FiltersModule.getPropertyTypeLabel(filterState.propertyType)} - ${filterState.year}`;

        if (stats) {
            tooltip.querySelector('.average-price').textContent = formatPriceFull(stats.avg);
            tooltip.querySelector('.median-price').textContent = formatPriceFull(stats.median);
            tooltip.querySelector('.transaction-count').textContent =
                `${stats.count.toLocaleString()} ${stats.count === 1 ? 'property' : 'properties'}`;
        } else {
            // No data state
            const content = tooltip.querySelector('.tooltip-content');
            content.innerHTML = '<div class="tooltip-no-data">No sales data available for this combination.</div>';
        }

        // Add close button handler
        const closeBtn = tooltip.querySelector('.tooltip-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                close();
            });
        }

        // Add screenshot button handler
        const screenshotBtn = tooltip.querySelector('.screenshot-btn');
        if (screenshotBtn) {
            screenshotBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                takeScreenshot(sectorCode);
            });
        }

        // Set area history link
        const areaLink = tooltip.querySelector('.area-link');
        if (areaLink) {
            areaLink.href = '/area/' + sectorCode;
        }

        // Wire compare button
        const compareBtn = tooltip.querySelector('.compare-btn');
        if (compareBtn && window.CompareModule) {
            const areas = window.CompareModule.get();
            const alreadyAdded = areas.includes(sectorCode);
            compareBtn.dataset.code = sectorCode;
            const compareLbl = compareBtn.querySelector('.compare-btn-label');
            if (compareLbl) compareLbl.textContent = alreadyAdded ? 'Added' : 'Compare';
            if (alreadyAdded) compareBtn.classList.add('added');

            compareBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const currentAreas = window.CompareModule.get();
                const lbl = compareBtn.querySelector('.compare-btn-label');
                if (currentAreas.includes(sectorCode)) {
                    window.CompareModule.remove(sectorCode);
                    if (lbl) lbl.textContent = 'Compare';
                    compareBtn.classList.remove('added');
                } else {
                    const added = window.CompareModule.add(sectorCode);
                    if (added) {
                        if (lbl) lbl.textContent = 'Added';
                        compareBtn.classList.add('added');
                    }
                }
            });
        }

        // Add to DOM
        document.body.appendChild(tooltip);
        activeTooltip = tooltip;

        // Position tooltip
        positionTooltip(tooltip, latlng);
    }

    /**
     * Show tooltip with change data
     * @param {string} sectorCode - Postcode sector code
     * @param {Object|null} changeData - Price change data
     * @param {Object} changeState - Current change filter state
     * @param {L.LatLng} latlng - Click position
     */
    function showChangeTooltip(sectorCode, changeData, changeState, latlng) {
        // Close existing tooltip
        close();

        // Clone the template
        const template = document.getElementById('tooltip-template');
        if (!template) return;

        const tooltip = template.cloneNode(true);
        tooltip.id = 'active-tooltip';
        tooltip.style.display = 'block';

        // Check if we're showing inflation-adjusted values
        const isReal = changeState.adjustmentMode === 'real';
        const modeLabel = isReal ? ' (Real)' : '';

        // Populate content
        const name = DataLoader.getDistrictName(sectorCode);
        tooltip.querySelector('.tooltip-title').textContent = name ? `${name} – ${sectorCode}` : sectorCode;
        tooltip.querySelector('.tooltip-subtitle').textContent =
            `${FiltersModule.getPropertyTypeLabel(changeState.propertyType)} - ${changeState.startYear} to ${changeState.endYear}${modeLabel}`;

        const content = tooltip.querySelector('.tooltip-content');

        if (changeData) {
            // Format the change percentage with color (green = increase, red = decrease)
            const changePercent = changeData.changePercent;
            const changeColor = changePercent >= 0 ? '#27ae60' : '#c0392b';
            const changeSign = changePercent >= 0 ? '+' : '';

            let html = '';

            if (isReal) {
                // Show inflation-adjusted comparison
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
                // Show nominal values
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

        // Add close button handler
        const closeBtn = tooltip.querySelector('.tooltip-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                close();
            });
        }

        // Add screenshot button handler
        const screenshotBtn = tooltip.querySelector('.screenshot-btn');
        if (screenshotBtn) {
            screenshotBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                takeScreenshot(sectorCode);
            });
        }

        // Set area history link
        const areaLink = tooltip.querySelector('.area-link');
        if (areaLink) {
            areaLink.href = '/area/' + sectorCode;
        }

        // Wire compare button
        const compareBtn = tooltip.querySelector('.compare-btn');
        if (compareBtn && window.CompareModule) {
            const areas = window.CompareModule.get();
            const alreadyAdded = areas.includes(sectorCode);
            compareBtn.dataset.code = sectorCode;
            const compareLbl = compareBtn.querySelector('.compare-btn-label');
            if (compareLbl) compareLbl.textContent = alreadyAdded ? 'Added' : 'Compare';
            if (alreadyAdded) compareBtn.classList.add('added');

            compareBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const currentAreas = window.CompareModule.get();
                const lbl = compareBtn.querySelector('.compare-btn-label');
                if (currentAreas.includes(sectorCode)) {
                    window.CompareModule.remove(sectorCode);
                    if (lbl) lbl.textContent = 'Compare';
                    compareBtn.classList.remove('added');
                } else {
                    const added = window.CompareModule.add(sectorCode);
                    if (added) {
                        if (lbl) lbl.textContent = 'Added';
                        compareBtn.classList.add('added');
                    }
                }
            });
        }

        // Add to DOM
        document.body.appendChild(tooltip);
        activeTooltip = tooltip;

        // Position tooltip
        positionTooltip(tooltip, latlng);
    }

    /**
     * Position tooltip near click location
     * @param {HTMLElement} tooltip
     * @param {L.LatLng} latlng
     */
    function positionTooltip(tooltip, latlng) {
        if (!mapContainer) return;

        // Get map container position
        const map = MapModule.getMap();
        if (!map) return;

        // Convert latlng to pixel coordinates
        const point = map.latLngToContainerPoint(latlng);

        // Get map container bounds
        const containerRect = mapContainer.getBoundingClientRect();

        // Calculate tooltip position (offset from click)
        const offsetX = 15;
        const offsetY = 15;

        let left = containerRect.left + point.x + offsetX;
        let top = containerRect.top + point.y + offsetY;

        // Get tooltip dimensions
        const tooltipRect = tooltip.getBoundingClientRect();
        const tooltipWidth = tooltipRect.width || 250;
        const tooltipHeight = tooltipRect.height || 150;

        // Adjust if tooltip would go off right edge
        if (left + tooltipWidth > window.innerWidth - 10) {
            left = containerRect.left + point.x - tooltipWidth - offsetX;
        }

        // Adjust if tooltip would go off bottom edge
        if (top + tooltipHeight > window.innerHeight - 10) {
            top = containerRect.top + point.y - tooltipHeight - offsetY;
        }

        // Ensure tooltip doesn't go off left or top edge
        left = Math.max(10, left);
        top = Math.max(10, top);

        // Apply position
        tooltip.style.position = 'fixed';
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }

    /**
     * Draw a polygon outline on canvas from GeoJSON geometry
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} geometry - GeoJSON geometry object
     * @param {number} x - Center X position
     * @param {number} y - Center Y position
     * @param {number} size - Size to fit the polygon in
     */
    function drawPolygonOutline(ctx, geometry, x, y, size) {
        // Get coordinates (handle both Polygon and MultiPolygon)
        let rings;
        if (geometry.type === 'Polygon') {
            rings = geometry.coordinates;
        } else if (geometry.type === 'MultiPolygon') {
            // Use the largest polygon for MultiPolygon
            rings = geometry.coordinates.reduce((largest, current) => {
                return current[0].length > largest[0].length ? current : largest;
            }, geometry.coordinates[0]);
        } else {
            return;
        }

        const coords = rings[0]; // Outer ring

        // Calculate bounding box
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        coords.forEach(([lng, lat]) => {
            minX = Math.min(minX, lng);
            maxX = Math.max(maxX, lng);
            minY = Math.min(minY, lat);
            maxY = Math.max(maxY, lat);
        });

        // Calculate scale to fit in size, maintaining aspect ratio
        const geoWidth = maxX - minX;
        const geoHeight = maxY - minY;
        const scale = Math.min(size / geoWidth, size / geoHeight) * 0.9;

        // Calculate center offset
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        // Draw the polygon
        ctx.beginPath();
        coords.forEach(([lng, lat], i) => {
            // Transform coordinates: center, scale, and flip Y (lat increases up, canvas Y increases down)
            const px = x + (lng - centerX) * scale;
            const py = y - (lat - centerY) * scale;

            if (i === 0) {
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
        });
        ctx.closePath();

        // Fill with semi-transparent white
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fill();

        // Stroke with white
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    /**
     * Take a screenshot - creates a shareable card with postcode data using Canvas
     * @param {string} sectorCode - Postcode sector code for filename
     */
    async function takeScreenshot(sectorCode) {
        if (!activeTooltip) return;

        const screenshotBtn = activeTooltip.querySelector('.screenshot-btn');
        const originalText = screenshotBtn ? screenshotBtn.innerHTML : '';

        try {
            // Show loading state
            if (screenshotBtn) {
                screenshotBtn.innerHTML = 'Capturing...';
                screenshotBtn.disabled = true;
            }

            // Get data from the tooltip
            const title = activeTooltip.querySelector('.tooltip-title')?.textContent || sectorCode;
            const subtitle = activeTooltip.querySelector('.tooltip-subtitle')?.textContent || '';

            // Extract label/value pairs from tooltip content
            const content = activeTooltip.querySelector('.tooltip-content');
            const dataRows = [];

            if (content) {
                const rows = content.querySelectorAll('.tooltip-row');
                rows.forEach(row => {
                    const label = row.querySelector('.tooltip-label')?.textContent?.trim() || '';
                    const value = row.querySelector('.tooltip-value')?.textContent?.trim() || '';
                    if (label && value) {
                        dataRows.push({ label, value });
                    }
                });
            }

            // Create canvas
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const width = 400;
            const headerHeight = 130;
            const rowHeight = 40;
            const footerHeight = 40;
            const padding = 20;
            const height = headerHeight + (dataRows.length * rowHeight) + padding + footerHeight;

            canvas.width = width * 2; // 2x for retina
            canvas.height = height * 2;
            ctx.scale(2, 2);

            // Draw background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);

            // Draw header with sector color
            ctx.fillStyle = currentSectorColor;
            ctx.fillRect(0, 0, width, headerHeight);

            // Calculate layout: [postcode] [polygon] centered horizontally
            const polySize = 70;
            const gap = 15;

            // Measure text width
            ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, sans-serif';
            const textWidth = ctx.measureText(title).width;

            // Total width of the group
            const totalWidth = textWidth + gap + polySize;
            const startX = (width - totalWidth) / 2;

            // Vertical center for the main row
            const centerY = 55;

            // Draw title (postcode)
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(title, startX, centerY + 12);

            // Draw polygon
            if (currentSectorGeometry) {
                drawPolygonOutline(ctx, currentSectorGeometry, startX + textWidth + gap + polySize / 2, centerY, polySize);
            }

            // Draw subtitle (centered below)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(subtitle, width / 2, headerHeight - 15);

            // Draw data rows
            ctx.textAlign = 'left';
            let y = headerHeight + padding;

            dataRows.forEach((row, index) => {
                // Draw separator line (except for first row)
                if (index > 0) {
                    ctx.strokeStyle = '#eeeeee';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(padding, y);
                    ctx.lineTo(width - padding, y);
                    ctx.stroke();
                }

                y += 28;

                // Draw label (left-aligned)
                ctx.textAlign = 'left';
                ctx.fillStyle = '#666666';
                ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
                ctx.fillText(row.label, padding, y);

                // Draw value (right-aligned)
                ctx.textAlign = 'right';
                ctx.fillStyle = '#333333';
                ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
                ctx.fillText(row.value, width - padding, y);

                y += 12;
            });

            // Reset text align
            ctx.textAlign = 'left';

            // Draw footer
            const footerY = height - footerHeight;
            ctx.fillStyle = '#f8f9fa';
            ctx.fillRect(0, footerY, width, footerHeight);

            ctx.fillStyle = '#888888';
            ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('housepricedashboard.co.uk', width / 2, footerY + 25);

            // Download the image
            const link = document.createElement('a');
            link.download = `house-prices-${sectorCode}-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

            // Show success state
            if (screenshotBtn) {
                screenshotBtn.innerHTML = 'Done!';
                setTimeout(() => {
                    screenshotBtn.innerHTML = originalText;
                    screenshotBtn.disabled = false;
                }, 1500);
            }

        } catch (error) {
            console.error('Screenshot failed:', error);

            // Show error state
            if (screenshotBtn) {
                screenshotBtn.innerHTML = 'Failed';
                setTimeout(() => {
                    screenshotBtn.innerHTML = originalText;
                    screenshotBtn.disabled = false;
                }, 1500);
            }
        }
    }

    /**
     * Close the active tooltip
     */
    function close() {
        if (activeTooltip) {
            activeTooltip.remove();
            activeTooltip = null;
        }
    }

    /**
     * Format price with full formatting
     * @param {number} price
     * @returns {string}
     */
    function formatPriceFull(price) {
        if (price === null || price === undefined) {
            return '-';
        }
        return '£' + price.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    /**
     * Check if tooltip is currently visible
     * @returns {boolean}
     */
    function isVisible() {
        return activeTooltip !== null;
    }

    // Public API
    return {
        init,
        show,
        close,
        isVisible
    };
})();
