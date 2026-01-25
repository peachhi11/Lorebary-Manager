import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, processCommands, saveWorldInfo } from "../../../../script.js";
import { textgenerationwebui_settings as textgen_settings, oai_settings } from "../../../../script.js";

// MATCH THIS TO YOUR FOLDER NAME
const extensionName = "Lorebary-Manager"; 
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// CONFIG: Relative paths for the Lorebary Proxy API
// Edit these if the proxy uses different endpoints
const PROXY_ENDPOINTS = {
    SEARCH: "/lorebary/api/search",  // Example: proxy.com/lorebary/api/search
    INSTALL: "/lorebary/api/get",    // Example: proxy.com/lorebary/api/get
    STATUS: "/lorebary/api/status"   // Heartbeat check
};

// Default Settings
const defaultSettings = {
    installed_books: [] 
};

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
}

// --- PROXY CONNECTION HOOK ---

/**
 * Snoops ST settings to find the active Proxy URL and Key.
 * Supports OpenAI (Chat Completion) and TextGenWebUI sources.
 */
function getActiveProxyConnection() {
    const context = getContext();
    const apiType = context.main_api; // 'openai', 'textgenerationwebui', 'kobold', etc.
    
    let apiUrl = "";
    let apiKey = "";

    // Hook into OpenAI Compatible settings (Common for Proxies)
    if (apiType === 'openai') {
        apiUrl = oai_settings.reverse_proxy || oai_settings.openai_url;
        apiKey = oai_settings.openai_key;
    } 
    // Hook into TextGenWebUI settings
    else if (apiType === 'textgenerationwebui') {
        apiUrl = textgen_settings.api_server;
        apiKey = textgen_settings.api_key; // often unused, but good to have
    }
    // Hook into KoboldAI settings
    else if (apiType === 'kobold') {
        apiUrl = context.kobold_url; 
        // Kobold usually puts the key in the headers automatically, 
        // but we might need to grab it if stored in a setting.
    }

    // Clean up URL (remove trailing slash)
    if (apiUrl && apiUrl.endsWith('/')) {
        apiUrl = apiUrl.slice(0, -1);
    }

    return { apiUrl, apiKey, apiType };
}

/**
 * Validates connectivity to the Lorebary subsystem on the proxy
 */
