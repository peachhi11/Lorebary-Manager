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

// --- PROXY CONNECTION LOGIC ---

function getActiveProxyConnection() {
    // 1. Check Manual Override
    const manualUrl = $("#lb_manual_url").val().trim();
    if (manualUrl) {
        const oai = window.oai_settings || {};
        const key = oai.openai_key || ""; 
        let cleanUrl = manualUrl;
        if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
        if (cleanUrl.endsWith('/v1')) cleanUrl = cleanUrl.slice(0, -3);
        return { apiUrl: cleanUrl, apiKey: key, apiType: 'manual' };
    }

    // 2. Auto-Detect Fallback
    const context = getContext();
    const oai = window.oai_settings || {}; 
    const textgen = window.textgenerationwebui_settings || {};
    
    let apiUrl = "";
    let apiKey = "";
    
    if (oai.reverse_proxy) {
        apiUrl = oai.reverse_proxy;
        apiKey = oai.openai_key;
    } else if (oai.openai_url) {
        apiUrl = oai.openai_url;
        apiKey = oai.openai_key;
    } else if (textgen.api_server) {
        apiUrl = textgen.api_server;
        apiKey = textgen.api_key;
    }

    if (apiUrl && apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);
    if (apiUrl && apiUrl.endsWith('/v1')) apiUrl = apiUrl.slice(0, -3);

    return { apiUrl, apiKey, apiType: 'auto' };
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
            toastr.success("Connected to Lorebary Proxy!", "Lorebary");
        } else {
            console.warn(`[Lorebary] Status Check Failed: ${response.status}`);
            $status.text("Proxy Active (Endpoint Error)").css("color", "orange");
        }
    } catch (err) {
        console.warn("[Lorebary] Connection Failed:", err);
        $status.text("Connection Failed").css("color", "red");
    }
}

// --- ACTIONS ---

async function searchLorebary(query) {
    const { apiUrl, apiKey } = getActiveProxyConnection();
    if (!apiUrl) return toastr.error("Configure Proxy URL first.", "Lorebary");

    $("#lb_run_search").prop("disabled", true).text("Searching...");

    try {
        const url = `${apiUrl}${PROXY_PATHS.SEARCH}?q=${encodeURIComponent(query)}`;
        console.log(`[Lorebary] Requesting: ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        // --- DEBUGGING FIX: Read text first, then parse ---
        const rawText = await response.text();
        
        if (!response.ok) {
            console.error("[Lorebary] Server Error Response:", rawText);
            throw new Error(`Server returned ${response.status}. Check Console.`);
        }

        try {
            const results = JSON.parse(rawText);
            const list = Array.isArray(results) ? results : (results.results || []);
            
            if(list.length === 0) toastr.info("No results found.");
            else toastr.success(`Found ${list.length} results`, "Lorebary");
            
            // Log results to console for now
            console.log("[Lorebary] Search Results:", list);

        } catch (jsonError) {
            console.error("[Lorebary] JSON Parse Error. Raw response was:", rawText);
            throw new Error("Server returned invalid JSON (HTML?). Check Console.");
        }
        
    } catch (err) {
        toastr.error(`${err.message}`, "Lorebary Error");
    } finally {
        $("#lb_run_search").prop("disabled", false).text("Search");
    }
}

// --- UI EVENT HANDLERS ---

function saveManualUrl() {
    const url = $("#lb_manual_url").val().trim();
    extension_settings[extensionName].manual_url = url;
    saveSettingsDebounced();
    checkProxyStatus(); 
}

function refreshLibraryList() {
    // FIX: Only refreshes the UI list, does NOT re-run checkProxyStatus()
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
    
    toastr.success("Library list refreshed.");
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

        // Listeners
        $("#lb_refresh_list").on("click", refreshLibraryList); // Just refresh list
        $("#lb_save_manual").on("click", saveManualUrl);     // Save & Connect
        $("#lb_run_search").on("click", handleSearchClick);
        $("#lb_search_query").on("keypress", (e) => { if(e.which === 13) handleSearchClick(); });

        // Connect once on load
        setTimeout(checkProxyStatus, 2000); 
        refreshLibraryList();

        console.log("Lorebary-Manager: Loaded");
    } catch (e) {
        console.error("Lorebary-Manager Error:", e);
    }
});
