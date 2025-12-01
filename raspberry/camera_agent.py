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
ENERGY_URL = f"{BASE_HTTP_URL}/api/cameras/{CAMERA_ID}/energy"
DATA_USAGE_URL = f"{BASE_HTTP_URL}/api/cameras/{CAMERA_ID}/data-usage"
WS_STREAM_URL = f"{PROTOCOL_WS}://{SERVER_HOST}:{SERVER_PORT}/ws/camera-stream?cameraId={CAMERA_ID}"
LIVE_FRAME_UPLOAD_URL = f"{BASE_HTTP_URL}/api/cameras/{CAMERA_ID}/live-frame"

# Configuración de la cámara / calidad
PHOTO_RESOLUTION = os.getenv("PHOTO_RESOLUTION", "640x480")
PHOTO_JPEG_QUALITY = int(os.getenv("PHOTO_JPEG_QUALITY", "80"))
PHOTO_FILE_PATH = "/tmp/camera_snapshot.jpg"

# Cada cuánto tiempo la Raspberry consulta si hay orden de foto/video (segundos)
POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "60"))

# Cada cuántos polls se envía una muestra de energía (1 = en cada poll).
# Leer temperatura de CPU y hacer un POST pequeño es barato, pero lo hacemos configurable.
ENERGY_SAMPLE_EVERY_POLLS = int(os.getenv("ENERGY_SAMPLE_EVERY_POLLS", "5"))

# Telemetría de uso de datos (basada en bytes enviados/recibidos por HTTP)
DATA_USAGE_ENABLED = os.getenv("DATA_USAGE_ENABLED", "true").lower() == "true"
DATA_USAGE_FLUSH_EVERY_POLLS = int(os.getenv("DATA_USAGE_FLUSH_EVERY_POLLS", "4"))

# Buffer local de consumo de datos por tipo
DATA_USAGE_BUFFER = {
  "detection": 0,
  "photo": 0,
  "stream": 0,
  "system": 0,
}

# Pin GPIO usado para el sensor PIR (modo BCM)
PIR_PIN = int(os.getenv("PIR_PIN", "4"))

# Duración del streaming cuando se dispara por PIR (segundos)
PIR_STREAM_DURATION_SECONDS = int(os.getenv("PIR_STREAM_DURATION_SECONDS", "30"))

# Token de autenticación compartido con el backend
CAMERA_API_TOKEN = os.getenv("CAMERA_API_TOKEN", "").strip()

# Lock para evitar que se lancen capturas simultáneas (PIR + petición remota + streaming)
CAPTURE_LOCK = threading.Lock()

def log(msg: str) -> None:
  now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
  print(f"[{now}] {msg}", flush=True)


# Debug opcional de WebSocket (muy verboso). Activar sólo si WS_DEBUG=true en .env
WS_DEBUG = os.getenv("WS_DEBUG", "false").lower() == "true"
if WS_DEBUG:
  websocket.enableTrace(True)
  log(f"WebSocket debug activado. WS_STREAM_URL={WS_STREAM_URL}")

# Debug opcional del PIR para ver cambios de nivel en GPIO4
PIR_DEBUG = os.getenv("PIR_DEBUG", "false").lower() == "true"


def _auth_headers() -> dict:
  """
  Cabeceras de autenticación para llamadas al backend.
  Si CAMERA_API_TOKEN está vacío, no se añade nada (modo sin auth).
  """
  if not CAMERA_API_TOKEN:
    return {}
  return {"X-Api-Key": CAMERA_API_TOKEN}


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
  file_size = 0
  try:
    file_size = os.path.getsize(file_path)
  except OSError:
    file_size = 0

  with open(file_path, "rb") as f:
    files = {"image": ("snapshot.jpg", f, "image/jpeg")}
    try:
      resp = requests.post(PHOTO_UPLOAD_URL, files=files, headers=_auth_headers(), timeout=15)
      resp.raise_for_status()
      data = resp.json()
      resp_bytes = len(resp.content or b"") if hasattr(resp, "content") else 0
      _add_data_usage("photo", file_size + resp_bytes)
      log(f"Foto subida correctamente. Respuesta: {data}")
    except Exception as exc:  # noqa: BLE001
      log(f"Error al subir la foto: {exc}")


