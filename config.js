// Configure sua URL do Google Apps Script Web App AQUI
const GAS_URL = "SUA_URL_DO_GOOGLE_APPS_SCRIPT_AQUI";

async function fetchGAS(payload) {
    if (GAS_URL === "https://script.google.com/macros/s/AKfycbwZQadzCONPI_lFhPE3Xlsadq5o4Q3SRg0eaWUvdFgLCIkqcTpyIuQYlAyWI_DcxYY6ew/exec") {
        throw new Error("⚠️ O sistema ainda não foi configurado. Insira a URL do Google Apps Script em config.js");
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
