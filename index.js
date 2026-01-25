import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, processCommands, saveWorldInfo } from "../../../../script.js";

// MATCH THIS TO YOUR FOLDER NAME EXACTLY
const extensionName = "Lorebary-Manager"; 
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// API CONFIG
// The extension will append these to your active Proxy URL.
// Example: https://api.lorebary.com/openai/search
const PROXY_PATHS = {
    SEARCH: "/search", 
    INSTALL: "/get",     // or /lorebook/get depending on specific API docs
    STATUS: "/status" 
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

// --- PROXY CONNECTION HOOK ---

function getActiveProxyConnection() {
    const context = getContext();
    
    // Access globals safely via window to prevent import crashes
    const oai = window.oai_settings || {}; 
    const textgen = window.textgenerationwebui_settings || {};
    
    let apiUrl = "";
    let apiKey = "";
    let apiType = context.main_api || "unknown";

    // 1. OpenAI Compatible (The standard for most Proxies)
    if (apiType === 'openai') {
        // Prefer reverse_proxy if set, otherwise openai_url
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

    // Clean trailing slash
    if (apiUrl && apiUrl.endsWith('/')) {
        apiUrl = apiUrl.slice(0, -1);
    }

    // Remove '/v1' if present, as Lorebary endpoints likely sit at the root or sibling paths
    // E.g. https://api.lorebary.com/openai/v1 -> https://api.lorebary.com/openai
    if (apiUrl.endsWith('/v1')) {
        apiUrl = apiUrl.slice(0, -3);
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
            return true;
        } else {
            // 404 means the proxy is there, but maybe the path is wrong
            console.warn(`Lorebary: 404 on ${apiUrl}${PROXY_PATHS.STATUS}`);
            $status.text("Proxy Active (Lorebary Endpoint Not Found)").css("color", "orange");
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
        // Example: GET https://api.lorebary.com/openai/search?q=fantasy
        const url = `${apiUrl}${PROXY_PATHS.SEARCH}?q=${encodeURIComponent(query)}`;
        console.log(`Lorebary Search: ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!response.ok) throw new Error(`Proxy Error: ${response.status}`);
        
        const results = await response.json();
        
        // Handle result format (array vs object)
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
    const { apiUrl, apiKey } = getActiveProxyConnection();
    
    try {
        const url = `${apiUrl}${PROXY_PATHS.INSTALL}/${bookId}`; // e.g. .../get/12345
        toastr.info("Downloading...", "Lorebary");

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!response.ok) throw new Error("Download failed");
        
        const data = await response.json();
        const bookName = data.name || `Lorebary-${bookId}`;

        // Attempt to save using internal ST function
        if (typeof saveWorldInfo === "function") {
            await saveWorldInfo(bookName, data, false);
            toastr.success(`Installed: ${bookName}`);
        } else {
            throw new Error("saveWorldInfo function missing from this ST version.");
        }

        // Update UI List
        const settings = extension_settings[extensionName];
        if (!settings.installed_books.find(b => b.name === bookName)) {
            settings.installed_books.push({ name: bookName, id: bookId, enabled: true });
            saveSettingsDebounced();
            refreshLibraryList();
        }

    } catch (err) {
        toastr.error(err.message, "Install Error");
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
    } catch (e) {
        console.error("Lorebary: Failed to load settings.html", e);
        return;
    }

    await loadSettings();
    setTimeout(checkProxyStatus, 2000); 

    $("#lb_refresh_list").on("click", () => { checkProxyStatus(); refreshLibraryList(); });
    $("#lb_run_search").on("click", handleSearchClick);
    
    $("#lb_search_query").on("keypress", (e) => {
        if(e.which === 13) handleSearchClick();
    });
    
    refreshLibraryList();
});import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, processCommands, saveWorldInfo } from "../../../../script.js";

// MATCH THIS TO YOUR FOLDER NAME EXACTLY
const extensionName = "Lorebary-Manager"; 
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// API CONFIG
// The extension will append these to your active Proxy URL.
// Example: https://api.lorebary.com/openai/search
const PROXY_PATHS = {
    SEARCH: "/search", 
    INSTALL: "/get",     // or /lorebook/get depending on specific API docs
    STATUS: "/status" 
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

// --- PROXY CONNECTION HOOK ---

function getActiveProxyConnection() {
    const context = getContext();
    
    // Access globals safely via window to prevent import crashes
    const oai = window.oai_settings || {}; 
    const textgen = window.textgenerationwebui_settings || {};
    
    let apiUrl = "";
    let apiKey = "";
    let apiType = context.main_api || "unknown";

    // 1. OpenAI Compatible (The standard for most Proxies)
    if (apiType === 'openai') {
        // Prefer reverse_proxy if set, otherwise openai_url
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

    // Clean trailing slash
    if (apiUrl && apiUrl.endsWith('/')) {
        apiUrl = apiUrl.slice(0, -1);
    }

    // Remove '/v1' if present, as Lorebary endpoints likely sit at the root or sibling paths
    // E.g. https://api.lorebary.com/openai/v1 -> https://api.lorebary.com/openai
    if (apiUrl.endsWith('/v1')) {
        apiUrl = apiUrl.slice(0, -3);
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
            return true;
        } else {
            // 404 means the proxy is there, but maybe the path is wrong
            console.warn(`Lorebary: 404 on ${apiUrl}${PROXY_PATHS.STATUS}`);
            $status.text("Proxy Active (Lorebary Endpoint Not Found)").css("color", "orange");
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
        // Example: GET https://api.lorebary.com/openai/search?q=fantasy
        const url = `${apiUrl}${PROXY_PATHS.SEARCH}?q=${encodeURIComponent(query)}`;
        console.log(`Lorebary Search: ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!response.ok) throw new Error(`Proxy Error: ${response.status}`);
        
        const results = await response.json();
        
        // Handle result format (array vs object)
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
    const { apiUrl, apiKey } = getActiveProxyConnection();
    
    try {
        const url = `${apiUrl}${PROXY_PATHS.INSTALL}/${bookId}`; // e.g. .../get/12345
        toastr.info("Downloading...", "Lorebary");

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!response.ok) throw new Error("Download failed");
        
        const data = await response.json();
        const bookName = data.name || `Lorebary-${bookId}`;

        // Attempt to save using internal ST function
        if (typeof saveWorldInfo === "function") {
            await saveWorldInfo(bookName, data, false);
            toastr.success(`Installed: ${bookName}`);
        } else {
            throw new Error("saveWorldInfo function missing from this ST version.");
        }

        // Update UI List
        const settings = extension_settings[extensionName];
        if (!settings.installed_books.find(b => b.name === bookName)) {
            settings.installed_books.push({ name: bookName, id: bookId, enabled: true });
            saveSettingsDebounced();
            refreshLibraryList();
        }

    } catch (err) {
        toastr.error(err.message, "Install Error");
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
    } catch (e) {
        console.error("Lorebary: Failed to load settings.html", e);
        return;
    }

    await loadSettings();
    setTimeout(checkProxyStatus, 2000); 

    $("#lb_refresh_list").on("click", () => { checkProxyStatus(); refreshLibraryList(); });
    $("#lb_run_search").on("click", handleSearchClick);
    
    $("#lb_search_query").on("keypress", (e) => {
        if(e.which === 13) handleSearchClick();
    });
    
    refreshLibraryList();
});
