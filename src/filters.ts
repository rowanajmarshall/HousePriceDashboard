import type { FilterState, ChangeFilterState, FilterChangeEvent, ChangeViewFilterEvent } from './types';

// Price view filter state
let state: FilterState = {
  propertyType: 'A',
  year: new Date().getFullYear(),
};

// Change view filter state
let changeState: ChangeFilterState = {
  propertyType: 'A',
  startYear: 2014,
  endYear: new Date().getFullYear(),
  adjustmentMode: 'nominal',
};

let onChangeCallback: ((event: FilterChangeEvent) => void) | null = null;
let onChangeViewCallback: ((event: ChangeViewFilterEvent) => void) | null = null;

function updateSliderFill(slider: HTMLInputElement): void {
  const pct = ((Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min))) * 100;
  slider.style.background = `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-border) ${pct}%)`;
}

function updateDualRangeFill(startSlider: HTMLInputElement, endSlider: HTMLInputElement, fill: HTMLElement | null): void {
  if (!fill) return;
  const min = parseFloat(startSlider.min);
  const max = parseFloat(startSlider.max);
  const range = max - min;
  const leftPct = ((Number(startSlider.value) - min) / range) * 100;
  const rightPct = ((Number(endSlider.value) - min) / range) * 100;
  fill.style.left = leftPct + '%';
  fill.style.width = (rightPct - leftPct) + '%';
}

const propertyTypeLabels: Record<string, string> = {
  A: 'All Types',
  D: 'Detached',
  S: 'Semi-Detached',
  T: 'Terraced',
  F: 'Flats/Maisonettes',
};

export interface FiltersInitOptions {
  onChange?: (event: FilterChangeEvent) => void;
  onChangeView?: (event: ChangeViewFilterEvent) => void;
  minYear?: number;
  maxYear?: number;
  defaultPropertyType?: string;
  defaultYear?: number;
}

export function init(options: FiltersInitOptions = {}): void {
  const {
    onChange,
    onChangeView,
    minYear = 1995,
    maxYear = new Date().getFullYear(),
    defaultPropertyType = 'F',
    defaultYear = maxYear,
  } = options;

  onChangeCallback = onChange ?? null;
  onChangeViewCallback = onChangeView ?? null;

  state.propertyType = defaultPropertyType;
  state.year = defaultYear;

  changeState.propertyType = defaultPropertyType;
  changeState.startYear = Math.max(minYear, maxYear - 10);
  changeState.endYear = maxYear;

  initPropertyTypeFilter();
  initYearSlider(minYear, maxYear, defaultYear);
  initChangeYearSliders(minYear, maxYear);
  initAdjustmentModeFilter();
}

function initPropertyTypeFilter(): void {
  const container = document.getElementById('property-type-filter');
  if (!container) return;

  const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
  radios.forEach((radio) => {
    if (radio.value === state.propertyType) radio.checked = true;

    radio.addEventListener('change', function () {
      if (this.checked) {
        const oldType = state.propertyType;
        state.propertyType = this.value;
        changeState.propertyType = this.value;

        if (oldType !== state.propertyType) {
          if (onChangeCallback) {
            onChangeCallback({
              type: 'propertyType',
              value: state.propertyType,
              state: { ...state },
            });
          }
          if (onChangeViewCallback) {
            onChangeViewCallback({
              type: 'propertyType',
              state: { ...changeState },
            });
          }
        }
      }
    });
  });
}

function initYearSlider(minYear: number, maxYear: number, defaultYear: number): void {
  const slider = document.getElementById('year-slider') as HTMLInputElement | null;
  const display = document.getElementById('year-value');

  if (!slider || !display) return;

  slider.min = String(minYear);
  slider.max = String(maxYear);
  slider.value = String(defaultYear);
  display.textContent = String(defaultYear);
  updateSliderFill(slider);

  slider.addEventListener('input', function () {
    display.textContent = this.value;
    updateSliderFill(this);
  });

  slider.addEventListener('change', function () {
    const newYear = parseInt(this.value, 10);
    const oldYear = state.year;
    state.year = newYear;

    if (oldYear !== newYear && onChangeCallback) {
      onChangeCallback({
        type: 'year',
        value: newYear,
        state: { ...state },
      });
    }
  });
}

function initChangeYearSliders(minYear: number, maxYear: number): void {
  const startSlider = document.getElementById('start-year-slider') as HTMLInputElement | null;
  const endSlider = document.getElementById('end-year-slider') as HTMLInputElement | null;
  const startDisplay = document.getElementById('start-year-value');
  const endDisplay = document.getElementById('end-year-value');
  const fill = document.getElementById('change-range-fill');

  if (!startSlider || !endSlider) return;

  startSlider.min = endSlider.min = String(minYear);
  startSlider.max = endSlider.max = String(maxYear);
  startSlider.value = String(changeState.startYear);
  endSlider.value = String(changeState.endYear);
  if (startDisplay) startDisplay.textContent = String(changeState.startYear);
  if (endDisplay) endDisplay.textContent = String(changeState.endYear);
  updateDualRangeFill(startSlider, endSlider, fill);

  startSlider.addEventListener('input', function () {
    if (parseInt(this.value, 10) >= parseInt(endSlider.value, 10)) {
      this.value = String(parseInt(endSlider.value, 10) - 1);
    }
    if (startDisplay) startDisplay.textContent = this.value;
    updateDualRangeFill(startSlider, endSlider, fill);
  });

  startSlider.addEventListener('change', function () {
    const newYear = parseInt(this.value, 10);
    if (newYear >= changeState.endYear) {
      const clamped = changeState.endYear - 1;
      this.value = String(clamped);
      if (startDisplay) startDisplay.textContent = String(clamped);
      changeState.startYear = clamped;
    } else {
      changeState.startYear = newYear;
    }
    updateDualRangeFill(startSlider, endSlider, fill);
    triggerChangeViewCallback('startYear');
  });

  endSlider.addEventListener('input', function () {
    if (parseInt(this.value, 10) <= parseInt(startSlider.value, 10)) {
      this.value = String(parseInt(startSlider.value, 10) + 1);
    }
    if (endDisplay) endDisplay.textContent = this.value;
    updateDualRangeFill(startSlider, endSlider, fill);
  });

  endSlider.addEventListener('change', function () {
    const newYear = parseInt(this.value, 10);
    if (newYear <= changeState.startYear) {
      const clamped = changeState.startYear + 1;
      this.value = String(clamped);
      if (endDisplay) endDisplay.textContent = String(clamped);
      changeState.endYear = clamped;
    } else {
      changeState.endYear = newYear;
    }
    updateDualRangeFill(startSlider, endSlider, fill);
    triggerChangeViewCallback('endYear');
  });
}