def handle_photo_action() -> None:
  """
  Ejecuta el flujo completo de tomar y enviar una foto.
  """
  try:
    log("Iniciando captura de foto (handle_photo_action)")
    file_path = capture_photo_with_fswebcam()
    upload_photo(file_path)
    log("Captura y envío de foto completados")
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
            resp = requests.post(LIVE_FRAME_UPLOAD_URL, files=files, headers=_auth_headers(), timeout=10)
            resp.raise_for_status()
            resp_bytes = len(resp.content or b"") if hasattr(resp, "content") else 0
            _add_data_usage("stream", len(data) + resp_bytes)
            log(f"Frame enviado ({len(data)} bytes) al backend")
      except Exception as exc:  # noqa: BLE001
        log(f"Error enviando frame por HTTP: {exc}")
        break

      # Log simple de tiempo restante
      remaining = (end_time - datetime.now()).total_seconds()
      log(f"Streaming en curso, tiempo restante aproximado: {int(remaining)} segundos")

      time.sleep(FRAME_INTERVAL_SECONDS)

  finally:
    log("Streaming finalizado")


def _request_stream_session(duration_seconds: int) -> None:
  """
  Solicita al backend que cree una sesión de streaming y programe la generación del MP4.
  Reutiliza el mismo endpoint que el frontend: POST /api/cameras/:id/request-stream.
  """
  url = f"{BASE_HTTP_URL}/api/cameras/{CAMERA_ID}/request-stream"
  payload = {
    "durationSeconds": duration_seconds,
  }
  try:
    log(f"Solicitando sesión de streaming al backend por {duration_seconds}s en {url}")
    resp = requests.post(url, json=payload, headers=_auth_headers(), timeout=10)
    resp.raise_for_status()
    data = resp.json()
    resp_bytes = len(resp.content or b"") if hasattr(resp, "content") else 0
    _add_data_usage("system", len(str(payload).encode("utf-8")) + resp_bytes)
    log(f"Sesión de streaming creada correctamente: {data}")
  except Exception as exc:  # noqa: BLE001
    log(f"Error al solicitar sesión de streaming: {exc}")


def _read_cpu_temperature() -> float | None:
  """
  Lee la temperatura de la CPU desde /sys/class/thermal/thermal_zone0/temp (si existe).
  Devuelve la temperatura en °C o None si no se puede leer.
  """
  path = "/sys/class/thermal/thermal_zone0/temp"
  try:
    with open(path, "r", encoding="utf-8") as f:
      raw = f.read().strip()
    millis = int(raw)
    return millis / 1000.0
  except Exception as exc:  # noqa: BLE001
    log(f"No se pudo leer la temperatura de la CPU desde {path}: {exc}")
    return None


def _send_energy_sample_if_needed(poll_count: int) -> None:
  """
  Envía una muestra de energía cada ENERGY_SAMPLE_EVERY_POLLS consultas de control.
  Usa datos aproximados (voltaje/corriente constantes) + temperatura real de CPU.
  """
  if ENERGY_SAMPLE_EVERY_POLLS <= 0:
    return
  if poll_count % ENERGY_SAMPLE_EVERY_POLLS != 0:
    return

  cpu_temp = _read_cpu_temperature()
  if cpu_temp is None:
    return

  try:
    voltage = float(os.getenv("ENERGY_VOLTAGE_DEFAULT", "5.0"))
  except ValueError:
    voltage = 5.0
  try:
    current = float(os.getenv("ENERGY_CURRENT_DEFAULT", "0.8"))
  except ValueError:
    current = 0.8

  watts = voltage * current

  payload = {
    "voltage": voltage,
    "current": current,
    "watts": watts,
    "cpuTemp": cpu_temp,
  }

  try:
    log(f"Enviando muestra de energía a {ENERGY_URL}: {payload}")
    resp = requests.post(ENERGY_URL, json=payload, headers=_auth_headers(), timeout=10)
    resp.raise_for_status()
    resp_bytes = len(resp.content or b"") if hasattr(resp, "content") else 0
    _add_data_usage("system", len(str(payload).encode("utf-8")) + resp_bytes)
  except Exception as exc:  # noqa: BLE001
    log(f"Error al enviar muestra de energía: {exc}")


def _add_data_usage(event_type: str, bytes_count: int) -> None:
  """
  Acumula bytes en el buffer local de consumo de datos.
  """
  if not DATA_USAGE_ENABLED:
    return
  if bytes_count <= 0:
    return
  if event_type not in DATA_USAGE_BUFFER:
    event_type = "system"
  DATA_USAGE_BUFFER[event_type] += bytes_count


