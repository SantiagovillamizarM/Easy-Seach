"""Crea un usuario administrador (o convierte en admin a un usuario existente).

Uso (desde la carpeta backend):
    .\\.venv\\Scripts\\python -m scripts.create_admin --email tu@correo.com --nombre "Tu Nombre"

La contraseña se pide por teclado (no se escribe en el comando ni queda en el historial).
"""
import argparse
import getpass
import sys

from pydantic import ValidationError
from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import User
from app.schemas.user import UserCreate


def main() -> None:
    parser = argparse.ArgumentParser(description="Crea o promueve un administrador")
    parser.add_argument("--email", required=True)
    parser.add_argument("--nombre", required=True)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        email = args.email.strip().lower()
        user = db.scalar(select(User).where(User.email == email))
        if user:
            user.role = "admin"
            db.commit()
            print(f"El usuario {email} ya existía: ahora es administrador.")
            return

        password = getpass.getpass("Contraseña (mín. 8 caracteres, con letras y números): ")
        if password != getpass.getpass("Repite la contraseña: "):
            sys.exit("Las contraseñas no coinciden.")
        try:
            data = UserCreate(email=email, password=password, full_name=args.nombre)
        except ValidationError as exc:
            sys.exit("Datos inválidos:\n" + "\n".join(f"- {e['loc'][0]}: {e['msg']}" for e in exc.errors()))

        db.add(User(email=data.email, password_hash=hash_password(data.password),
                    full_name=data.full_name, role="admin"))
        db.commit()
        print(f"Administrador {data.email} creado.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