function initAdjustmentModeFilter(): void {
  const container = document.getElementById('adjustment-mode-filter');
  if (!container) return;

  const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
  radios.forEach((radio) => {
    if (radio.value === changeState.adjustmentMode) radio.checked = true;

    radio.addEventListener('change', function () {
      if (this.checked) {
        changeState.adjustmentMode = this.value as 'nominal' | 'real';
        triggerChangeViewCallback('adjustmentMode');
      }
    });
  });
}

function triggerChangeViewCallback(changedField: string): void {
  if (onChangeViewCallback) {
    onChangeViewCallback({
      type: changedField,
      state: { ...changeState },
    });
  }
}

export function getState(): FilterState {
  return { ...state };
}

export function getChangeState(): ChangeFilterState {
  return { ...changeState };
}

export function getPropertyTypeLabel(code: string): string {
  return propertyTypeLabels[code] ?? code;
}

export function setState(newState: Partial<FilterState>, triggerCallback = true): void {
  const changed: Record<string, boolean> = {};

  if (newState.propertyType && newState.propertyType !== state.propertyType) {
    state.propertyType = newState.propertyType;
    changed['propertyType'] = true;

    const radio = document.querySelector<HTMLInputElement>(`input[name="property-type"][value="${state.propertyType}"]`);
    if (radio) radio.checked = true;
  }

  if (newState.year && newState.year !== state.year) {
    state.year = newState.year;
    changed['year'] = true;

    const slider = document.getElementById('year-slider') as HTMLInputElement | null;
    const display = document.getElementById('year-value');
    if (slider) {
      slider.value = String(state.year);
      updateSliderFill(slider);
    }
    if (display) display.textContent = String(state.year);
  }

  if (triggerCallback && onChangeCallback && Object.keys(changed).length > 0) {
    onChangeCallback({
      type: 'multiple',
      state: { ...state },
    });
  }
}

export function setChangeState(newState: Partial<ChangeFilterState>, triggerCallback = false): void {
  if (newState.propertyType && newState.propertyType !== changeState.propertyType) {
    changeState.propertyType = newState.propertyType;
    state.propertyType = newState.propertyType;
    const radio = document.querySelector<HTMLInputElement>(`input[name="property-type"][value="${changeState.propertyType}"]`);
    if (radio) radio.checked = true;
  }

  if (newState.startYear && newState.startYear !== changeState.startYear) {
    changeState.startYear = newState.startYear;
    const slider = document.getElementById('start-year-slider') as HTMLInputElement | null;
    const display = document.getElementById('start-year-value');
    if (slider) slider.value = String(changeState.startYear);
    if (display) display.textContent = String(changeState.startYear);
  }

  if (newState.endYear && newState.endYear !== changeState.endYear) {
    changeState.endYear = newState.endYear;
    const slider = document.getElementById('end-year-slider') as HTMLInputElement | null;
    const display = document.getElementById('end-year-value');
    if (slider) slider.value = String(changeState.endYear);
    if (display) display.textContent = String(changeState.endYear);
  }

  const startSlider = document.getElementById('start-year-slider') as HTMLInputElement | null;
  const endSlider = document.getElementById('end-year-slider') as HTMLInputElement | null;
  const fill = document.getElementById('change-range-fill');
  if (startSlider && endSlider) updateDualRangeFill(startSlider, endSlider, fill);

  if (newState.adjustmentMode && newState.adjustmentMode !== changeState.adjustmentMode) {
    changeState.adjustmentMode = newState.adjustmentMode;
    const radio = document.querySelector<HTMLInputElement>(`input[name="adjustment-mode"][value="${changeState.adjustmentMode}"]`);
    if (radio) radio.checked = true;
  }

  if (triggerCallback && onChangeViewCallback) {
    onChangeViewCallback({
      type: 'multiple',
      state: { ...changeState },
    });
  }
}

export function disable(): void {
  const controls = document.querySelectorAll<HTMLInputElement>(
    '#property-type-filter input, #year-slider, ' +
      '#start-year-slider, #end-year-slider, #adjustment-mode-filter input'
  );
  controls.forEach((el) => (el.disabled = true));
}

export function enable(): void {
  const controls = document.querySelectorAll<HTMLInputElement>(
    '#property-type-filter input, #year-slider, ' +
      '#start-year-slider, #end-year-slider, #adjustment-mode-filter input'
  );
  controls.forEach((el) => (el.disabled = false));
}
