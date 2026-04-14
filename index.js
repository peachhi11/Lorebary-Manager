import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

// --- CONFIGURATION ---
const extensionName = "Lorebary-Manager"; 
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// THE URL YOU FOUND
const LOREBARY_SEARCH_API = "https://lorebary.com/api/search";

const defaultSettings = {
    installed_books: [],
    manual_url: "" 
};

// --- CONNECTION LOGIC ---

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    for (const key in defaultSettings) {
        if (!extension_settings[extensionName].hasOwnProperty(key)) {
            extension_settings[extensionName][key] = defaultSettings[key];
        }
    }
    if ($("#lb_manual_url").length) {
        $("#lb_manual_url").val(extension_settings[extensionName].manual_url || "");
    }
}

// We still check the proxy status just to show the user they are "Online"
// but we won't use this URL for searching anymore.
async function checkProxyStatus() {
    const $status = $("#lb_connection_status");
    $status.text("Mode: Website Search").css("color", "cyan");
}

// --- SEARCH LOGIC (DIRECT WEBSITE) ---

async function searchLorebary(query) {
    $("#lb_run_search").prop("disabled", true).text("Searching...");

    try {
        const params = new URLSearchParams({
            q: query,
            category: 'all',
            limit: '20',
            offset: '0',
            page: '1',
            sortBy: 'relevance',
            sortOrder: 'desc'
        });

        const targetUrl = `${LOREBARY_SEARCH_API}?${params.toString()}`;
        console.log(`[Lorebary] Requesting via ST plugin: ${targetUrl}`);

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        const rawText = await response.text();

        if (!response.ok) {
            console.error("Lorebary Error:", rawText);
            throw new Error(`Server returned ${response.status}`);
        }

        let data;
        try {
            data = JSON.parse(rawText);
        } catch (jsonError) {
            console.error("JSON Parse Error:", rawText);
            throw new Error("Invalid API Response. Check Console.");
        }

        let list = [];
        if (Array.isArray(data)) list = data;
        else if (data.rows && Array.isArray(data.rows)) list = data.rows;
        else if (data.data && Array.isArray(data.data)) list = data.data;
        else if (data.results && Array.isArray(data.results)) list = data.results;

        if (list.length === 0) {
            toastr.info("No results found.");
        } else {
            toastr.success(`Found ${list.length} results!`);
            console.log("[Lorebary] Results:", list);

            // Optional: render a simple result list
            const $container = $("#lorebary_installed_list");
            $container.empty();

            for (const item of list) {
                const name = item.name || item.title || item.slug || "Untitled";
                $container.append(`<div class="lb-manager-row">${name}</div>`);
            }
        }

    } catch (err) {
        console.error(err);
        toastr.error(`${err.message}`, "Search Error");
    } finally {
        $("#lb_run_search").prop("disabled", false).text("Search");
    }
}
        // Note: We try WITHOUT the API key first, as public search is usually open.
        // If this fails with CORS, the user needs a CORS-Unblock extension.
        const LOREBARY_SEARCH_API = "/api/plugins/lorebary/search";
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        const rawText = await response.text();

        if (!response.ok) {
            console.error("Lorebary Error:", rawText);
            throw new Error(`Server returned ${response.status}`);
        }

        try {
            const data = JSON.parse(rawText);
            
            // The API likely returns { rows: [...] } or { data: [...] } or just [...]
            // We try to detect the array.
            let list = [];
            if (Array.isArray(data)) list = data;
            else if (data.rows && Array.isArray(data.rows)) list = data.rows;
            else if (data.data && Array.isArray(data.data)) list = data.data;
            else if (data.results && Array.isArray(data.results)) list = data.results;

            if(list.length === 0) {
                toastr.info("No results found.");
            } else {
                toastr.success(`Found ${list.length} results!`);
                console.log("[Lorebary] Results:", list);
                // Future: Render these results to the UI
            }
            
        } catch (jsonError) {
            console.error("JSON Parse Error:", rawText);
            throw new Error("Invalid API Response. Check Console.");
        }
        
    } catch (err) {
        console.error(err);
        if (err.message.includes("Failed to fetch")) {
            toastr.error("Network Error: CORS blocked. Please install an 'Allow CORS' browser extension.", "Connection Blocked");
        } else {
            toastr.error(`${err.message}`, "Search Error");
        }
    } finally {
        $("#lb_run_search").prop("disabled", false).text("Search");
    }
}

// --- UI HANDLERS ---

function refreshLibraryList() {
    const settings = extension_settings[extensionName];
    const $container = $("#lorebary_installed_list");
    $container.empty();

    if (!settings.installed_books || settings.installed_books.length === 0) {
        $container.append('<div class="lb-empty-state">No libraries installed.</div>');
        return;
    }
    
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
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings").append(settingsHtml);
        
        await loadSettings();

        $("#lb_refresh_list").on("click", refreshLibraryList);
        $("#lb_run_search").on("click", handleSearchClick);
        $("#lb_search_query").on("keypress", (e) => { if(e.which === 13) handleSearchClick(); });

        checkProxyStatus(); 
        refreshLibraryList();

        console.log("Lorebary-Manager: Loaded");

    } catch (e) {
        console.error("Lorebary-Manager CRITICAL ERROR:", e);
    }
});
