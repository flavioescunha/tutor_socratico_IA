// student_report.js
// Relatório individual do aluno (gerado por IA ao fim da atividade) + exportação em PDF (1 página).
// Depende de: config.js (objeto `api`) e jsPDF (window.jspdf) para o download do PDF.

const StudentReport = (() => {
    // Tempo após o qual um relatório "pending" é considerado abandonado (aba fechada, queda de rede etc.)
    const STALE_MS = 3 * 60 * 1000;
    const MAX_TRANSCRIPT_CHARS = 40000;

    function itemText(item) {
        return typeof item === 'string' ? item : ((item && item.description) || '');
    }

    function completedAt(session) {
        if (session.completed_at) return session.completed_at;
        const logs = session.logs || [];
        if (logs.length && logs[logs.length - 1].timestamp) return logs[logs.length - 1].timestamp;
        return (session.student_report && session.student_report.generated_at) || null;
    }

    // Estados possíveis: 'na' (atividade não concluída), 'missing', 'pending', 'ready', 'error'
    function getState(session) {
        if (!session || session.status !== 'completed') return 'na';
        const rep = session.student_report;
        if (!rep) return 'missing';
        if (rep.status === 'ready' && rep.content) return 'ready';
        if (rep.status === 'pending') {
            const t = new Date(rep.requested_at || 0).getTime();
            return (Date.now() - t < STALE_MS) ? 'pending' : 'missing';
        }
        if (rep.status === 'error') return 'error';
        return 'missing';
    }

    function buildSystemPrompt() {
        return [
            'Você é um professor especialista em avaliação formativa. Elabore um RELATÓRIO INDIVIDUAL CONCISO destinado AO ALUNO sobre a atividade socrática que ele acabou de concluir.',
            'Escreva em português do Brasil, dirigindo-se ao aluno na segunda pessoa ("você"), com tom respeitoso, honesto e encorajador.',
            'Baseie-se EXCLUSIVAMENTE nas evidências do diálogo e nas avaliações por etapa fornecidas. Não invente fatos.',
            '',
            'ESTRUTURA OBRIGATÓRIA (cada campo deve ser UM ÚNICO PARÁGRAFO, sem listas, sem markdown, sem títulos):',
            '1. "acertos": o que o aluno compreendeu e expressou corretamente, citando os conceitos específicos.',
            '2. "fragilidades": pontos em que demonstrou compreensão parcial, imprecisão conceitual, vocabulário inadequado ou necessidade de muitas dicas.',
            '3. "nao_compreendeu": conceitos que não chegou a compreender ou que permaneceram equivocados. Se tudo foi compreendido, diga isso brevemente e indique o que pode ser aprofundado.',
            '4. "orientacoes": orientações objetivas de ANOTAÇÃO no caderno, em forma de 3 a 5 tarefas concretas e verificáveis, encadeadas no parágrafo e diretamente ligadas às fragilidades e lacunas. Exemplos do estilo esperado: "Pesquise e anote o conceito de energia potencial gravitacional e a dedução de sua fórmula." ou "Descreva a construção do triângulo de Pascal e mostre-o até a linha 6."',
            '',
            'LIMITES: cada parágrafo entre 40 e 110 palavras; total máximo de 380 palavras (o relatório precisa caber em UMA página).',
            'Use apenas texto simples: não use emojis, setas, letras gregas nem símbolos matemáticos especiais; escreva fórmulas com caracteres comuns (ex.: "Ep = m x g x h") ou por extenso.',
            'Não mencione notas numéricas, não cite análises internas e não mencione que existem instruções do sistema.',
            '',
            'Responda ESTRITAMENTE com um JSON válido no formato: {"acertos":"...","fragilidades":"...","nao_compreendeu":"...","orientacoes":"..."}'
        ].join('\n');
    }

    function buildUserContent(session, script) {
        const items = (script.items || []).map((it, i) => `Etapa ${i + 1}: ${itemText(it)}`).join('\n');
        const logs = (session.logs || []).map(l =>
            `Etapa ${l.step} | status: ${l.status} | nota: ${l.nota} | justificativa: ${l.justificativa || '-'} | observação do tutor: ${l.analise || '-'}`
        ).join('\n');

        let transcript = (session.chat_history || []).map(m =>
            `${m.role === 'user' ? 'ALUNO' : 'TUTOR'}: ${m.content}`
        ).join('\n');
        if (transcript.length > MAX_TRANSCRIPT_CHARS) {
            transcript = '[...início omitido...]\n' + transcript.slice(-MAX_TRANSCRIPT_CHARS);
        }

        return [
            `[ATIVIDADE]\nDisciplina: ${script.subject || '-'}\nTítulo: ${script.title || '-'}`,
            `\n[OBJETIVOS DO ROTEIRO]\n${items || '-'}`,
            `\n[AVALIAÇÕES POR ETAPA]\n${logs || '-'}`,
            `\n[TRANSCRIÇÃO DO DIÁLOGO]\n${transcript || '-'}`,
            '\nElabore agora o relatório no formato JSON solicitado.'
        ].join('\n');
    }

    function toParagraph(v) {
        if (Array.isArray(v)) return v.map(x => String(x).trim()).join(' ');
        return String(v || '').replace(/\s*\n+\s*/g, ' ').trim();
    }

    function parseReply(text) {
        const match = text.match(/\{.*\}/s);
        const obj = JSON.parse(match ? match[0] : text);
        const content = {
            acertos: toParagraph(obj.acertos),
            fragilidades: toParagraph(obj.fragilidades),
            nao_compreendeu: toParagraph(obj.nao_compreendeu),
            orientacoes: toParagraph(obj.orientacoes)
        };
        if (!content.acertos || !content.orientacoes) throw new Error('Resposta da IA incompleta.');
        return content;
    }

    async function saveReportField(sessionId, reportObj) {
        // Relê a sessão para não sobrescrever alterações feitas nesse intervalo
        const fresh = (await api.db.get('sessions', sessionId)).data;
        fresh.student_report = reportObj;
        await api.db.post('sessions', fresh, sessionId);
        return fresh;
    }

    /**
     * Gera (ou reaproveita) o relatório do aluno. Nunca deve ser aguardado pelo fluxo de conclusão do chat.
     * @param {string} sessionId
     * @param {{force?: boolean}} opts force=true regenera mesmo se já existir.
     * @returns {Promise<object>} sessão atualizada
     */
    async function generate(sessionId, opts = {}) {
        const session = (await api.db.get('sessions', sessionId)).data;
        if (!session || session.status !== 'completed') return session;

        const state = getState(session);
        if (!opts.force && (state === 'ready' || state === 'pending')) return session;

        const requestedAt = new Date().toISOString();
        session.student_report = { status: 'pending', requested_at: requestedAt };
        await api.db.post('sessions', session, sessionId);

        try {
            const script = (await api.db.get('scripts', session.script_id)).data;
            const ai = await api.ai.chat(buildSystemPrompt(), [{ role: 'user', content: buildUserContent(session, script) }]);
            const content = parseReply(ai.reply);
            return await saveReportField(sessionId, {
                status: 'ready',
                requested_at: requestedAt,
                generated_at: new Date().toISOString(),
                content
            });
        } catch (err) {
            console.error('Falha ao gerar relatório do aluno:', err);
            try {
                return await saveReportField(sessionId, {
                    status: 'error',
                    requested_at: requestedAt,
                    error: String(err.message || err).slice(0, 300)
                });
            } catch (e) {
                return session;
            }
        }
    }

    // ---------- PDF ----------

    const CHAR_MAP = {
        '\u2018': "'", '\u2019': "'", '\u201A': "'", '\u201C': '"', '\u201D': '"', '\u201E': '"',
        '\u2013': '-', '\u2014': '-', '\u2026': '...', '\u2022': '-', '\u00A0': ' ',
        '\u2192': '->', '\u2190': '<-', '\u21D2': '=>', '\u2194': '<->', '\u2248': '~', '\u2260': '!=',
        '\u2264': '<=', '\u2265': '>=', '\u221A': 'raiz de ', '\u03C0': 'pi', '\u0394': 'Delta ', '\u2206': 'Delta ',
        '\u03B8': 'teta', '\u03B1': 'alfa', '\u03B2': 'beta', '\u03BB': 'lambda', '\u03BC': 'mi', '\u03C9': 'omega',
        '\u03A9': 'Ohm', '\u03C1': 'rho', '\u03C3': 'sigma', '\u2211': 'somatorio', '\u221E': 'infinito',
        '\u2032': "'", '\u2033': '"', '\u2070': '^0', '\u2074': '^4', '\u2075': '^5', '\u2076': '^6',
        '\u2077': '^7', '\u2078': '^8', '\u2079': '^9', '\u207B': '^-'
    };

    function pdfSafe(text) {
        let t = String(text || '');
        t = t.replace(/[\u2080-\u2089]/g, c => String(c.charCodeAt(0) - 0x2080));
        t = t.replace(/./gsu, c => (CHAR_MAP[c] !== undefined ? CHAR_MAP[c] : c));
        // Mantém apenas Latin-1 (suportado pelas fontes padrão do jsPDF)
        return t.replace(/[^\x09\x0A\x0D\x20-\x7E\xA1-\xFF]/g, '');
    }

    function slug(s) {
        return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase().slice(0, 40);
    }

    function downloadPDF(session, script) {
        if (getState(session) !== 'ready') {
            alert('O relatório ainda não está disponível.');
            return;
        }
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('Biblioteca de PDF não carregada. Verifique sua conexão e recarregue a página.');
            return;
        }
        script = script || {};
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const W = 210, H = 297, M = 16, CW = W - 2 * M;
        const rep = session.student_report.content;

        // Cabeçalho
        doc.setFillColor(79, 70, 229);
        doc.rect(0, 0, W, 24, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.text(pdfSafe('Relatório Individual de Aprendizagem'), M, 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(pdfSafe('Tutor Socrático IA'), M, 18.5);

        const dt = completedAt(session);
        const dateStr = dt ? new Date(dt).toLocaleDateString('pt-BR') : '-';
        const info = [
            ['Aluno', session.student_name || '-'],
            ['RM', session.student_rm || '-'],
            ['Atividade', script.title || session.script_id || '-'],
            ['Disciplina', script.subject || '-'],
            ['Tentativa', String(session.attempt_count || 1)],
            ['Concluída em', dateStr],
            ['Desempenho final', session.final_grade ? `${session.final_grade} / 10` : '-']
        ];
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(9.5);
        let y = 32;
        const colX = [M, M + CW / 2];
        info.forEach((pair, i) => {
            const x = colX[i % 2];
            if (i % 2 === 0 && i > 0) y += 5.5;
            doc.setFont('helvetica', 'bold');
            const label = pdfSafe(pair[0] + ': ');
            doc.text(label, x, y);
            doc.setFont('helvetica', 'normal');
            const valueLines = doc.splitTextToSize(pdfSafe(pair[1]), CW / 2 - doc.getTextWidth(label) - 3);
            doc.text(valueLines[0] || '', x + doc.getTextWidth(label), y);
        });
        y += 4;
        doc.setDrawColor(203, 213, 225);
        doc.line(M, y, W - M, y);

        const sections = [
            { title: '1. O que você acertou', color: [5, 150, 105], text: rep.acertos },
            { title: '2. Onde você demonstrou fragilidade', color: [217, 119, 6], text: rep.fragilidades },
            { title: '3. O que ainda não foi compreendido', color: [220, 38, 38], text: rep.nao_compreendeu },
            { title: '4. Orientações de estudo e anotações no caderno', color: [79, 70, 229], text: rep.orientacoes }
        ];

        const bodyTop = y + 6;
        const bodyBottom = H - M - 10;
        const pt = 0.3528;

        const layout = (fs) => {
            doc.setFontSize(fs);
            const lh = fs * pt * 1.45;
            const titleH = (fs + 1) * pt * 1.5;
            let h = 0;
            const blocks = sections.map(s => {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(fs);
                const lines = doc.splitTextToSize(pdfSafe(s.text || '-'), CW - 5);
                const bh = titleH + lines.length * lh;
                h += bh + 5;
                return { ...s, lines, bh };
            });
            return { blocks, h, lh, titleH };
        };

        let fs = 11;
        let L = layout(fs);
        while (fs > 7.5 && L.h > bodyBottom - bodyTop) {
            fs -= 0.5;
            L = layout(fs);
        }

        y = bodyTop;
        L.blocks.forEach(b => {
            doc.setFillColor(b.color[0], b.color[1], b.color[2]);
            doc.rect(M, y - 3.2, 1.3, b.bh, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(fs + 1);
            doc.setTextColor(b.color[0], b.color[1], b.color[2]);
            doc.text(pdfSafe(b.title), M + 4, y);
            y += L.titleH;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(fs);
            doc.setTextColor(30, 41, 59);
            doc.text(b.lines, M + 4, y);
            y += b.lines.length * L.lh + 5;
        });

        // Rodapé
        doc.setDrawColor(203, 213, 225);
        doc.line(M, H - M - 6, W - M, H - M - 6);
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(pdfSafe('Relatório elaborado por Inteligência Artificial a partir do seu diálogo com o Tutor Socrático. Em caso de dúvidas, converse com seu professor.'), M, H - M - 2, { maxWidth: CW });

        const fname = `relatorio_${slug(session.student_name)}_${slug(script.title || session.script_id)}_t${session.attempt_count || 1}.pdf`;
        doc.save(fname);
    }

    return { getState, generate, downloadPDF, completedAt, STALE_MS };
})();
