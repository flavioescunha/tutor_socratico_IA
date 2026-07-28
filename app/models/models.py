from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float, Text, JSON, Table
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.database import Base

script_students = Table(
    "script_students",
    Base.metadata,
    Column("script_id", Integer, ForeignKey("scripts.id"), primary_key=True),
    Column("student_id", Integer, ForeignKey("students.id"), primary_key=True)
)

class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    google_sheet_id = Column(String, nullable=True) # Preenchido no primeiro login (onboarding)
    sheet_url = Column(String, nullable=True) # Atalho direto para a planilha
    
    # Configurações de IA individualizadas
    llm_provider = Column(String, nullable=True) # Ex: "gemini", "xai", "openai"
    llm_model = Column(String, nullable=True)    # Ex: "gemini-1.5-flash"
    llm_api_key = Column(String, nullable=True)  # Chave privada do professor

    scripts = relationship("Script", back_populates="admin")

class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    rm = Column(String, unique=True, index=True)
    name = Column(String)
    grade_level = Column(String) # Série
    class_number = Column(Integer) # Número de chamada

    sessions = relationship("Session", back_populates="student")
    scripts = relationship("Script", secondary=script_students, back_populates="students")

class Script(Base):
    __tablename__ = "scripts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    subject = Column(String)
    target_audience = Column(String, nullable=True) # Ex: 2º ano do Ensino Médio
    attempts_limit = Column(Integer, default=3)
    admin_id = Column(Integer, ForeignKey("admins.id"))

    admin = relationship("Admin", back_populates="scripts")
    items = relationship("ScriptItem", back_populates="script", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="script")
    students = relationship("Student", secondary=script_students, back_populates="scripts")

class ScriptItem(Base):
    __tablename__ = "script_items"

    id = Column(Integer, primary_key=True, index=True)
    script_id = Column(Integer, ForeignKey("scripts.id"))
    sequence_order = Column(Integer)
    description = Column(Text) # Conceito a ser demonstrado pelo aluno

    script = relationship("Script", back_populates="items")
    progress = relationship("SessionProgress", back_populates="script_item")

class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    script_id = Column(Integer, ForeignKey("scripts.id"))
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    status = Column(String, default="active") # active, completed
    final_grade = Column(Float, nullable=True) # 0 a 100
    
    student = relationship("Student", back_populates="sessions")
    script = relationship("Script", back_populates="sessions")
    progress = relationship("SessionProgress", back_populates="session", cascade="all, delete-orphan")

class SessionProgress(Base):
    __tablename__ = "session_progress"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    script_item_id = Column(Integer, ForeignKey("script_items.id"))
    attempts_used = Column(Integer, default=0)
    is_completed = Column(Boolean, default=False)
    score_earned = Column(Float, default=0.0)
    grade = Column(Float, nullable=True) # Nota qualitativa dada pela IA
    grade_justification = Column(String, nullable=True) # Justificativa da IA
    chat_history = Column(JSON, default=list) # Armazena [{role: user/assistant, content: string}]
    
    session = relationship("Session", back_populates="progress")
    script_item = relationship("ScriptItem", back_populates="progress")
