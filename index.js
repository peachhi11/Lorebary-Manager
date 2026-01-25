import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

// --- CONFIGURATION ---
const extensionName = "Lorebary-Manager"; 
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const PROXY_PATHS = {
    SEARCH: "/search", 
    INSTALL: "/get",     
    STATUS: "/status" 
};

const defaultSettings = {
    installed_books: [],
    manual_url: "" 
};

// --- HELPERS ---

function cleanUrl(url) {
    if (!url) return "";
    if (url.endsWith('/')) url = url.slice(0, -1);
    if (url.endsWith('/v1')) url = url.slice(0, -3);
    return url;
}

/**
 * INTELLIGENT URL SPLITTER
 * Separates the Chat URL (e.g. .../openrouter) from the Search URL (root).
 */
function getEndpoints(apiUrl) {
    // 1. Chat/Status URL (Keep as is)
    const chatUrl = apiUrl;

    // 2. Search URL (Try to strip the provider path)
    let searchUrl = apiUrl;
    const providers = ['/openai', '/openrouter', '/claude', '/scale', '/anthropic'];
    
    for (const p of providers) {
        if (searchUrl.toLowerCase().endsWith(p)) {
            searchUrl = searchUrl.slice(0, -p.length);
            break; 
        }
    }
    return { chatUrl, searchUrl };
}

// --- CONNECTION LOGIC ---

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    for (const key in defaultSettings) {
        if (!extension_settings[extensionName].hasOwnProperty(key)) {
            extension_settings[extensionName][key] = defaultSettings[key];
        }
    }
    // Safe jQuery check
    if ($("#lb_manual_url").length) {
        $("#lb_manual_url").val(extension_settings[extensionName].manual_url || "");
    }
}

function getActiveProxyConnection() {
    // 1. Manual Override
    const manualUrl = $("#lb_manual_url").val(); // .val() can be undefined if element missing
    if (manualUrl && manualUrl.trim()) {
        const oai = window.oai_settings || {};
        return { apiUrl: cleanUrl(manualUrl.trim()), apiKey: oai.openai_key || "", apiType: 'manual' };
    }

    // 2. Auto-Detect
    const context = getContext();
    const oai = window.oai_settings || {}; 
    const textgen = window.textgenerationwebui_settings || {};
    
    let apiUrl = "";
    if (oai.reverse_proxy) apiUrl = oai.reverse_proxy;
    else if (oai.openai_url) apiUrl = oai.openai_url;
    else if (textgen.api_server) apiUrl = textgen.api_server;

    return { apiUrl: cleanUrl(apiUrl), apiKey: oai.openai_key || "", apiType: 'auto' };
}

async function checkProxyStatus() {
    const { apiUrl, apiKey } = getActiveProxyConnection();
    const $status = $("#lb_connection_status");

    if (!apiUrl) {
        $status.text("No Proxy Configured").css("color", "red");
        return;
    }

    $status.text("Connecting...").css("color", "yellow");

    try {
        const targetUrl = `${apiUrl}${PROXY_PATHS.STATUS}`;
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            $status.text("Connected").css("color", "lightgreen");
            toastr.success("Lorebary Connected!");
        } else {
            // This is a "Soft Error" - Connection is good, but path might be wrong.
            console.warn(`[Lorebary] Status Check Failed: ${response.status}`);
            $status.text("Proxy Active (Endpoint Error)").css("color", "orange");
        }
    } catch (err) {
        console.warn("[Lorebary] Connection Failed:", err);
        $status.text("Connection Failed").css("color", "red");
    }
}

// --- SEARCH & INSTALL ---

async function searchLorebary(query) {
    const { apiUrl, apiKey } = getActiveProxyConnection();
    if (!apiUrl) return toastr.error("Configure Proxy URL first.", "Lorebary");

    $("#lb_run_search").prop("disabled", true).text("Searching...");

    // USE THE SMART ENDPOINT
    const { searchUrl } = getEndpoints(apiUrl);
    
    try {
        const targetUrl = `${searchUrl}${PROXY_PATHS.SEARCH}?q=${encodeURIComponent(query)}`;
        console.log(`[Lorebary] Search Target: ${targetUrl}`);

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        const rawText = await response.text();
        
        if (!response.ok) {
            console.error("Lorebary Search Error:", rawText);
            throw new Error(`Server returned ${response.status}`);
        }

        try {
            const results = JSON.parse(rawText);
            const list = Array.isArray(results) ? results : (results.results || []);
            
            if(list.length === 0) toastr.info("No results found.");
            else toastr.success(`Found ${list.length} results`, "Lorebary");
            
            console.log("[Lorebary] Results:", list);
            
        } catch (jsonError) {
            console.error("JSON Parse Error:", rawText);
            throw new Error("Invalid API Response (Still HTML?). Check Console.");
        }
        
    } catch (err) {
        toastr.error(`${err.message}`, "Search Error");
    } finally {
        $("#lb_run_search").prop("disabled", false).text("Search");
    }
}

// --- UI HANDLERS ---

function saveManualUrl() {
    const url = $("#lb_manual_url").val().trim();
    extension_settings[extensionName].manual_url = url;
    saveSettingsDebounced();
    checkProxyStatus(); 
}

function refreshLibraryList() {
    const settings = extension_settings[extensionName];
    const $container = $("#lorebary_installed_list");
    $container.empty();

    if (!settings.installed_books || settings.installed_books.length === 0) {
        $container.append('<div class="lb-empty-state">No libraries installed.</div>');
        return;
    }
    
    // Simple render of list
    settings.installed_books.forEach((book, index) => {
        $container.append(`<div class="lb-manager-row">${book.name}</div>`);
    });
    toastr.success("List refreshed.");
}

function handleSearchClick() {
    const query = $("#lb_search_query").val().trim();
    if (!query) return;
    searchLorebary(query);
}

// --- INITIALIZATION ---

jQuery(async () => {
    try {
        // Safe HTML Load
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings").append(settingsHtml);
        
        await loadSettings();

        // Listeners
        $("#lb_refresh_list").on("click", refreshLibraryList);
        $("#lb_save_manual").on("click", saveManualUrl);
        $("#lb_run_search").on("click", handleSearchClick);
        $("#lb_search_query").on("keypress", (e) => { if(e.which === 13) handleSearchClick(); });

        // Delayed Connect
        setTimeout(checkProxyStatus, 2000); 
        refreshLibraryList();

        console.log("Lorebary-Manager: Loaded Successfully");

    } catch (e) {
        console.error("Lorebary-Manager CRITICAL ERROR:", e);
        toastr.error("Extension failed to load.");
    }
});
