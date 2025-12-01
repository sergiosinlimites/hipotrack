#!/usr/bin/env bash

set -euo pipefail

echo "=== Configuración del agente de cámara para Raspberry Pi ==="
echo "Este script creará un archivo .env, un entorno virtual de Python"
echo "e instalará las dependencias necesarias para ejecutar camera_agent.py."
echo

read_with_default() {
  local var_name="$1"
  local prompt="$2"
  local default="$3"
  local value
  read -r -p "$prompt [$default]: " value || true
  if [ -z "$value" ]; then
    value="$default"
  fi
  printf -v "$var_name" '%s' "$value"
}

# Pedir datos al usuario con valores por defecto
read_with_default CAMERA_ID "ID de la cámara (copiado desde el frontend)" "0000000000000"
read_with_default SERVER_HOST "Host del servidor" "192.168.1.6"
read_with_default SERVER_PORT "Puerto del servidor" "3001"
read_with_default USE_HTTPS "¿Usar HTTPS? (true/false)" "false"
read_with_default CAMERA_API_TOKEN "Token de la cámara" "tu_token_secreto_compartido"

read_with_default POLL_INTERVAL_SECONDS "Segundos entre consultas al servidor" "15"
read_with_default FRAME_INTERVAL_SECONDS "Segundos entre frames de streaming" "1"

read_with_default PHOTO_RESOLUTION "Resolución de foto" "1280x720"
read_with_default PHOTO_JPEG_QUALITY "Calidad JPEG (0-100)" "80"

read_with_default PIR_PIN "Pin GPIO para sensor PIR (BCM)" "4"
read_with_default PIR_DEBUG "PIR_DEBUG (true/false)" "false"
read_with_default WS_DEBUG "WS_DEBUG (true/false)" "false"

echo
echo "Creando archivo .env en $(pwd)/.env"
cat > .env <<EOF
CAMERA_ID=${CAMERA_ID}
SERVER_HOST=${SERVER_HOST}
SERVER_PORT=${SERVER_PORT}
USE_HTTPS=${USE_HTTPS}

POLL_INTERVAL_SECONDS=${POLL_INTERVAL_SECONDS}
FRAME_INTERVAL_SECONDS=${FRAME_INTERVAL_SECONDS}

PHOTO_RESOLUTION=${PHOTO_RESOLUTION}
PHOTO_JPEG_QUALITY=${PHOTO_JPEG_QUALITY}

PIR_PIN=${PIR_PIN}

PIR_DEBUG=${PIR_DEBUG}
WS_DEBUG=${WS_DEBUG}
EOF

echo ".env creado correctamente."
echo

if [ ! -f "camera_agent.py" ]; then
  echo "ERROR: No se encontró camera_agent.py en el directorio actual."
  echo "Ejecuta este script dentro de la carpeta raspberry del proyecto."
  exit 1
fi

PYTHON_BIN="${PYTHON_BIN:-python3}"

if [ ! -d ".venv" ]; then
  echo "Creando entorno virtual de Python (.venv)..."
  ${PYTHON_BIN} -m venv .venv
fi

echo "Activando entorno virtual..."
# shellcheck disable=SC1091
source .venv/bin/activate

echo "Actualizando pip e instalando dependencias..."
pip install --upgrade pip
pip install requests websocket-client python-dotenv

echo
echo "Todo listo. Iniciando camera_agent.py..."
echo "(Para detenerlo usa Ctrl+C)."
echo

exec python camera_agent.py


