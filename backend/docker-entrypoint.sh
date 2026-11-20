#!/bin/sh
# Arranque del backend en Docker: aplica las migraciones pendientes y levanta la API.
set -e

python -m alembic upgrade head

# --forwarded-allow-ips: solo se cree la cabecera X-Forwarded-For (IP real del cliente, usada en los límites de
# intentos) si la petición viene de la puerta de entrada Spring Boot, que tiene una IP fija en la red de Docker.
exec uvicorn app.main:app --host 0.0.0.0 --port 8010 \
  --proxy-headers --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-127.0.0.1}"
