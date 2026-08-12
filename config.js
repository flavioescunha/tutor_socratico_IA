// config.js
const API_BASE_URL = "https://ruminatively-immediate-dawn.ngrok-free.dev";

const api = {
    db: {
        async get(collection, id = null) {
            const url = id ? `${API_BASE_URL}/api/db/${collection}/${id}` : `${API_BASE_URL}/api/db/${collection}`;
            const response = await fetch(url, { headers: { "ngrok-skip-browser-warning": "true" } });
            if (!response.ok) throw new Error(`Erro ao buscar ${collection}: ${response.statusText}`);
            return await response.json();
        },
        async post(collection, data, id = null) {
            const url = id ? `${API_BASE_URL}/api/db/${collection}?item_id=${id}` : `${API_BASE_URL}/api/db/${collection}`;
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
                body: JSON.stringify({ data })
            });
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
            const url = `${API_BASE_URL}/api/ai/chat`;
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
                body: JSON.stringify({ system_prompt, chat_history })
            });
            if (!response.ok) {
                let errText = "";
                try {
                    const errJson = await response.json();
                    errText = errJson.detail || JSON.stringify(errJson);
                } catch(e) {
                    errText = response.statusText;
                }
                throw new Error(`Erro na IA: ${errText}`);
            }
            return await response.json();
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
