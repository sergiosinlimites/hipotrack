#!/usr/bin/env python3
"""
Agente de cámara para Raspberry Pi con webcam USB (Logitech).

- Captura fotos con `fswebcam`.
- Envía fotos al backend Express mediante multipart/form-data.
- Consulta periódicamente al backend si debe tomar una foto o hacer streaming.
- Si se solicita streaming, envía frames JPEG comprimidos por WebSocket durante N segundos.
 - También puede disparar una foto automáticamente cuando detecta presencia en un sensor PIR (GPIO).

Requisitos en la Raspberry:
  sudo apt update
  sudo apt install fswebcam

  pip install requests websocket-client

Opcional (para streaming con frames más frecuentes y eficientes):
  pip install opencv-python
"""

import os
import time
import subprocess
import threading
from datetime import datetime, timedelta

import requests
import websocket
from websocket import create_connection
from dotenv import load_dotenv

try:
  import RPi.GPIO as GPIO

  GPIO_AVAILABLE = True
except ImportError:  # noqa: BLE001
  GPIO = None
  GPIO_AVAILABLE = False


# Cargar variables desde el archivo .env (si existe) en la misma carpeta
load_dotenv()


CAMERA_ID = os.getenv("CAMERA_ID", "cam-01")
SERVER_HOST = os.getenv("SERVER_HOST", "localhost")
SERVER_PORT = int(os.getenv("SERVER_PORT", "3000"))
USE_HTTPS = os.getenv("USE_HTTPS", "false").lower() == "true"

PROTOCOL_HTTP = "https" if USE_HTTPS else "http"
PROTOCOL_WS = "wss" if USE_HTTPS else "ws"

BASE_HTTP_URL = f"{PROTOCOL_HTTP}://{SERVER_HOST}:{SERVER_PORT}"
CONTROL_URL = f"{BASE_HTTP_URL}/api/camera/{CAMERA_ID}/take-photo-or-video"
PHOTO_UPLOAD_URL = f"{BASE_HTTP_URL}/api/cameras/{CAMERA_ID}/photo"
WS_STREAM_URL = f"{PROTOCOL_WS}://{SERVER_HOST}:{SERVER_PORT}/ws/camera-stream?cameraId={CAMERA_ID}"
LIVE_FRAME_UPLOAD_URL = f"{BASE_HTTP_URL}/api/cameras/{CAMERA_ID}/live-frame"

# Configuración de la cámara / calidad
PHOTO_RESOLUTION = os.getenv("PHOTO_RESOLUTION", "640x480")
PHOTO_JPEG_QUALITY = int(os.getenv("PHOTO_JPEG_QUALITY", "80"))
PHOTO_FILE_PATH = "/tmp/camera_snapshot.jpg"

# Cada cuánto tiempo la Raspberry consulta si hay orden de foto/video (segundos)
POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "60"))

# Pin GPIO usado para el sensor PIR (modo BCM)
PIR_PIN = int(os.getenv("PIR_PIN", "4"))

# Lock para evitar que se lancen capturas simultáneas (PIR + petición remota + streaming)
CAPTURE_LOCK = threading.Lock()

# Debug opcional de WebSocket (muy verboso). Activar sólo si WS_DEBUG=true en .env
WS_DEBUG = os.getenv("WS_DEBUG", "false").lower() == "true"
if WS_DEBUG:
  websocket.enableTrace(True)
  log(f"WebSocket debug activado. WS_STREAM_URL={WS_STREAM_URL}")


def log(msg: str) -> None:
  now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
  print(f"[{now}] {msg}", flush=True)


