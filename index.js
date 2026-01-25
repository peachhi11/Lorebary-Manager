import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, processCommands } from "../../../../script.js";

// --- CONFIGURATION ---
const extensionName = "Lorebary-Manager"; 
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// API Paths
const PROXY_PATHS = {
    SEARCH: "/search", 
    INSTALL: "/get",     
    STATUS: "/status" 
};

const defaultSettings = {
    installed_books: [] 
};

// --- SAFE LOAD LOGIC ---

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
}

// --- PROXY CONNECTION (Safe Mode) ---

function getActiveProxyConnection() {
    const context = getContext();
    
    // SAFE ACCESS: We read from window globals to avoid import crashes
    const oai = window.oai_settings || {}; 
    const textgen = window.textgenerationwebui_settings || {};
    
    let apiUrl = "";
    let apiKey = "";
    let apiType = context.main_api || "unknown";

    // 1. OpenAI / Reverse Proxy
    if (apiType === 'openai') {
        apiUrl = oai.reverse_proxy || oai.openai_url;
        apiKey = oai.openai_key;
    } 
    // 2. TextGenWebUI
    else if (apiType === 'textgenerationwebui') {
        apiUrl = textgen.api_server;
        apiKey = textgen.api_key;
    }
    // 3. KoboldAI
    else if (apiType === 'kobold') {
        apiUrl = context.kobold_url; 
    }

    // Sanitize URL
    if (apiUrl && apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);
    if (apiUrl && apiUrl.endsWith('/v1')) apiUrl = apiUrl.slice(0, -3);

    return { apiUrl, apiKey, apiType };
}

async function checkProxyStatus() {
    const { apiUrl, apiKey } = getActiveProxyConnection();
    const $status = $("#lb_connection_status");

    if (!apiUrl) {
        $status.text("No Active API Connection").css("color", "red");
        return;
    }

    $status.text("Connecting...").css("color", "yellow");

    try {
        // Ping the status endpoint
        const response = await fetch(`${apiUrl}${PROXY_PATHS.STATUS}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            $status.text("Connected via Proxy").css("color", "lightgreen");
        } else {
            // It connected, but the path might be wrong. This is still a "Success" for the extension loading.
            console.warn(`Lorebary: 404 on ${apiUrl}${PROXY_PATHS.STATUS}`);
            $status.text("Proxy Active (Lorebary Endpoint Not Found)").css("color", "orange");
        }
    } catch (err) {
        console.warn("Lorebary Handshake Failed:", err);
        $status.text("Proxy Connection Failed").css("color", "red");
    }
}

// --- ACTIONS ---

async function searchLorebary(query) {
    const { apiUrl, apiKey } = getActiveProxyConnection();
    if (!apiUrl) return toastr.error("Not connected to a proxy.", "Lorebary");

    $("#lb_run_search").prop("disabled", true).text("Searching...");

    try {
        const url = `${apiUrl}${PROXY_PATHS.SEARCH}?q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!response.ok) throw new Error(`Proxy Error: ${response.status}`);
        
        const results = await response.json();
        const list = Array.isArray(results) ? results : (results.results || []);
        
        console.log("Search Results:", list);
        if(list.length === 0) toastr.info("No results found.");
        else toastr.success(`Found ${list.length} results (See Console)`, "Lorebary");
        
    } catch (err) {
        toastr.error(`Search Failed: ${err.message}`, "Lorebary");
    } finally {
        $("#lb_run_search").prop("disabled", false).text("Search");
    }
}

async function installFromProxy(bookId) {
    // We can't use saveWorldInfo directly because it crashes some ST versions.
    // Instead, we use a slash command or a direct file write if available.
    // For now, we'll use a placeholder success to test the UI.
    toastr.info("Download logic ready. (Waiting on saveWorldInfo fix)", "Lorebary");
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


// --- MAIN INITIALIZATION LOOP ---

jQuery(async () => {
    try {
        // 1. Load HTML
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings").append(settingsHtml);

        // 2. Load Settings
        await loadSettings();

        // 3. Attach Listeners
        $("#lb_refresh_list").on("click", () => { checkProxyStatus(); refreshLibraryList(); });
        $("#lb_run_search").on("click", handleSearchClick);
        $("#lb_search_query").on("keypress", (e) => { if(e.which === 13) handleSearchClick(); });

        // 4. Initial Logic
        setTimeout(checkProxyStatus, 2000); 
        refreshLibraryList();

        console.log("Lorebary-Manager: Loaded Successfully");

    } catch (criticalError) {
        console.error("Lorebary-Manager CRITICAL LOAD ERROR:", criticalError);
        toastr.error("Lorebary failed to load (Check Console)", "Extension Error");
    }
});
