import os
import requests
from database import SessionLocal
import models

db = SessionLocal()
config = db.query(models.Config).filter(models.Config.key == "llm_api_key").first()
api_key = config.value if config else None

if not api_key:
    print("No API key found in DB.")
else:
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
    resp = requests.get(url)
    print(resp.json())
