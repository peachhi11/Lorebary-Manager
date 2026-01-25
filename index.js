import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, processCommands } from "../../../../script.js";

// MATCH THIS TO YOUR FOLDER NAME EXACTLY
const extensionName = "Lorebary-Manager"; 
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// API CONFIG
const PROXY_ENDPOINTS = {
    SEARCH: "/lorebary/api/search", 
    INSTALL: "/lorebary/api/get",
    STATUS: "/lorebary/api/status" 
};

const defaultSettings = {
    installed_books: [] 
};

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
}

// --- PROXY CONNECTION HOOK (SAFE VERSION) ---

function getActiveProxyConnection() {
    const context = getContext();
    
    // We access globals attached to the window object to avoid import crashes
    // If these don't exist in your version, it returns safe defaults.
    const oai = window.oai_settings || {}; 
    const textgen = window.textgenerationwebui_settings || {};
    
    let apiUrl = "";
    let apiKey = "";
    let apiType = context.main_api || "unknown";

    if (apiType === 'openai') {
        apiUrl = oai.reverse_proxy || oai.openai_url;
        apiKey = oai.openai_key;
    } 
    else if (apiType === 'textgenerationwebui') {
        apiUrl = textgen.api_server;
        apiKey = textgen.api_key;
    }
    else if (apiType === 'kobold') {
        apiUrl = context.kobold_url; 
    }

    if (apiUrl && apiUrl.endsWith('/')) {
        apiUrl = apiUrl.slice(0, -1);
    }

    return { apiUrl, apiKey, apiType };
}

async function checkProxyStatus() {
    const { apiUrl, apiKey } = getActiveProxyConnection();
    const $status = $("#lb_connection_status");

    if (!apiUrl) {
        $status.text("No Active API Connection").css("color", "red");
        return false;
    }

    $status.text("Connecting to Proxy...").css("color", "yellow");

    try {
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
            $status.text("Proxy Connected (No Lorebary Support)").css("color", "orange");
            return false;
        }
    } catch (err) {
        console.warn("Lorebary Handshake Failed:", err);
        $status.text("Proxy Connection Failed").css("color", "red");
        return false;
    }
}

// --- CORE ACTIONS ---

async function searchLorebary(query) {
    const { apiUrl, apiKey } = getActiveProxyConnection();
    if (!apiUrl) return toastr.error("Not connected to a proxy.", "Lorebary");

    $("#lb_run_search").prop("disabled", true).text("Searching...");

    try {
        const response = await fetch(`${apiUrl}${PROXY_ENDPOINTS.SEARCH}?q=${encodeURIComponent(query)}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!response.ok) throw new Error(`Proxy Error: ${response.status}`);
        const results = await response.json();
        
        console.log("Search Results:", results);
        toastr.success(`Found ${results.length} results (See Console)`, "Lorebary");
        
    } catch (err) {
        toastr.error(`Search Failed: ${err.message}`, "Lorebary");
    } finally {
        $("#lb_run_search").prop("disabled", false).text("Search");
    }
}

async function installFromProxy(bookId) {
    // Placeholder for install logic using slash commands to avoid direct saveWorldInfo dependency
    // which was crashing the previous version.
    const command = `/create-world-info entry name="Lorebary-${bookId}"`;
    await processCommands(command);
    toastr.info("Created empty World Info (Import logic WIP)", "Lorebary");
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
    searchLorebary(query);
}

// --- INITIALIZATION ---

jQuery(async () => {
    // Safely load HTML
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings").append(settingsHtml);
    } catch (e) {
        console.error("Lorebary: Failed to load settings.html", e);
        return;
    }

    await loadSettings();
    setTimeout(checkProxyStatus, 2000); 

    // Listeners
    $("#lb_refresh_list").on("click", () => { checkProxyStatus(); refreshLibraryList(); });
    $("#lb_run_search").on("click", handleSearchClick);
    
    $("#lb_search_query").on("keypress", (e) => {
        if(e.which === 13) handleSearchClick();
    });
    
    refreshLibraryList();
});
