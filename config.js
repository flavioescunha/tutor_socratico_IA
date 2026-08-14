// config.js
const API_BASE_URL = "https://api.fisicaeciencia.org";

const api = {
    db: {
        async get(collection, id = null) {
            const url = id ? `${API_BASE_URL}/api/db/${collection}/${id}` : `${API_BASE_URL}/api/db/${collection}`;
            let response;
            try {
                response = await fetch(url, { headers: { "ngrok-skip-browser-warning": "true" } });
            } catch (err) {
                throw new Error(`Falha de rede ao acessar servidor (${err.message}). O Cloudflare Tunnel está rodando?`);
            }
            if (!response.ok) {
                if (response.status === 404) throw new Error("404 Not Found");
                throw new Error(`Erro ao buscar ${collection}: ${response.statusText}`);
            }
            return await response.json();
        },
        async post(collection, data, id = null) {
            const url = id ? `${API_BASE_URL}/api/db/${collection}?item_id=${id}` : `${API_BASE_URL}/api/db/${collection}`;
            let response;
            try {
                response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
                    body: JSON.stringify({ data })
                });
            } catch (err) {
                throw new Error(`Falha de rede ao acessar servidor (${err.message}). O Cloudflare Tunnel está rodando?`);
            }
            if (!response.ok) {
                let errText = "";
                try {
                    const errJson = await response.json();
                    errText = errJson.detail || JSON.stringify(errJson);
                } catch(e) {
                    errText = response.statusText;
                }
                throw new Error(`Erro ao salvar ${collection}: ${errText}`);
            }
            return await response.json();
        },
        async delete(collection, id) {
            const url = `${API_BASE_URL}/api/db/${collection}/${id}`;
            const response = await fetch(url, { method: "DELETE", headers: { "ngrok-skip-browser-warning": "true" } });
            if (!response.ok) throw new Error(`Erro ao deletar ${collection}: ${response.statusText}`);
            return await response.json();
        }
    },
    ai: {
        async chat(system_prompt, chat_history) {
            let apiKey = "";
            try {
                const setRes = await api.db.get('settings', 'global');
                apiKey = (setRes.data.gemini_api_key || "").trim();
            } catch(e) {}
            
            if (!apiKey) {
                throw new Error("Chave da API Gemini não configurada no Painel Admin.");
            }

            const gemini_contents = [];
            for (const msg of chat_history) {
                gemini_contents.push({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content || "" }]
                });
            }
            
            const payload = {
                systemInstruction: { parts: [{ text: system_prompt }] },
                contents: gemini_contents,
                generationConfig: { temperature: 0.7 }
            };

            const model_pool = [
                // --- FLASH ESTÁVEIS: prioridade para leitura/correção rápida ---
                {'name': 'models/gemini-omni-flash-preview', 'rpm': 10},
                {'name': 'models/gemini-3.6-flash', 'rpm': 10},
                {'name': 'models/gemini-3.5-flash', 'rpm': 10},
                {'name': 'models/gemini-3.1-flash-tts-preview', 'rpm': 10},
                {'name': 'models/gemini-3.1-flash-image-preview', 'rpm': 10},
                {'name': 'models/gemini-3.1-flash-image', 'rpm': 10},
                {'name': 'models/gemini-3-flash-preview', 'rpm': 10},
                {'name': 'models/gemini-2.5-flash-preview-tts', 'rpm': 10},
                {'name': 'models/gemini-2.5-flash-image', 'rpm': 10},
                {'name': 'models/gemini-2.5-flash', 'rpm': 10},
                {'name': 'models/gemini-1.5-flash', 'rpm': 10},
                // --- FLASH LITE: fallback leve e econômico ---
                {'name': 'models/gemini-3.5-flash-lite', 'rpm': 10},
                {'name': 'models/gemini-3.1-flash-lite-preview', 'rpm': 10},
                {'name': 'models/gemini-3.1-flash-lite-image', 'rpm': 10},
                {'name': 'models/gemini-3.1-flash-lite', 'rpm': 10},
                {'name': 'models/gemini-2.5-flash-lite', 'rpm': 10},
                // --- ALIASES "LATEST": deixam o programa mais resiliente ---
                {'name': 'models/gemini-pro-latest', 'rpm': 10},
                {'name': 'models/gemini-flash-lite-latest', 'rpm': 10},
                {'name': 'models/gemini-flash-latest', 'rpm': 10},
                // --- PRO POR ÚLTIMO: tarefas mais difíceis / fallback final ---
                {'name': 'models/nano-banana-pro-preview', 'rpm': 2},
                {'name': 'models/lyria-3-pro-preview', 'rpm': 2},
                {'name': 'models/gemini-3.1-pro-preview-customtools', 'rpm': 2},
                {'name': 'models/gemini-3.1-pro-preview', 'rpm': 2},
                {'name': 'models/gemini-3-pro-image-preview', 'rpm': 2},
                {'name': 'models/gemini-3-pro-image', 'rpm': 2},
                {'name': 'models/gemini-2.5-pro-preview-tts', 'rpm': 2},
                {'name': 'models/gemini-2.5-pro', 'rpm': 2},
                {'name': 'models/deep-research-pro-preview-12-2025', 'rpm': 2},
                // --- OUTROS MODELOS ENCONTRADOS ---
                {'name': 'models/lyria-3-clip-preview', 'rpm': 2},
                {'name': 'models/gemma-4-31b-it', 'rpm': 2},
                {'name': 'models/gemma-4-26b-a4b-it', 'rpm': 2},
                {'name': 'models/gemini-robotics-er-2-preview', 'rpm': 2},
                {'name': 'models/gemini-robotics-er-1.6-preview', 'rpm': 2},
                {'name': 'models/gemini-2.5-computer-use-preview-10-2025', 'rpm': 2},
                {'name': 'models/deep-research-preview-04-2026', 'rpm': 2},
                {'name': 'models/deep-research-max-preview-04-2026', 'rpm': 2},
                {'name': 'models/antigravity-preview-05-2026', 'rpm': 2}
            ];

            let last_error = "";
            for (const model of model_pool) {
                const url = `https://generativelanguage.googleapis.com/v1beta/${model.name}:generateContent?key=${apiKey}`;
                try {
                    const response = await fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    });
                    
                    if (response.ok) {
                        const fb_json = await response.json();
                        const text = fb_json.candidates[0].content.parts[0].text;
                        return { status: "success", reply: text };
                    } else {
                        last_error = await response.text();
                    }
                } catch (e) {
                    last_error = e.message;
                }
            }
            
            throw new Error(`Erro da API Gemini após esgotar todos os modelos. Último erro: ${last_error}`);
        }
    }
};

// Funções para lidar com sessões ativas
function getActiveSession() {
    return JSON.parse(localStorage.getItem('student_session') || 'null');
}

function setActiveSession(session) {
    localStorage.setItem('student_session', JSON.stringify(session));
}
