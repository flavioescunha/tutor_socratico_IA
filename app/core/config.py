import os
from pydantic_settings import BaseSettings

def get_version():
    try:
        with open("VERSION", "r") as f:
            return f.read().strip()
    except Exception:
        return "1.0.0"

class Settings(BaseSettings):
    PROJECT_NAME: str = "Tutor Socrático IA"
    APP_VERSION: str = get_version()
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./socratic_tutor.db")
    
    # LLM Settings
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "xai")
    LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "https://api.xai.com/v1")
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "grok-2")
    
    # Auth Security (JWT Secrets etc could go here, for now using simple auth)
    SECRET_KEY: str = os.getenv("SECRET_KEY", "super-secret-key-change-me")
    
    # Google Sheets Global Credentials File
    GOOGLE_SHEETS_CREDENTIALS_FILE: str = os.getenv("GOOGLE_SHEETS_CREDENTIALS_FILE", "credentials.json")

    class Config:
        env_file = ".env"

settings = Settings()
