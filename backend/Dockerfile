# Backend FastAPI de Easy Search (búsqueda, cuentas, reseñas, paneles y rutas internas para n8n)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # El modelo de embeddings (~470 MB) se descarga la primera vez y queda en un volumen
    HF_HOME=/modelos

# Misma estructura que el repositorio: el código calcula rutas como <raíz>/backend/uploads
WORKDIR /easysearch/backend

# PyTorch solo para CPU (unas 4 veces más liviano que la versión con GPU) y luego las demás dependencias.
# Se copian primero los requisitos para que Docker reutilice esta capa si solo cambia el código.
COPY requirements.txt .
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.15.0 \
 && pip install -r requirements.txt

COPY . .

# Usuario sin privilegios: si alguien llegara a explotar la app, no sería root dentro del contenedor
RUN useradd --create-home --uid 10001 easysearch \
 && mkdir -p /easysearch/backend/uploads /modelos \
 && chown -R easysearch /easysearch/backend/uploads /modelos
USER easysearch

EXPOSE 8010
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8010/api/health', timeout=4)"

CMD ["sh", "docker-entrypoint.sh"]
