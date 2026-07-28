from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from app.db.database import engine, Base
from app.api import endpoints
import os

# Cria as tabelas no banco de dados (idealmente usar Alembic em produção)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Tutor Socrático IA")

# Montando diretório estático
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Incluindo rotas da API
app.include_router(endpoints.router)
