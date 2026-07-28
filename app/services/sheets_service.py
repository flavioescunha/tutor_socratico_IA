import requests
import logging

logger = logging.getLogger(__name__)

def append_session_to_sheet(sheet_url: str, row_data: list):
    """
    Faz um POST na URL do Web App (Google Apps Script) enviando os dados da sessão.
    O professor deve ter colado o script lá e publicado como Web App para Qualquer Pessoa.
    """
    if not sheet_url or not sheet_url.startswith("https://script.google.com/"):
        logger.warning("Admin não possui URL do Google Apps Script configurada ou é inválida. Pulando exportação.")
        return False
        
    try:
        rm = row_data[1] if len(row_data) > 1 else ""
        script_title = row_data[6] if len(row_data) > 6 else ""
        
        payload = {
            "action": "update",
            "rm": rm,
            "script_title": script_title,
            "row": row_data
        }
        # Follow redirects is true by default in requests, which is needed for Apps Script
        response = requests.post(sheet_url, json=payload, timeout=15)
        
        if response.status_code == 200:
            logger.info("Dados exportados com sucesso para o Web App do Sheets")
            return True
        else:
            logger.error(f"Erro no Web App do Sheets: Status {response.status_code} - {response.text}")
            return False
    except Exception as e:
        logger.error(f"Erro na requisição para a URL da planilha: {e}")
        return False

def pre_fill_students_in_sheet(sheet_url: str, students: list, script_title: str, subject: str):
    """
    Envia uma lista de alunos para pré-preenchimento no Google Sheets.
    """
    if not sheet_url or not sheet_url.startswith("https://script.google.com/"):
        return False
        
    try:
        rows = []
        for student in students:
            row = ["", student.rm, student.name, student.class_number, student.grade_level, subject, script_title]
            rows.append(row)
            
        payload = {
            "action": "pre_fill",
            "rows": rows
        }
        response = requests.post(sheet_url, json=payload, timeout=15)
        
        if response.status_code == 200:
            logger.info("Alunos pré-preenchidos com sucesso no Web App do Sheets")
            return True
        else:
            logger.error(f"Erro no pre-fill do Sheets: Status {response.status_code} - {response.text}")
            return False
    except Exception as e:
        logger.error(f"Erro na requisição pre-fill: {e}")
        return False

def fetch_students_from_sheet(sheet_url: str):
    """
    Faz um GET na URL do Web App para buscar a lista de alunos da aba 'Alunos'.
    Retorna uma lista de dicionários [{"rm": "...", "nome": "...", "numero": "..."}] ou lista vazia em caso de erro.
    """
    if not sheet_url or not sheet_url.startswith("https://script.google.com/"):
        return []
        
    try:
        response = requests.get(sheet_url, timeout=15)
        if response.status_code == 200:
            data = response.json()
            if "students" in data:
                return data["students"]
            else:
                logger.error(f"Aba 'Alunos' não encontrada ou erro no script: {data}")
                return []
        else:
            logger.error(f"Erro ao buscar alunos no Web App: Status {response.status_code} - {response.text}")
            return []
    except Exception as e:
        logger.error(f"Erro na requisição de busca de alunos: {e}")
        return []

def format_session_data_for_sheet(session_data: dict, progress_data: list) -> list:
    """
    Transforma os dados de uma sessão finalizada em uma lista plana para o Sheets.
    Estrutura: [Data/Hora, RM, Nome, Número, Série, Disciplina, Nome da Atividade, Aproveitamento %, Nota, Status I1, Status I2..., Total Tentativas]
    """
    row = [
        session_data.get('end_time', ''),
        session_data.get('student_rm', ''),
        session_data.get('student_name', ''),
        session_data.get('student_class_number', ''),
        session_data.get('student_grade', ''),
        session_data.get('script_subject', ''),
        session_data.get('script_title', ''),
        f"{session_data.get('final_grade_percent', 0):.2f}%",
        f"{session_data.get('final_grade_10', 0):.2f}"
    ]
    
    total_attempts = 0
    # Adiciona o status, nota e justificativa de cada item
    for item in progress_data:
        status = "Aprovado" if item['score_earned'] > 0 else "Falha Definitiva"
        
        grade = item.get('grade', 0.0)
        if grade is None: grade = 0.0
        
        justificativa = item.get('grade_justification', '')
        if justificativa is None: justificativa = ''
        
        # Colunas adicionadas: Status/Tentativas, Nota, Justificativa
        row.append(f"{status} ({item['attempts_used']} tentativas)")
        row.append(f"{grade:.1f}")
        row.append(justificativa)
        
        total_attempts += item['attempts_used']
        
    row.append(total_attempts)
    return row
