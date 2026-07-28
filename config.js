// Configure sua URL do Google Apps Script Web App AQUI
const GAS_URL = "https://script.google.com/macros/s/AKfycby12ioVbLmPOxgzLjdgLgrHLEMHrsS7NLQyOzB9NT-b6wONyJHRPpL6opiqPrvjti9j1Q/exec";

async function fetchGAS(payload) {
    if (GAS_URL === "SUA_URL_DO_GOOGLE_APPS_SCRIPT_AQUI") {
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
