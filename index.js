import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "st-lorebary-manager";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// Default settings for your manager
const defaultSettings = {
    autoRefresh: true,
    activeLibraries: [],
};

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
}

/**
 * Specifically targets Lorebary data structures.
 * Lorebary usually registers itself on the window or within the ST extension list.
 */
function getLorebaryStatus() {
    // Attempt to find Lorebary in the global scope or extension settings
    const lb = window.Lorebary || extension_settings['lorebary'];
    if (!lb) {
        return null;
    }
    return lb;
}

async function refreshLorebaryUI() {
    const lb = getLorebaryStatus();
    const $container = $("#lorebary_item_list");
    $container.empty();

    if (!lb) {
        $container.append('<div class="menu_text">Lorebary not detected. Please ensure it is installed and enabled.</div>');
        return;
    }

    // Example logic: iterate through Lorebary's known libraries/scripts
    // Note: Lorebary's internal keys may vary based on its version.
    const libraries = lb.libraries || []; 
    
    if (libraries.length === 0) {
        $container.append('<div class="menu_text">No Lorebary libraries found.</div>');
        return;
    }

    libraries.forEach((lib, index) => {
        const isChecked = lib.enabled ? 'checked' : '';
        const libHtml = `
            <div class="flex-container lb-manager-row">
                <input type="checkbox" class="lb-toggle" data-index="${index}" ${isChecked} />
                <label>${lib.name || 'Unnamed Library'}</label>
            </div>`;
        $container.append(libHtml);
    });
}

function handleToggle(event) {
    const lb = getLorebaryStatus();
    if (!lb) return;

    const index = $(event.target).data('index');
    const isEnabled = $(event.target).prop('checked');

    // Update Lorebary's internal state
    if (lb.libraries && lb.libraries[index]) {
        lb.libraries[index].enabled = isEnabled;
        toastr.info(`${lb.libraries[index].name} is now ${isEnabled ? 'Active' : 'Inactive'}`);
        
        // If Lorebary has a save function, trigger it here
        if (typeof lb.save === 'function') lb.save();
    }
}

jQuery(async () => {
    // Load HTML layout
    const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
    $("#extensions_settings").append(settingsHtml);

    // Initial Load
    await loadSettings();

    // UI Listeners
    $(document).on('change', '.lb-toggle', handleToggle);
    $("#refresh_lb").on('click', refreshLorebaryUI);

    // Initial check for Lorebary
    setTimeout(refreshLorebaryUI, 1000); // Small delay to ensure other extensions loaded
});