async function checkProxyStatus() {
    const { apiUrl, apiKey } = getActiveProxyConnection();
    const $status = $("#lb_connection_status");

    if (!apiUrl) {
        $status.text("No Active API Connection").css("color", "red");
        return false;
    }

    $status.text("Connecting to Proxy...").css("color", "yellow");

    try {
        // We ping the status endpoint to see if this proxy supports Lorebary
        const response = await fetch(`${apiUrl}${PROXY_ENDPOINTS.STATUS}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            $status.text("Connected via Proxy").css("color", "lightgreen");
            return true;
        } else {
            // If 404, the proxy works but doesn't have Lorebary endpoints
            $status.text("Proxy Connected (No Lorebary Support Detected)").css("color", "orange");
            return false;
        }
    } catch (err) {
        console.error("Lorebary Handshake Failed:", err);
        $status.text("Proxy Connection Failed").css("color", "red");
        return false;
    }
}

// --- API ACTIONS ---

/**
 * Search the Lorebary library via the Proxy
 */
async function searchLorebary(query) {
    const { apiUrl, apiKey } = getActiveProxyConnection();
    if (!apiUrl) return toastr.error("Not connected to a proxy.", "Lorebary");

    $("#lb_run_search").prop("disabled", true).text("Searching...");

    try {
        const response = await fetch(`${apiUrl}${PROXY_ENDPOINTS.SEARCH}?q=${encodeURIComponent(query)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`Proxy Error: ${response.status}`);

        const results = await response.json();
        // Assume results is an array of { name, id, description }
        // For now, we just pick the first one to simulate 'Import' behavior or log it
        console.log("Search Results:", results);
        toastr.success(`Found ${results.length} results (Check Console)`, "Lorebary");
        
    } catch (err) {
        toastr.error(`Search Failed: ${err.message}`, "Lorebary");
    } finally {
        $("#lb_run_search").prop("disabled", false).text("Search");
    }
}

/**
 * Downloads a Lorebook via the Proxy (bypassing CORS/Auth issues)
 */
async function installFromProxy(bookId) {
    const { apiUrl, apiKey } = getActiveProxyConnection();
    
    try {
        toastr.info("Requesting Lorebook from Proxy...", "Lorebary");
        
        const response = await fetch(`${apiUrl}${PROXY_ENDPOINTS.INSTALL}/${bookId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        if (!response.ok) throw new Error("Download failed");
        
        const data = await response.json();
        const bookName = data.name || `Lorebary-${bookId}`;

        // Save to SillyTavern
        await saveWorldInfo(bookName, data, false);

        // Update Extension Settings
        const settings = extension_settings[extensionName];
        if (!settings.installed_books.find(b => b.name === bookName)) {
            settings.installed_books.push({ name: bookName, source_id: bookId, enabled: true });
            saveSettingsDebounced();
        }

        toastr.success(`Installed: ${bookName}`, "Lorebary");
        refreshLibraryList();

    } catch (err) {
        toastr.error(err.message, "Lorebary Install Error");
    }
}


// --- UI HANDLING ---

function refreshLibraryList() {
    const settings = extension_settings[extensionName];
    const $container = $("#lorebary_installed_list");
    $container.empty();

    if (!settings.installed_books || settings.installed_books.length === 0) {
        $container.append('<div class="lb-empty-state">No libraries installed via Proxy.</div>');
        return;
    }

    settings.installed_books.forEach((book, index) => {
        const $row = $(`
            <div class="lb-manager-row flex-container">
                <input type="checkbox" class="lb-item-toggle" data-index="${index}" ${book.enabled ? 'checked' : ''} />
                <span class="lb-item-name" title="${book.name}">${book.name}</span>
                <div class="lb-item-actions">
                     <i class="fa-solid fa-trash lb-delete-item" data-index="${index}" title="Remove"></i>
                </div>
            </div>
        `);
        $container.append($row);
    });
}

function handleSearchClick() {
    const query = $("#lb_search_query").val().trim();
    if (!query) return;
    
    // For now, trigger search
    searchLorebary(query);
}

function handleToggle(event) {
    const index = $(event.target).data('index');
    const enabled = $(event.target).prop('checked');
    const settings = extension_settings[extensionName];

    if (settings.installed_books[index]) {
        settings.installed_books[index].enabled = enabled;
        saveSettingsDebounced();
        toastr.success(`${settings.installed_books[index].name} ${enabled ? 'Enabled' : 'Disabled'}`);
    }
}

function handleDelete(event) {
    const index = $(event.target).data('index');
    const settings = extension_settings[extensionName];
    
    if (!confirm(`Remove ${settings.installed_books[index].name}?`)) return;

    settings.installed_books.splice(index, 1);
    saveSettingsDebounced();
    refreshLibraryList();
}


// --- INITIALIZATION ---

jQuery(async () => {
    // Load Settings HTML
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $("#extensions_settings").append(settingsHtml);

    // Initial Setup
    await loadSettings();

    // Check Proxy Connection immediately
    setTimeout(checkProxyStatus, 2000); 

    // Event Listeners
    $("#lb_refresh_list").on("click", () => { 
        checkProxyStatus(); 
        refreshLibraryList(); 
    });

    $("#lb_run_search").on("click", handleSearchClick);
    $(document).on("change", ".lb-item-toggle", handleToggle);
    $(document).on("click", ".lb-delete-item", handleDelete);
    
    $("#lb_search_query").on("keypress", (e) => {
        if(e.which === 13) handleSearchClick();
    });
    
    refreshLibraryList();
});
