from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# --- ADMIN SCHEMAS ---
class AdminBase(BaseModel):
    username: str

class AdminCreate(AdminBase):
    password: str

class AdminUpdateSheet(BaseModel):
    google_sheet_id: str

class AdminOut(AdminBase):
    id: int
    google_sheet_id: Optional[str] = None
    class Config:
        from_attributes = True

# --- SCRIPT ITEMS SCHEMAS ---
class ScriptItemBase(BaseModel):
    sequence_order: int
    description: str

class ScriptItemCreate(ScriptItemBase):
    pass

class ScriptItemOut(ScriptItemBase):
    id: int
    script_id: int
    class Config:
        from_attributes = True

# --- SCRIPT SCHEMAS ---
class ScriptBase(BaseModel):
    title: str
    subject: str
    attempts_limit: int = 3

class ScriptCreate(ScriptBase):
    items: List[ScriptItemCreate]

class ScriptOut(ScriptBase):
    id: int
    admin_id: int
    items: List[ScriptItemOut] = []
    class Config:
        from_attributes = True

# --- STUDENT SCHEMAS ---
class StudentBase(BaseModel):
    rm: str
    name: str
    grade_level: str
    class_number: int

class StudentCreate(StudentBase):
    pass

class StudentOut(StudentBase):
    id: int
    class Config:
        from_attributes = True

# --- CHAT SCHEMAS ---
class ChatMessage(BaseModel):
    content: str

class ChatResponse(BaseModel):
    reply: str
    status: str # "active", "completed"
    item_progress: str # ex: "2/5"
    final_grade: Optional[float] = None
