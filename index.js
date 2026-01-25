import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, saveWorldInfo } from "../../../../script.js";

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

// --- SAFE LOAD LOGIC ---

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    for (const key in defaultSettings) {
        if (!extension_settings[extensionName].hasOwnProperty(key)) {
            extension_settings[extensionName][key] = defaultSettings[key];
        }
    }
    $("#lb_manual_url").val(extension_settings[extensionName].manual_url || "");
}

// --- CONNECTION HELPERS ---

function getActiveProxyConnection() {
    // 1. Manual Override
    const manualUrl = $("#lb_manual_url").val().trim();
    if (manualUrl) {
        const oai = window.oai_settings || {};
        return { apiUrl: cleanUrl(manualUrl), apiKey: oai.openai_key || "", apiType: 'manual' };
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

function cleanUrl(url) {
    if (!url) return "";
    if (url.endsWith('/')) url = url.slice(0, -1);
    if (url.endsWith('/v1')) url = url.slice(0, -3);
    return url;
}

/**
 * INTELLIGENT URL SPLITTER
 * The Chat proxy might be at .../openrouter, but the Search API is likely at the root.
 */
function getEndpoints(apiUrl) {
    // 1. Chat/Status URL (Keep as is)
    const chatUrl = apiUrl;

    // 2. Search URL (Try to strip the provider path)
    // Common providers to strip: /openai, /openrouter, /claude, /scale
    let searchUrl = apiUrl;
    const providers = ['/openai', '/openrouter', '/claude', '/scale', '/anthropic'];
    
    for (const p of providers) {
        if (searchUrl.toLowerCase().endsWith(p)) {
            searchUrl = searchUrl.slice(0, -p.length);
            break; // Stop after removing the first match
        }
    }

    return { chatUrl, searchUrl };
}

// --- CORE LOGIC ---

async function checkProxyStatus() {
    const { apiUrl, apiKey } = getActiveProxyConnection();
    const $status = $("#lb_connection_status");

    if (!apiUrl) {
        $status.text("No Proxy Configured").css("color", "red");
        return;
    }

    $status.text("Connecting...").css("color", "yellow");

    try {
        // We check status against the CHAT URL (because that's what validates the key)
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
            toastr.success("Connected to Lorebary Proxy!", "Lorebary");
        } else {
            console.warn(`[Lorebary] Status Check Failed: ${response.status}`);
            $status.text("Proxy Reachable (Auth/Endpoint Error)").css("color", "orange");
        }
    } catch (err) {
        console.warn("[Lorebary] Connection Failed:", err);
        $status.text("Connection Failed").css("color", "red");
    }
}

async function searchLorebary(query) {
    const { apiUrl, apiKey } = getActiveProxyConnection();
    if (!apiUrl) return toastr.error("Configure Proxy URL first.", "Lorebary");

    $("#lb_run_search").prop("disabled", true).text("Searching...");

    // USE THE SMART ENDPOINT
    const { searchUrl } = getEndpoints(apiUrl);
    
    try {
        // Construct: https://api.lorebary.com/search (instead of .../openrouter/search)
        const targetUrl = `${searchUrl}${PROXY_PATHS.SEARCH}?q=${encodeURIComponent(query)}`;
        console.log(`[Lorebary] Search Target: ${targetUrl}`);

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        const rawText = await response.text();
        
        if (!response.ok) throw new Error(`Server returned ${response.status}`);

        try {
            const results = JSON.parse(rawText);
            const list = Array.isArray(results) ? results : (results.results || []);
            
            if(list.length === 0) toastr.info("No results found.");
            else toastr.success(`Found ${list.length} results`, "Lorebary");
            
            console.log("[Lorebary] Results:", list);
            // Here we would normally render the results to the UI...
            
        } catch (jsonError) {
            console.error("JSON Error. Raw:", rawText);
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
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings").append(settingsHtml);
        await loadSettings();

        $("#lb_refresh_list").on("click", refreshLibraryList);
        $("#lb_save_manual").on("click", saveManualUrl);
        $("#lb_run_search").on("click", handleSearchClick);
        $("#lb_search_query").on("keypress", (e) => { if(e.which === 13) handleSearchClick(); });

        setTimeout(checkProxyStatus, 2000); 
        refreshLibraryList();

        console.log("Lorebary-Manager: Loaded");
    } catch (e) {
        console.error("Lorebary-Manager Error:", e);
    }
});
