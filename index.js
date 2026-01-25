import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, processCommands } from "../../../../script.js";

// --- CONFIGURATION ---
const extensionName = "Lorebary-Manager"; 
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// API Paths - We can try multiple variations if one fails
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

// --- PROXY CONNECTION (Debug Mode) ---

function getActiveProxyConnection() {
    const context = getContext();
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

    // CLEANUP: Sanitize URL
    if (apiUrl) {
        if (apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);
        if (apiUrl.endsWith('/v1')) apiUrl = apiUrl.slice(0, -3); // Strip /v1 to get root
    }

    return { apiUrl, apiKey, apiType };
}

async function checkProxyStatus() {
    const { apiUrl, apiKey } = getActiveProxyConnection();
    const $status = $("#lb_connection_status");

    // DEBUG: Log exactly what we found
    console.log("[Lorebary Debug] Detected API URL:", apiUrl);
    
    if (!apiUrl) {
        $status.text("No Active API Connection").css("color", "red");
        toastr.error("Could not find an active Proxy URL in ST settings.", "Lorebary Debug");
        return;
    }

    $status.text("Connecting...").css("color", "yellow");

    const targetUrl = `${apiUrl}${PROXY_PATHS.STATUS}`;
    console.log("[Lorebary Debug] Attempting Fetch:", targetUrl);

    try {
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            $status.text("Connected via Proxy").css("color", "lightgreen");
            toastr.success(`Connected!`, "Lorebary");
        } else {
            console.warn(`[Lorebary Debug] HTTP Error ${response.status} on ${targetUrl}`);
            $status.text(`Error: ${response.status} (Check Console)`).css("color", "orange");
            toastr.warning(`Proxy reachable, but returned Error ${response.status}`, "Lorebary Debug");
        }
    } catch (err) {
        console.error("[Lorebary Debug] Network Error:", err);
        $status.text("Network Error (CORS?)").css("color", "red");
        
        // Detailed error for user
        toastr.error(`Network Error. Likely CORS blocking the browser. URL: ${targetUrl}`, "Lorebary Debug");
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
        
        if(list.length === 0) toastr.info("No results found.");
        else toastr.success(`Found ${list.length} results`, "Lorebary");
        
    } catch (err) {
        toastr.error(`Search Failed: ${err.message}`, "Lorebary");
    } finally {
        $("#lb_run_search").prop("disabled", false).text("Search");
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
    searchLorebary(query);
}


// --- INITIALIZATION ---

jQuery(async () => {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings").append(settingsHtml);
        await loadSettings();

        // Bind Listeners
        $("#lb_refresh_list").on("click", () => { checkProxyStatus(); refreshLibraryList(); });
        $("#lb_run_search").on("click", handleSearchClick);
        $("#lb_search_query").on("keypress", (e) => { if(e.which === 13) handleSearchClick(); });

        // Wait a moment for ST to load settings, then check
        setTimeout(checkProxyStatus, 2000); 
        refreshLibraryList();

        console.log("Lorebary-Manager: Loaded Successfully");
    } catch (criticalError) {
        console.error("Lorebary-Manager CRITICAL LOAD ERROR:", criticalError);
        toastr.error("Lorebary failed to load (Check Console)", "Extension Error");
    }
});
