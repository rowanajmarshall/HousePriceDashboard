const MAX_AREAS = 4;
const STORAGE_KEY = 'compare-areas';
const COLORS = ['#3498db', '#e67e22', '#27ae60', '#9b59b6'];

function get(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]') as string[];
  } catch {
    return [];
  }
}

function save(areas: string[]): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(areas));
}

function add(code: string): boolean {
  const areas = get();
  if (areas.includes(code) || areas.length >= MAX_AREAS) return false;
  areas.push(code);
  save(areas);
  renderTray();
  return true;
}

function remove(code: string): void {
  const areas = get().filter((c) => c !== code);
  save(areas);
  renderTray();
}

function clear(): void {
  save([]);
  renderTray();
}

function navigate(): void {
  const areas = get();
  if (areas.length < 1) return;
  window.location.href = '/compare.html?areas=' + areas.join(',');
}

function colorFor(code: string): string {
  const areas = get();
  const idx = areas.indexOf(code);
  return idx >= 0 ? COLORS[idx % COLORS.length]! : COLORS[0]!;
}

function renderTray(): void {
  const tray = document.getElementById('compare-tray');
  const chipsEl = document.getElementById('compare-tray-chips');
  const goBtn = document.getElementById('compare-tray-go') as HTMLButtonElement | null;
  if (!tray || !chipsEl || !goBtn) return;

  const areas = get();

  if (areas.length === 0) {
    tray.hidden = true;
    return;
  }

  tray.hidden = false;
  chipsEl.innerHTML = '';

  areas.forEach(function (code, i) {
    const chip = document.createElement('span');
    chip.className = 'compare-chip';
    chip.style.borderColor = COLORS[i % COLORS.length]!;
    chip.innerHTML =
      '<span class="compare-chip-dot" style="background:' +
      COLORS[i % COLORS.length] +
      '"></span>' +
      '<span class="compare-chip-label">' +
      code +
      '</span>' +
      '<button class="compare-chip-remove" aria-label="Remove ' +
      code +
      '">&times;</button>';
    chip.querySelector('.compare-chip-remove')!.addEventListener('click', function (e) {
      e.stopPropagation();
      CompareModule.remove(code);
      const activeCompareBtn = document.querySelector('#active-tooltip .compare-btn') as HTMLElement | null;
      if (activeCompareBtn && activeCompareBtn.dataset['code'] === code) {
        const lbl = activeCompareBtn.querySelector('.compare-btn-label');
        if (lbl) lbl.textContent = 'Compare';
        activeCompareBtn.classList.remove('added');
      }
    });
    chipsEl.appendChild(chip);
  });

  goBtn.disabled = areas.length < 2;
}

export const CompareModule = { get, add, remove, clear, navigate, colorFor, renderTray };
