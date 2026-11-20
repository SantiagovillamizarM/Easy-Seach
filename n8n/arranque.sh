#!/bin/sh
# Arranque del contenedor de n8n para Easy Search.
#
# 1. Crea las credenciales con los valores del .env (no quedan en el repositorio).
# 2. Importa los flujos de n8n/workflows/ (el repositorio es la fuente de verdad: si se edita un flujo en la
#    interfaz de n8n, hay que exportarlo y guardarlo en n8n/workflows/ o se perderá al reiniciar).
# 3. Publica los flujos para que sus webhooks y horarios queden activos.
# 4. Inicia n8n.
set -e

TMP_CREDS=/tmp/easysearch-credenciales.json
node /easysearch/credenciales.js "$TMP_CREDS"
n8n import:credentials --input="$TMP_CREDS"
rm -f "$TMP_CREDS"

n8n import:workflow --separate --input=/easysearch/workflows

for archivo in /easysearch/workflows/*.json; do
  id=$(node -e "process.stdout.write(require('$archivo').id)")
  n8n publish:workflow --id="$id"
done

exec n8n start
