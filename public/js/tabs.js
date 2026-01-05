/**
 * Tabs Module
 * Handles tab switching in the controls panel
 */
const TabsModule = (function() {
    // Current active tab
    let activeTab = 'price';

    // Callback for tab changes
    let onChangeCallback = null;

    /**
     * Initialize the tabs module
     * @param {Object} options - Configuration options
     * @param {Function} options.onChange - Callback when tab changes
     */
    function init(options = {}) {
        onChangeCallback = options.onChange || null;

        // Get all tab buttons
        const tabButtons = document.querySelectorAll('.tab-btn');

        tabButtons.forEach(button => {
            button.addEventListener('click', function() {
                const tabName = this.dataset.tab;
                if (tabName !== activeTab) {
                    switchTab(tabName);
                }
            });
        });
    }

    /**
     * Switch to a specific tab
     * @param {string} tabName - Name of the tab to switch to
     */
    function switchTab(tabName) {
        // Update button states
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update content visibility
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabName}`);
        });

        activeTab = tabName;

        // Emit change event
        if (onChangeCallback) {
            onChangeCallback({
                tab: tabName
            });
        }

        // Also dispatch a custom event
        document.dispatchEvent(new CustomEvent('tabChange', {
            detail: { tab: tabName }
        }));
    }

    /**
     * Get the currently active tab
     * @returns {string}
     */
    function getActiveTab() {
        return activeTab;
    }

    // Public API
    return {
        init,
        switchTab,
        getActiveTab
    };
})();
