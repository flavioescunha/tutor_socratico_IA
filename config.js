// Configure sua URL do Google Apps Script Web App AQUI
const GAS_URL = "https://script.google.com/macros/s/AKfycbyKGeTMWftx6I0BSwzvEV_zBibSPA3Ep42y18FRJBvT2gz0iHK9dY0AANf3v_OT1d8z/exec";

async function fetchGAS(payload) {
    if (GAS_URL === "SUA_URL_DO_GOOGLE_APPS_SCRIPT_AQUI") {
        throw new Error("⚠️ O sistema ainda não foi configurado. Insira a URL do Google Apps Script em config.js");
    }
    
    // Auto-append admin token if available
    if (payload.action && payload.action.startsWith("admin_")) {
        payload.token = localStorage.getItem("admin_token");
    }

    // Google Apps Script exige fetch com Content-Type text/plain para evitar erro de CORS (Preflight OPTIONS)
    const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        throw new Error("Erro de rede: " + response.statusText);
    }
    
    const json = await response.json();
    if (json.status === "error") {
        throw new Error(json.message);
    }
    
    return json.data;
}
