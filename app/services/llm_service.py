import json
import logging
from pydantic import BaseModel, Field, field_validator
from openai import OpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)

class SocraticResponse(BaseModel):
    analise_raciocinio_aluno: str = Field(description="Avaliação interna oculta sobre o que o aluno escreveu")
    status_item: str = Field(description="Deve ser exatamente um destes: 'aprovado', 'refazer' ou 'falha_definitiva'")
    nota_etapa: int | None = Field(default=None, description="Nota de 0 a 10 avaliando as respostas do aluno (apenas preencher se status_item for 'aprovado' ou 'falha_definitiva')")
    justificativa_nota: str | None = Field(default=None, description="Breve justificativa para a nota dada, máx 240 caracteres (apenas preencher se status_item for 'aprovado' ou 'falha_definitiva')")
    resposta_chat: str = Field(description="A mensagem socrática ou de correção que será exibida para o aluno no chat")

    @field_validator('nota_etapa', mode='before')
    @classmethod
    def parse_nota(cls, v):
        if v == "" or v == "null" or v is None:
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None

def generate_socratic_response(
    script_context: str, 
    current_item_description: str,
    next_item_description: str | None,
    chat_history: list, 
    is_intervention: bool,
    provider: str,
    model: str,
    api_key: str,
    past_summary: str = ""
) -> SocraticResponse:
    """
    Gera a próxima resposta da IA atuando como tutor socrático.
    """
    
    # Monta o System Prompt base
    system_prompt = f"""Você é um Tutor Socrático especializado em IA. Seu objetivo é ajudar o aluno a aprender guiando-o.
VOCÊ É ESTRITAMENTE PROIBIDO DE DAR A RESPOSTA PRONTA. Faça perguntas para o aluno chegar à conclusão sozinho.
SUA RESPOSTA DEVE SER ESTRITAMENTE UM JSON VÁLIDO no seguinte formato:
{{
    "analise_raciocinio_aluno": "Sua avaliação oculta sobre o que o aluno escreveu (string)",
    "status_item": "deve ser exatamente 'aprovado', 'refazer' ou 'falha_definitiva'",
    "nota_etapa": "Inteiro de 0 a 10. Obrigatório se o status for aprovado ou falha_definitiva, avaliando o quão preciso e completo o aluno foi.",
    "justificativa_nota": "String (máx 240 chars). Obrigatório se o status for aprovado ou falha_definitiva, justificando a nota dada baseando-se nos acertos e erros.",
    "resposta_chat": "A mensagem socrática ou de correção que será exibida para o aluno no chat (string)"
}}

[CONTEXTO DO ROTEIRO ATUAL]
{script_context}

{past_summary}

[OBJETIVO DO ITEM ATUAL - O QUE O ALUNO DEVE APRENDER AGORA]
{current_item_description}
"""
    if next_item_description:
        system_prompt += f"\n[PRÓXIMO OBJETIVO DO ROTEIRO]\n{next_item_description}\n"

    system_prompt += """
[SUAS INSTRUÇÕES]
1. Avalie a última resposta do aluno COM FOCO EXCLUSIVO no [OBJETIVO DO ITEM ATUAL].
2. Se o aluno compreendeu satisfatoriamente o conceito pedido no objetivo, VOCÊ DEVE OBRIGATORIAMENTE definir o status_item como 'aprovado' e preencher a 'nota_etapa' (0 a 10) e 'justificativa_nota'. Na sua resposta_chat, faça um elogio confirmando o acerto E JÁ FAÇA UMA NOVA PERGUNTA socrática introduzindo o [PRÓXIMO OBJETIVO DO ROTEIRO] (sem entregar a resposta do próximo objetivo!).
   CRITÉRIOS RIGOROSOS PARA NOTA: Seja um avaliador crítico. Dar nota 10 exige uma resposta excepcional, completa, coerente e bem redigida. Desconte nota severamente se o aluno usou apenas "palavras secas", respostas preguiçosas, frases sem coesão ou se precisou de várias dicas suas para chegar à conclusão correta. Explique a perda de pontos na justificativa.
3. Se o aluno errou, foi superficial, ou ainda não atingiu o objetivo atual por completo, defina status_item como 'refazer' e faça uma (e apenas UMA) pergunta socrática para guiá-lo em direção ao [OBJETIVO DO ITEM ATUAL]. Deixe nota_etapa e justificativa_nota vazios.
"""
    if not next_item_description:
        system_prompt = system_prompt.replace(
            "Na sua resposta_chat, faça um elogio confirmando o acerto E JÁ FAÇA UMA NOVA PERGUNTA socrática introduzindo o [PRÓXIMO OBJETIVO DO ROTEIRO] (sem entregar a resposta do próximo objetivo!).",
            "Na sua resposta_chat, faça apenas um elogio rápido confirmando o acerto e informe que ele concluiu o roteiro."
        )

    if is_intervention:
        system_prompt += """
[ATENÇÃO: MODO DE INTERVENÇÃO PEDAGÓGICA ATIVADO]
O aluno esgotou suas tentativas para este item.
1. Demonstre claramente por que o raciocínio dele está incorreto.
2. Formule a resposta correta aproveitando os acertos parciais que ele já disse.
3. Construa a explicação de forma didática.
4. Defina o status_item como 'falha_definitiva' para que o sistema avance para o próximo item (sua resposta_chat encerrará a discussão deste item e logo apresentará a resolução).
5. Defina a 'nota_etapa' de 0 a 10 baseada nos acertos parciais (geralmente baixa, pois ele não concluiu sozinho) e preencha a 'justificativa_nota'.
"""

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(chat_history)

    try:
        if provider.lower() == "gemini":
            import requests
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            
            # Converter formato de mensagens
            gemini_contents = []
            for msg in chat_history:
                role = "user" if msg["role"] == "user" else "model"
                gemini_contents.append({
                    "role": role,
                    "parts": [{"text": msg["content"]}]
                })
                
            payload = {
                "systemInstruction": {
                    "parts": [{"text": system_prompt}]
                },
                "contents": gemini_contents,
                "generationConfig": {
                    "temperature": 0.2,
                    "responseMimeType": "application/json"
                }
            }
            
            resp = requests.post(url, json=payload)
            if resp.status_code != 200:
                raise Exception(f"Erro Gemini API: HTTP {resp.status_code} - {resp.text}")
                
            resp_data = resp.json()
            content = resp_data["candidates"][0]["content"]["parts"][0]["text"]
            data = json.loads(content)
            return SocraticResponse(**data)
            
        else:
            # Para xAI, OpenAI e Groq, usamos a biblioteca padrão OpenAI
            api_base = None
            if provider.lower() == "xai":
                api_base = "https://api.xai.com/v1"
            elif provider.lower() == "groq":
                api_base = "https://api.groq.com/openai/v1"
            elif provider.lower() == "openai":
                api_base = None
                
            client = OpenAI(
                api_key=api_key,
                base_url=api_base
            )
            
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=0.2
            )
            
            content = response.choices[0].message.content
            data = json.loads(content)
            return SocraticResponse(**data)
            
    except Exception as e:
        logger.error(f"Erro ao chamar LLM: {str(e)}")
        # Fallback seguro mostrando o erro para debug
        return SocraticResponse(
            analise_raciocinio_aluno="Erro de conexão com IA.",
            status_item="refazer",
            nota_etapa=None,
            justificativa_nota=None,
            resposta_chat=f"Oops! Ocorreu um erro técnico: {str(e)}"
        )