def _flush_data_usage_if_needed(poll_count: int) -> None:
  """
  Envía eventos de consumo de datos agregados cada DATA_USAGE_FLUSH_EVERY_POLLS polls.
  """
  if not DATA_USAGE_ENABLED:
    return
  if DATA_USAGE_FLUSH_EVERY_POLLS <= 0:
    return
  if poll_count % DATA_USAGE_FLUSH_EVERY_POLLS != 0:
    return

  for event_type, total_bytes in list(DATA_USAGE_BUFFER.items()):
    if total_bytes <= 0:
      continue
    payload = {
      "type": event_type,
      "bytes": total_bytes,
    }
    try:
      log(f"Enviando uso de datos agregado a {DATA_USAGE_URL}: {payload}")
      resp = requests.post(DATA_USAGE_URL, json=payload, headers=_auth_headers(), timeout=10)
      resp.raise_for_status()
      DATA_USAGE_BUFFER[event_type] = 0
    except Exception as exc:  # noqa: BLE001
      log(f"Error al enviar evento de uso de datos: {exc}")


def _handle_pir_detection() -> None:
  """
  Flujo completo cuando el PIR detecta presencia:
  1. Tomar y enviar una foto.
  2. Solicitar una sesión de streaming de PIR_STREAM_DURATION_SECONDS.
  3. Enviar frames durante PIR_STREAM_DURATION_SECONDS segundos.
  """
  try:
    log("PIR: inicio de flujo de detección (foto + video)")
    handle_photo_action()
  except Exception as exc:  # noqa: BLE001
    log(f"PIR: error al tomar/enviar foto: {exc}")

  try:
    _request_stream_session(PIR_STREAM_DURATION_SECONDS)
  except Exception as exc:  # noqa: BLE001
    log(f"PIR: error al solicitar sesión de streaming: {exc}")

  try:
    stream_for_duration(PIR_STREAM_DURATION_SECONDS)
  except Exception as exc:  # noqa: BLE001
    log(f"PIR: error durante el streaming: {exc}")


def _pir_poll_loop(cooldown_seconds: float) -> None:
  """
  Bucle de sondeo del pin PIR para detectar presencia.
  Se usa en lugar de interrupciones para replicar el comportamiento del
  script de prueba (lectura periódica de GPIO.input) y evitar problemas
  con add_event_detect.
  """
  if not GPIO_AVAILABLE:
    log("GPIO no disponible, bucle PIR desactivado.")
    return

  last_shot = 0.0
  last_value = GPIO.LOW
  log(f"Iniciando bucle de sondeo PIR en GPIO {PIR_PIN} con cooldown {cooldown_seconds}s")

  while True:
    try:
      value = GPIO.input(PIR_PIN)
      if PIR_DEBUG and value != last_value:
        log(f"[PIR_DEBUG] GPIO{PIR_PIN} cambió a {'ALTO' if value == GPIO.HIGH else 'BAJO'}")
        last_value = value
      now_ts = time.time()
      if value == GPIO.HIGH and now_ts - last_shot >= cooldown_seconds:
        log(f"PIR en ALTO en GPIO {PIR_PIN}. Disparando flujo foto+video (poll loop).")
        last_shot = now_ts
        thread = threading.Thread(target=_handle_pir_detection, daemon=True)
        thread.start()
      time.sleep(0.1)
    except Exception as exc:  # noqa: BLE001
      log(f"Error en bucle PIR: {exc}")
      time.sleep(1.0)


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
    log(f"Sensor PIR inicializado en GPIO {PIR_PIN} (modo polling)")
    cooldown = float(os.getenv("PIR_COOLDOWN_SECONDS", "5"))
    pir_thread = threading.Thread(target=_pir_poll_loop, args=(cooldown,), daemon=True)
    pir_thread.start()
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

  poll_count = 0
  while True:
    try:
      poll_count += 1
      log(f"Consultando acciones en {CONTROL_URL}")
      resp = requests.get(CONTROL_URL, headers=_auth_headers(), timeout=10)
      resp.raise_for_status()
      try:
        # Consideramos solo el cuerpo de la respuesta como tráfico medible aquí.
        _add_data_usage("system", len(resp.content or b""))
      except Exception:
        pass
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

    # Telemetría de energía y de consumo de datos (no en cada iteración necesariamente)
    _send_energy_sample_if_needed(poll_count)
    _flush_data_usage_if_needed(poll_count)

    time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
  try:
    poll_and_execute_loop()
  except KeyboardInterrupt:
    log("Agente interrumpido por el usuario (Ctrl+C)")
  finally:
    if GPIO_AVAILABLE:
      GPIO.cleanup()