def capture_photo_with_fswebcam() -> str:
  """
  Captura una foto usando fswebcam y la guarda en PHOTO_FILE_PATH.
  Devuelve la ruta al archivo capturado.
  """
  cmd = [
    "fswebcam",
    "-r",
    PHOTO_RESOLUTION,
    "--jpeg",
    str(PHOTO_JPEG_QUALITY),
    "--no-banner",
    PHOTO_FILE_PATH,
  ]

  with CAPTURE_LOCK:
    log(f"Capturando foto con fswebcam: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
      log(f"Error al capturar foto con fswebcam: {result.stderr}")
      raise RuntimeError("fswebcam failed")

    if not os.path.exists(PHOTO_FILE_PATH):
      raise FileNotFoundError(f"No se encontró el archivo de foto en {PHOTO_FILE_PATH}")

  return PHOTO_FILE_PATH


def upload_photo(file_path: str) -> None:
  """
  Envía la foto al backend usando multipart/form-data.
  """
  log(f"Subiendo foto a {PHOTO_UPLOAD_URL}")
  with open(file_path, "rb") as f:
    files = {"image": ("snapshot.jpg", f, "image/jpeg")}
    try:
      resp = requests.post(PHOTO_UPLOAD_URL, files=files, timeout=15)
      resp.raise_for_status()
      data = resp.json()
      log(f"Foto subida correctamente. Respuesta: {data}")
    except Exception as exc:  # noqa: BLE001
      log(f"Error al subir la foto: {exc}")


def handle_photo_action() -> None:
  """
  Ejecuta el flujo completo de tomar y enviar una foto.
  """
  try:
    file_path = capture_photo_with_fswebcam()
    upload_photo(file_path)
  except Exception as exc:  # noqa: BLE001
    log(f"Error en handle_photo_action: {exc}")


def stream_for_duration(duration_seconds: int) -> None:
  """
  Envía frames JPEG comprimidos al backend durante `duration_seconds`.

  Para maximizar la compatibilidad y simplificar, en lugar de WebSocket se
  usa HTTP POST contra /api/cameras/:id/live-frame (multipart/form-data).
  Con los intervalos típicos de 1-3 fps el overhead HTTP es aceptable y
  se evitan problemas de sockets cerrados (Broken pipe).
  """
  FRAME_INTERVAL_SECONDS = int(os.getenv("FRAME_INTERVAL_SECONDS", "2"))

  end_time = datetime.now() + timedelta(seconds=duration_seconds)
  log(f"Iniciando streaming HTTP durante {duration_seconds} segundos hacia {LIVE_FRAME_UPLOAD_URL}")

  try:
    while datetime.now() < end_time:
      # Capturamos un frame con fswebcam (igual que para la foto, pero sin banner si quieres)
      try:
        file_path = capture_photo_with_fswebcam()
      except Exception as exc:  # noqa: BLE001
        log(f"Error capturando frame para streaming: {exc}")
        time.sleep(FRAME_INTERVAL_SECONDS)
        continue

      try:
        with open(file_path, "rb") as f:
          data = f.read()
          if not data:
            log("Frame vacío, se omite el envío")
          else:
            files = {"image": ("frame.jpg", data, "image/jpeg")}
            resp = requests.post(LIVE_FRAME_UPLOAD_URL, files=files, timeout=10)
            resp.raise_for_status()
            log(f"Frame enviado ({len(data)} bytes) al backend")
      except Exception as exc:  # noqa: BLE001
        log(f"Error enviando frame por HTTP: {exc}")
        break

      time.sleep(FRAME_INTERVAL_SECONDS)

  finally:
    log("Streaming finalizado")


def _pir_callback(channel: int) -> None:
  """
  Callback de interrupción del GPIO cuando el sensor PIR detecta presencia.
  Ejecuta la toma y envío de una foto en un hilo separado para no bloquear el callback.
  """
  log(f"Detección de presencia en GPIO {PIR_PIN} (canal {channel}). Disparando foto...")
  thread = threading.Thread(target=handle_photo_action, daemon=True)
  thread.start()


def init_pir_sensor() -> None:
  """
  Inicializa el sensor PIR en el pin configurado, si la librería RPi.GPIO está disponible.
  """
  if not GPIO_AVAILABLE:
    log("RPi.GPIO no disponible. Sensor PIR desactivado.")
    return

  try:
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(PIR_PIN, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)
    GPIO.add_event_detect(PIR_PIN, GPIO.RISING, callback=_pir_callback, bouncetime=2000)
    log(f"Sensor PIR inicializado en GPIO {PIR_PIN}")
  except Exception as exc:  # noqa: BLE001
    log(f"Error inicializando el sensor PIR: {exc}")


def poll_and_execute_loop() -> None:
  """
  Bucle principal:
  - Consulta periódicamente al backend si hay que tomar foto o hacer streaming.
  - Ejecuta la acción correspondiente si la hay.
  """
  log(f"Iniciando agente de cámara para {CAMERA_ID} apuntando a {BASE_HTTP_URL}")
  log(f"Consultando acciones cada {POLL_INTERVAL_SECONDS} segundos")

  # Inicializamos el sensor PIR (si está disponible)
  init_pir_sensor()

  while True:
    try:
      log(f"Consultando acciones en {CONTROL_URL}")
      resp = requests.get(CONTROL_URL, timeout=10)
      resp.raise_for_status()
      data = resp.json()
      action = data.get("action", "none")
      stream_duration = int(data.get("streamDurationSeconds", 0) or 0)

      log(f"Acción recibida: {action}, streamDurationSeconds={stream_duration}")

      if action == "photo":
        handle_photo_action()
      elif action == "stream" and stream_duration > 0:
        stream_for_duration(stream_duration)
      else:
        log("Nada que hacer en este ciclo")

    except Exception as exc:  # noqa: BLE001
      log(f"Error al consultar acciones: {exc}")

    time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
  try:
    poll_and_execute_loop()
  except KeyboardInterrupt:
    log("Agente interrumpido por el usuario (Ctrl+C)")
  finally:
    if GPIO_AVAILABLE:
      GPIO.cleanup()


