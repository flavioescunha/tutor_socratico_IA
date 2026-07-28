import hashlib

def get_password_hash(password: str) -> str:
    # Usando sha256 para simplificar no SQLite, mas o ideal seria passlib com bcrypt
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return get_password_hash(plain_password) == hashed_password
