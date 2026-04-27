import type { TabChangeEvent } from './types';

let activeTab = 'price';
let onChangeCallback: ((event: TabChangeEvent) => void) | null = null;

export function init(options: { onChange?: (event: TabChangeEvent) => void } = {}): void {
  onChangeCallback = options.onChange ?? null;

  const tabButtons = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
  tabButtons.forEach((button) => {
    button.addEventListener('click', function () {
      const tabName = this.dataset['tab'];
      if (tabName && tabName !== activeTab) {
        switchTab(tabName);
      }
    });
  });
}

export function switchTab(tabName: string): void {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset['tab'] === tabName);
  });

  document.querySelectorAll('.tab-content').forEach((content) => {
    content.classList.toggle('active', content.id === `tab-${tabName}`);
  });

  activeTab = tabName;

  if (onChangeCallback) {
    onChangeCallback({ tab: tabName });
  }

  document.dispatchEvent(
    new CustomEvent('tabChange', {
      detail: { tab: tabName },
    })
  );
}

export function getActiveTab(): string {
  return activeTab;
}
