import os
from fastapi import APIRouter, Depends, HTTPException, status, Request, Form
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.db.database import get_db
from app.models import models
from app.schemas import schemas
from app.core.config import settings
from app.core.security import verify_password, get_password_hash
from app.services.llm_service import generate_socratic_response
from app.services.sheets_service import append_session_to_sheet, format_session_data_for_sheet, fetch_students_from_sheet, pre_fill_students_in_sheet

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

# --- DEPENDÊNCIAS DE AUTENTICAÇÃO SIMPLES (Baseado em Sessão/Cookies para Protótipo) ---
def get_current_admin(request: Request, db: Session = Depends(get_db)):
    admin_id = request.cookies.get("admin_id")
    if not admin_id:
        return None
    return db.query(models.Admin).filter(models.Admin.id == admin_id).first()

def get_current_student(request: Request, db: Session = Depends(get_db)):
    student_id = request.cookies.get("student_id")
    if not student_id:
        return None
    return db.query(models.Student).filter(models.Student.id == student_id).first()

# ==========================================
# ROTAS FRONTEND / HTML
# ==========================================

@router.get("/", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse(request=request, name="login.html", context={"request": request})

@router.get("/admin/login", response_class=HTMLResponse)
async def admin_login_page(request: Request, db: Session = Depends(get_db)):
    if db.query(models.Admin).count() == 0:
        return RedirectResponse(url="/admin/setup", status_code=status.HTTP_302_FOUND)
    return templates.TemplateResponse(request=request, name="admin_login.html", context={"request": request})

@router.get("/admin/setup", response_class=HTMLResponse)
async def admin_setup_page(request: Request, db: Session = Depends(get_db)):
    if db.query(models.Admin).count() > 0:
        return RedirectResponse(url="/admin/login", status_code=status.HTTP_302_FOUND)
    return templates.TemplateResponse(request=request, name="admin_setup.html", context={"request": request})

@router.get("/admin/dashboard", response_class=HTMLResponse)
async def admin_dashboard(request: Request, admin: models.Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    if not admin:
        return RedirectResponse(url="/admin/login", status_code=status.HTTP_302_FOUND)
    
    if not admin.google_sheet_id:
        return RedirectResponse(url="/admin/onboarding", status_code=status.HTTP_302_FOUND)
        
    total_students = db.query(models.Student)\
        .join(models.Student.scripts)\
        .filter(models.Script.admin_id == admin.id)\
        .distinct()\
        .count()

    return templates.TemplateResponse(request=request, name="admin.html", context={"request": request, "admin": admin, "app_version": settings.APP_VERSION, "total_students": total_students})

@router.get("/admin/onboarding", response_class=HTMLResponse)
async def admin_onboarding(request: Request, admin: models.Admin = Depends(get_current_admin)):
    if not admin:
        return RedirectResponse(url="/admin/login", status_code=status.HTTP_302_FOUND)
    return templates.TemplateResponse(request=request, name="admin_onboarding.html", context={"request": request})

@router.get("/admin/settings", response_class=HTMLResponse)
async def admin_settings(request: Request, admin: models.Admin = Depends(get_current_admin)):
    if not admin:
        return RedirectResponse(url="/admin/login", status_code=status.HTTP_302_FOUND)
    # Pega mensagem de sucesso da querystring
    success_msg = request.query_params.get("success")
    msg_text = "Configurações salvas com sucesso!" if success_msg else None
    return templates.TemplateResponse(request=request, name="admin_settings.html", context={"request": request, "admin": admin, "success_msg": msg_text})

@router.get("/admin/register_teacher", response_class=HTMLResponse)
async def admin_register_teacher(request: Request, admin: models.Admin = Depends(get_current_admin)):
    if not admin:
        return RedirectResponse(url="/admin/login", status_code=status.HTTP_302_FOUND)
    error_msg = request.query_params.get("error")
    return templates.TemplateResponse(request=request, name="admin_register.html", context={"request": request, "admin": admin, "error_msg": error_msg})

@router.get("/admin/scripts/new", response_class=HTMLResponse)
async def admin_new_script(request: Request, admin: models.Admin = Depends(get_current_admin)):
    if not admin:
        return RedirectResponse(url="/admin/login", status_code=status.HTTP_302_FOUND)
    return templates.TemplateResponse(request=request, name="admin_script_form.html", context={"request": request, "admin": admin})

@router.get("/admin/scripts/{script_id}/edit", response_class=HTMLResponse)
async def admin_edit_script(script_id: int, request: Request, admin: models.Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    if not admin:
        return RedirectResponse(url="/admin/login", status_code=status.HTTP_302_FOUND)
        
    script = db.query(models.Script).filter(models.Script.id == script_id, models.Script.admin_id == admin.id).first()
    if not script:
        return RedirectResponse(url="/admin/dashboard", status_code=status.HTTP_302_FOUND)
        
    return templates.TemplateResponse(request=request, name="admin_script_edit.html", context={"request": request, "admin": admin, "script": script})

@router.get("/admin/scripts/{script_id}/students", response_class=HTMLResponse)
async def admin_script_students(script_id: int, request: Request, admin: models.Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    if not admin:
        return RedirectResponse(url="/admin/login", status_code=status.HTTP_302_FOUND)
        
    script = db.query(models.Script).filter(models.Script.id == script_id, models.Script.admin_id == admin.id).first()
    if not script:
        return RedirectResponse(url="/admin/dashboard", status_code=status.HTTP_302_FOUND)
        
    # Construindo o link para o aluno
    base_url = str(request.base_url).rstrip("/")
    student_link = f"{base_url}/roteiro/{script.id}"
        
    return templates.TemplateResponse(request=request, name="admin_script_students.html", context={"request": request, "admin": admin, "script": script, "student_link": student_link})

@router.get("/chat/{script_id}", response_class=HTMLResponse)
async def chat_page(script_id: int, request: Request, student: models.Student = Depends(get_current_student), db: Session = Depends(get_db)):
    if not student:
        return RedirectResponse(url="/", status_code=status.HTTP_302_FOUND)
    
    script = db.query(models.Script).filter(models.Script.id == script_id).first()
    if not script:
        return HTMLResponse("Roteiro não encontrado.")
        
    session = db.query(models.Session).filter(models.Session.student_id == student.id, models.Session.script_id == script.id).first()
    
    # Criar a sessão se não existir e inicializar o histórico com a saudação
    if not session:
        session = models.Session(student_id=student.id, script_id=script.id)
        db.add(session)
        db.commit()
        db.refresh(session)
        
        items = db.query(models.ScriptItem).filter(models.ScriptItem.script_id == script.id).order_by(models.ScriptItem.sequence_order).all()
        for i, item in enumerate(items):
            sp = models.SessionProgress(session_id=session.id, script_item_id=item.id)
            if i == 0:
                sp.chat_history = [{
                    "role": "assistant",
                    "content": f"Olá, {student.name}! Vamos começar o roteiro **{script.title}**. Estou aqui para te ajudar a aprender. O que você sabe sobre o primeiro assunto?"
                }]
            db.add(sp)
        db.commit()
        
    current_progress = db.query(models.SessionProgress)\
        .filter(models.SessionProgress.session_id == session.id, models.SessionProgress.is_completed == False)\
        .order_by(models.SessionProgress.id).first()
        
    chat_history = current_progress.chat_history if current_progress and current_progress.chat_history else []
        
    return templates.TemplateResponse(request=request, name="chat.html", context={"request": request, "student": student, "script": script, "chat_history": chat_history})

@router.get("/roteiro/{script_id}", response_class=HTMLResponse)
async def student_script_login_page(script_id: int, request: Request, db: Session = Depends(get_db)):
    script = db.query(models.Script).filter(models.Script.id == script_id).first()
    if not script:
        return HTMLResponse("Roteiro não encontrado.")
        
    error_msg = request.query_params.get("error")
    return templates.TemplateResponse(request=request, name="student_script_login.html", context={"request": request, "script": script, "error_msg": error_msg})

# ==========================================
# API ENDPOINTS (Ações do Frontend)
# ==========================================

@router.post("/api/admin/login")
async def api_admin_login(username: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    admin = db.query(models.Admin).filter(models.Admin.username == username).first()
    if not admin or not verify_password(password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    
    response = RedirectResponse(url="/admin/dashboard", status_code=status.HTTP_302_FOUND)
    response.set_cookie(key="admin_id", value=str(admin.id), httponly=True)
    return response

@router.post("/api/admin/onboarding")
async def api_admin_onboarding(
    google_sheet_id: str = Form(...),
    sheet_url: str = Form(""),
    llm_provider: str = Form(...),
    llm_model: str = Form(...),
    llm_api_key: str = Form(...),
    admin: models.Admin = Depends(get_current_admin), 
    db: Session = Depends(get_db)
):
    if not admin:
        return RedirectResponse(url="/admin/login", status_code=status.HTTP_302_FOUND)
    
    admin.google_sheet_id = google_sheet_id
    admin.sheet_url = sheet_url
    admin.llm_provider = llm_provider
    admin.llm_model = llm_model
    admin.llm_api_key = llm_api_key
    
    db.commit()
    return RedirectResponse(url="/admin/dashboard", status_code=status.HTTP_302_FOUND)

@router.post("/api/admin/settings")
async def api_admin_settings(
    username: str = Form(...),
    password: str = Form(None),
    google_sheet_id: str = Form(...),
    sheet_url: str = Form(""),
    llm_provider: str = Form(...),
    llm_model: str = Form(...),
    llm_api_key: str = Form(...),
    admin: models.Admin = Depends(get_current_admin), 
    db: Session = Depends(get_db)
):
    if not admin:
        return RedirectResponse(url="/admin/login", status_code=status.HTTP_302_FOUND)
    
    admin.username = username
    if password and password.strip():
        admin.password_hash = get_password_hash(password)
        
    admin.google_sheet_id = google_sheet_id
    admin.sheet_url = sheet_url
    admin.llm_provider = llm_provider
    admin.llm_model = llm_model
    admin.llm_api_key = llm_api_key
    
    db.commit()
    return RedirectResponse(url="/admin/settings?success=1", status_code=status.HTTP_302_FOUND)

@router.post("/api/admin/register")
async def api_admin_register(
    username: str = Form(...), 
    password: str = Form(...), 
    admin: models.Admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    admin_count = db.query(models.Admin).count()
    if admin_count > 0 and not admin:
        raise HTTPException(status_code=401, detail="Apenas professores logados podem adicionar novos professores.")
        
    if db.query(models.Admin).filter(models.Admin.username == username).first():
        if admin_count == 0:
            raise HTTPException(status_code=400, detail="Admin já existe")
        return RedirectResponse(url="/admin/register_teacher?error=Usuário já existe. Escolha outro nome.", status_code=status.HTTP_302_FOUND)
    
    new_admin = models.Admin(
        username=username,
        password_hash=get_password_hash(password)
    )
    db.add(new_admin)
    db.commit()
    
    # Se estava via dashboard, volta pra lá. Senão (script), retorna json
    if admin:
        return RedirectResponse(url="/admin/dashboard", status_code=status.HTTP_302_FOUND)
    return RedirectResponse(url="/admin/login", status_code=status.HTTP_302_FOUND)

@router.post("/api/admin/scripts")
async def api_admin_create_script(
    request: Request,
    title: str = Form(...),
    subject: str = Form(...),
    target_audience: str = Form(None),
    attempts_limit: int = Form(...),
    admin: models.Admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    if not admin:
        return RedirectResponse(url="/admin/login", status_code=status.HTTP_302_FOUND)
        
    form_data = await request.form()
    items = form_data.getlist("items")
    
    new_script = models.Script(
        title=title,
        subject=subject,
        target_audience=target_audience,
        attempts_limit=attempts_limit,
        admin_id=admin.id
    )
    db.add(new_script)
    db.commit()
    db.refresh(new_script)
    
    for i, desc in enumerate(items):
        if desc.strip():
            item = models.ScriptItem(
                script_id=new_script.id,
                sequence_order=i+1,
                description=desc.strip()
            )
            db.add(item)
            
    db.commit()
    return RedirectResponse(url="/admin/dashboard", status_code=status.HTTP_302_FOUND)

@router.post("/api/admin/scripts/{script_id}/edit")
async def api_admin_update_script(
    script_id: int,
    request: Request,
    title: str = Form(...),
    subject: str = Form(...),
    target_audience: str = Form(None),
    attempts_limit: int = Form(...),
    admin: models.Admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    if not admin:
        raise HTTPException(status_code=401, detail="Não autorizado")
        
    script = db.query(models.Script).filter(models.Script.id == script_id, models.Script.admin_id == admin.id).first()
    if not script:
        return RedirectResponse(url="/admin/dashboard", status_code=status.HTTP_302_FOUND)
        
    form_data = await request.form()
    items = form_data.getlist("items")
    
    script.title = title
    script.subject = subject
    script.target_audience = target_audience
    script.attempts_limit = attempts_limit
    
    db.query(models.ScriptItem).filter(models.ScriptItem.script_id == script.id).delete()
    
    for i, desc in enumerate(items):
        if desc.strip():
            item = models.ScriptItem(
                script_id=script.id,
                sequence_order=i+1,
                description=desc.strip()
            )
            db.add(item)
            
    db.commit()
    return RedirectResponse(url="/admin/dashboard", status_code=status.HTTP_302_FOUND)

@router.post("/api/admin/scripts/{script_id}/delete")
async def api_admin_delete_script(
    script_id: int,
    admin: models.Admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    if not admin:
        raise HTTPException(status_code=401, detail="Não autorizado")
        
    script = db.query(models.Script).filter(models.Script.id == script_id, models.Script.admin_id == admin.id).first()
    if script:
        db.delete(script)
        db.commit()
        
    return RedirectResponse(url="/admin/dashboard", status_code=status.HTTP_302_FOUND)

@router.post("/api/admin/scripts/{script_id}/students")
async def api_admin_import_students(
    script_id: int,
    request: Request,
    students_data: str = Form(...),
    admin: models.Admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    if not admin:
        raise HTTPException(status_code=401, detail="Não autorizado")
        
    script = db.query(models.Script).filter(models.Script.id == script_id, models.Script.admin_id == admin.id).first()
    if not script:
        return RedirectResponse(url="/admin/dashboard", status_code=status.HTTP_302_FOUND)
    
    # Processa os dados colados do Excel (separados por tabulação ou vírgula)
    lines = students_data.strip().split('\n')
    for line in lines:
        if not line.strip(): continue
        
        parts = [p.strip() for p in line.split('\t')]
        if len(parts) < 4:
            parts = [p.strip() for p in line.split(',')]
            
        if len(parts) >= 4:
            nome = parts[0]
            turma = parts[1]
            try:
                numero = int(parts[2])
            except:
                numero = 0
            rm = parts[3]
            
            student = db.query(models.Student).filter(models.Student.rm == rm).first()
            if not student:
                student = models.Student(name=nome, grade_level=turma, class_number=numero, rm=rm)
                db.add(student)
                db.commit()
                db.refresh(student)
            else:
                student.name = nome
                student.grade_level = turma
                student.class_number = numero
                db.commit()
                
            if student not in script.students:
                script.students.append(student)
                
    db.commit()
    
    # Após importar para o SQLite, pré-preenche as linhas no Google Sheets!
    if admin.google_sheet_id:
        pre_fill_students_in_sheet(admin.google_sheet_id, script.students, script.title, script.subject)
        
    return RedirectResponse(url=f"/admin/scripts/{script.id}/students", status_code=status.HTTP_302_FOUND)

@router.post("/api/admin/scripts/{script_id}/students/{student_id}/remove")
async def api_admin_remove_student_from_script(
    script_id: int,
    student_id: int,
    admin: models.Admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    if not admin:
        raise HTTPException(status_code=401, detail="Não autorizado")
        
    script = db.query(models.Script).filter(models.Script.id == script_id, models.Script.admin_id == admin.id).first()
    if script:
        student = db.query(models.Student).filter(models.Student.id == student_id).first()
        if student in script.students:
            script.students.remove(student)
            db.commit()
            
    return RedirectResponse(url=f"/admin/scripts/{script_id}/students", status_code=status.HTTP_302_FOUND)

@router.post("/api/roteiro/{script_id}/login")
async def api_student_script_login(
    script_id: int, 
    nome: str = Form(...),
    numero: str = Form(...),
    rm: str = Form(...),
    db: Session = Depends(get_db)
):
    script = db.query(models.Script).filter(models.Script.id == script_id).first()
    if not script:
        raise HTTPException(status_code=404, detail="Roteiro não encontrado")
        
    admin = script.admin
    if not admin or not admin.google_sheet_id:
        return RedirectResponse(url=f"/roteiro/{script_id}?error=Professor ainda não configurou a integração com a base de alunos.", status_code=status.HTTP_302_FOUND)
        
    # Busca alunos diretamente da planilha via GET no Webhook
    students_from_sheet = fetch_students_from_sheet(admin.google_sheet_id)
    if not students_from_sheet:
        return RedirectResponse(url=f"/roteiro/{script_id}?error=Não foi possível acessar a planilha do professor.", status_code=status.HTTP_302_FOUND)
        
    # Verifica se o RM existe na planilha E está cadastrado nesta atividade
    student_record = next((s for s in students_from_sheet if s["rm"] == rm.strip() and s["script_title"] == script.title), None)
    
    if not student_record:
        return RedirectResponse(url=f"/roteiro/{script_id}?error=Acesso negado. Você não está cadastrado na atividade '{script.title}'.", status_code=status.HTTP_302_FOUND)
        
    if student_record["numero"] != numero.strip():
        return RedirectResponse(url=f"/roteiro/{script_id}?error=Número da chamada incorreto de acordo com a planilha.", status_code=status.HTTP_302_FOUND)
        
    # Aluno validado na planilha! Agora atualizamos nosso banco local (cache)
    student = db.query(models.Student).filter(models.Student.rm == rm).first()
    if not student:
        student = models.Student(rm=rm.strip(), name=student_record["nome"], grade_level="N/A", class_number=int(numero.strip()) if numero.strip().isdigit() else 0)
        db.add(student)
        db.commit()
        db.refresh(student)
    else:
        # Atualiza dados caso o professor tenha mudado na planilha
        if student.name != student_record["nome"] or str(student.class_number) != numero.strip():
            student.name = student_record["nome"]
            student.class_number = int(numero.strip()) if numero.strip().isdigit() else 0
            db.commit()
            
    # Vincula o aluno ao script caso ainda não esteja (para aparecer na contagem de Alunos Ativos do admin)
    if student not in script.students:
        script.students.append(student)
        db.commit()
        
    response = RedirectResponse(url=f"/chat/{script_id}", status_code=status.HTTP_302_FOUND)
    response.set_cookie(key="student_id", value=str(student.id), httponly=True)
    return response

# --- CHAT / MÁQUINA DE ESTADOS ---

@router.post("/api/chat/{script_id}", response_model=schemas.ChatResponse)
async def api_chat_message(
    script_id: int, 
    msg: schemas.ChatMessage, 
    student: models.Student = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    if not student:
        raise HTTPException(status_code=401, detail="Não autorizado")
        
    script = db.query(models.Script).filter(models.Script.id == script_id).first()
    if not script:
        raise HTTPException(status_code=404, detail="Roteiro não encontrado")
        
    # Busca sessão ativa ou cria nova
    session = db.query(models.Session).filter(
        models.Session.student_id == student.id,
        models.Session.script_id == script.id,
        models.Session.status == "active"
    ).first()
    
    if not session:
        session = models.Session(student_id=student.id, script_id=script.id)
        db.add(session)
        db.commit()
        db.refresh(session)
        
        # Cria progresso vazio para todos os itens do roteiro
        items = db.query(models.ScriptItem).filter(models.ScriptItem.script_id == script.id).order_by(models.ScriptItem.sequence_order).all()
        for item in items:
            sp = models.SessionProgress(session_id=session.id, script_item_id=item.id)
            db.add(sp)
        db.commit()

    # Encontra qual o item atual que o aluno precisa responder (primeiro não completo)
    progress_list = db.query(models.SessionProgress).join(models.ScriptItem).filter(
        models.SessionProgress.session_id == session.id
    ).order_by(models.ScriptItem.sequence_order).all()
    
    current_progress = next((p for p in progress_list if not p.is_completed), None)
    
    if not current_progress:
        return schemas.ChatResponse(
            reply="Você já concluiu este roteiro!",
            status="completed",
            item_progress=f"{len(progress_list)}/{len(progress_list)}",
            final_grade=session.final_grade
        )
        
    # Adiciona a msg do aluno no histórico deste item
    history = current_progress.chat_history
    if not history:
        history = []
    
    # Precisamos criar uma cópia da lista e então fazer append, depois reatribuir
    # por conta de como o JSON type do SQLAlchemy rastreia mutações
    new_history = list(history)
    new_history.append({"role": "user", "content": msg.content})
    
    # Verifica limite de tentativas
    current_item = current_progress.script_item
    is_intervention = current_progress.attempts_used >= script.attempts_limit
    
    # Construir histórico das etapas anteriores
    completed_progresses = db.query(models.SessionProgress)\
        .filter(models.SessionProgress.session_id == session.id, models.SessionProgress.id < current_progress.id)\
        .order_by(models.SessionProgress.id).all()
        
    past_summary = ""
    if completed_progresses:
        past_summary = "[HISTÓRICO DE ETAPAS ANTERIORES CONCLUÍDAS NESTE ROTEIRO]\n"
        for cp in completed_progresses:
            item_obj = db.query(models.ScriptItem).filter(models.ScriptItem.id == cp.script_item_id).first()
            if item_obj:
                past_summary += f"- Sobre o objetivo '{item_obj.description}':\n"
                if cp.chat_history:
                    for past_msg in cp.chat_history:
                        role = "Tutor" if past_msg["role"] == "assistant" else "Aluno"
                        past_summary += f"  {role}: {past_msg['content']}\n"
                past_summary += "\n"

    # Preparar variáveis de configuração do LLM
    admin_provider = session.script.admin.llm_provider if session.script.admin.llm_provider else "gemini"
    admin_model = session.script.admin.llm_model if session.script.admin.llm_model else "gemini-1.5-flash"
    admin_key = session.script.admin.llm_api_key if session.script.admin.llm_api_key else settings.LLM_API_KEY
    
    script_context = f"Disciplina: {session.script.subject}\nTópico: {session.script.title}"
    if session.script.target_audience:
        script_context += f"\nPúblico-alvo / Nível: {session.script.target_audience}"

    current_idx = progress_list.index(current_progress)
    next_item_description = None
    if current_idx + 1 < len(progress_list):
        next_item_description = progress_list[current_idx + 1].script_item.description

    llm_resp = generate_socratic_response(
        script_context=script_context,
        current_item_description=current_item.description,
        next_item_description=next_item_description,
        chat_history=new_history,
        is_intervention=is_intervention,
        provider=admin_provider,
        model=admin_model,
        api_key=admin_key,
        past_summary=past_summary
    )
    
    # Atualiza histórico com a resposta do assistente
    new_history.append({"role": "assistant", "content": llm_resp.resposta_chat})
    current_progress.chat_history = new_history
    current_progress.attempts_used += 1
    
    # Trata o Status
    if llm_resp.status_item == "aprovado":
        current_progress.is_completed = True
        current_progress.grade = float(llm_resp.nota_etapa) if llm_resp.nota_etapa is not None else 10.0
        current_progress.grade_justification = llm_resp.justificativa_nota or "Sem justificativa fornecida."
        current_progress.score_earned = current_progress.grade * 10.0 # Legado (0 a 100)
        
    elif llm_resp.status_item == "falha_definitiva" or (llm_resp.status_item == "refazer" and current_progress.attempts_used > script.attempts_limit):
        current_progress.is_completed = True
        current_progress.grade = float(llm_resp.nota_etapa) if getattr(llm_resp, 'nota_etapa', None) is not None else 0.0
        current_progress.grade_justification = getattr(llm_resp, 'justificativa_nota', None) or "Falha definitiva."
        current_progress.score_earned = 0.0
        
    db.commit()
    
    # Verifica se acabou o roteiro todo agora
    updated_progress_list = db.query(models.SessionProgress).filter(models.SessionProgress.session_id == session.id).all()
    completed_count = sum(1 for p in updated_progress_list if p.is_completed)
    
    if completed_count == len(progress_list):
        session.status = "completed"
        session.end_time = datetime.utcnow()
        # Média das notas de 0 a 10, multiplicada por 10 para virar 0 a 100
        soma_notas = sum((p.grade or 0.0) for p in updated_progress_list)
        session.final_grade = (soma_notas / len(progress_list)) * 10.0
        db.commit()
        
        # Exporta para o Sheets
        session_data = {
            "end_time": session.end_time.strftime("%d/%m/%Y %H:%M:%S"),
            "student_rm": student.rm,
            "student_name": student.name,
            "student_class_number": student.class_number,
            "student_grade": student.grade_level,
            "script_title": script.title,
            "script_subject": script.subject,
            "final_grade_percent": session.final_grade,
            "final_grade_10": session.final_grade / 10.0
        }
        
        # Converte para dicionário de progresso
        progress_data = [{
            "attempts_used": p.attempts_used, 
            "score_earned": p.score_earned,
            "grade": p.grade,
            "grade_justification": p.grade_justification
        } for p in updated_progress_list]
        
        # Append asíncrono ou síncrono. Aqui fazemos síncrono.
        if script.admin and script.admin.google_sheet_id:
            row_data = format_session_data_for_sheet(session_data, progress_data)
            append_session_to_sheet(script.admin.google_sheet_id, row_data)
            
        # Monta o boletim final com as justificativas
        boletim = "\n\n📋 **Boletim de Aproveitamento**:\n"
        for idx, p in enumerate(updated_progress_list, start=1):
            grade_val = p.grade if p.grade is not None else 0.0
            justificativa = p.grade_justification or "Sem justificativa."
            boletim += f"\n**Etapa {idx}**: Nota {grade_val:.1f}/10\n> _{justificativa}_\n"
            
        boletim += f"\n🏆 **Nota Final**: {session.final_grade:.0f}/100"
        
        final_msg = f"{llm_resp.resposta_chat}{boletim}"
        
        return schemas.ChatResponse(
            reply=final_msg,
            status="completed",
            item_progress=f"{completed_count}/{len(progress_list)}",
            final_grade=session.final_grade
        )

    reply_text = llm_resp.resposta_chat
    
    # Se concluiu a etapa atual mas ainda há etapas restantes, populamos a história do próximo
    # item com a resposta do LLM que já introduziu o assunto.
    if current_progress.is_completed and completed_count < len(progress_list):
        next_progress = next((p for p in updated_progress_list if not p.is_completed), None)
        if next_progress and not next_progress.chat_history:
            next_progress.chat_history = [{"role": "assistant", "content": llm_resp.resposta_chat}]
            db.commit()

    return schemas.ChatResponse(
        reply=reply_text,
        status="active",
        item_progress=f"{completed_count}/{len(progress_list)}"
    )

