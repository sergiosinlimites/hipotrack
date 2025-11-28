
## Hypotrack – Backend + Frontend + Raspberry Pi (Cámaras 4G)

Este proyecto monta un panel web tipo “NVR” para monitorear cámaras (por ejemplo, una Raspberry Pi con cámara USB 720p + sensor PIR) y un backend en Node/Express con PostgreSQL y generación de vídeo con ffmpeg.

- **Frontend React + Vite**: vista de cámaras, eventos, mapa, configuración, etc.
- **Backend Node.js + Express + TypeORM**:
  - API REST (`/api/cameras`, `/api/events`, `/api/cameras/:id/photo`, `/api/cameras/:id/live-frame`, etc.).
  - PostgreSQL (contenedor Docker) con entidades en `db/`.
  - Recepción de fotos y frames de streaming y generación de vídeos (`stream_sessions` + ffmpeg).
- **Agente Raspberry Pi** (`raspberry/camera_agent.py`):
  - Captura fotos y frames usando OpenCV (y fswebcam como respaldo).
  - Envía fotos y frames al backend por HTTP.
  - Lee un sensor PIR en GPIO4 para disparar fotos automáticas.

El diseño original de la UI está en:  
`https://www.figma.com/design/I3fenRMyAbyveJDVMWU7wS/Hypotrack`

---

## 1. Requisitos en la máquina del servidor (Ubuntu)

### 1.1 Node.js y npm

Instala Node.js LTS (por ejemplo, con NodeSource):

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

node -v
npm -v
```

### 1.2 Docker (para PostgreSQL)

Instala Docker:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keys/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io

sudo systemctl enable --now docker
docker --version
```

### 1.3 Contenedor de PostgreSQL

Lanza un contenedor dedicado para Hypotrack:

```bash
sudo docker run -d \
  --name db_hypotrack \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=tpihipotrack \
  -e POSTGRES_DB=hipotrack \
  -p 5445:5432 \
  -v hypotrack_pgdata:/var/lib/postgresql/data \
  postgres:17.4
```

Comprueba que está levantado:

```bash
sudo docker ps | grep db_hypotrack
```

### 1.4 ffmpeg (para generar MP4)

```bash
sudo apt update
sudo apt install -y ffmpeg
ffmpeg -version
```

Si `ffmpeg` no está en el `PATH`, añade en el `.env` del servidor (ver abajo):

```env
FFMPEG_PATH=/usr/bin/ffmpeg   # ajusta según `which ffmpeg`
```

---

## 2. Configuración del backend/frontend (servidor)

### 2.1 `.env` del servidor (ejemplo)

En la raíz del proyecto (`/home/sergio/Documents/TPI2/.env`):

```dotenv
PGHOST=localhost
PGPORT=5445
PGUSER=admin
PGPASSWORD=tpihipotrack
PGDATABASE=hipotrack

# Ruta opcional a ffmpeg si no está en el PATH
FFMPEG_PATH=/usr/bin/ffmpeg

# FPS usados al generar el MP4 a partir de los frames
STREAM_FPS=5
```

### 2.2 Instalación y arranque

Desde la raíz del proyecto:

```bash
npm install
```

Para desarrollo (frontend en `http://localhost:3000`, backend en `http://localhost:3001`):

```bash
npm run dev
```

Esto lanza:

- `npm run dev:client` → Vite en `http://localhost:3000`
- `npm run dev:server` → Express + API en `http://localhost:3001`

Para producción (build estático + servidor Express en `:3000`):

```bash
npm run build      # genera ./build con el frontend
npm start          # levanta server.js con PORT=3000
```

---

## 3. Configuración y despliegue en Raspberry Pi

### 3.1 Requisitos en la Raspberry

En la Raspberry (Raspberry Pi OS / Debian):

```bash
sudo apt update

# Python 3 + pip
sudo apt install -y python3 python3-pip python3-venv

# Herramientas de cámara
sudo apt install -y fswebcam python3-opencv
```

Opcional: crear un entorno virtual:

```bash
cd /ruta/a/TPI2/raspberry
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install requests websocket-client python-dotenv
```

### 3.2 `.env` de la Raspberry (ejemplo)

En `raspberry/.env`:

```dotenv
CAMERA_ID=1764304793263
SERVER_HOST=192.168.1.6
SERVER_PORT=3001
USE_HTTPS=false

# Cada cuánto segundos la Raspberry pregunta al servidor si debe tomar foto o iniciar streaming
POLL_INTERVAL_SECONDS=15

# Frecuencia de frames de streaming (segundos entre fotos)
# 1 → ~1 fps (razonable para 720p sobre datos móviles)
FRAME_INTERVAL_SECONDS=1

# Calidad de captura: 720p con buena calidad JPEG
PHOTO_RESOLUTION=1280x720
PHOTO_JPEG_QUALITY=80

# Sensor PIR en GPIO4 (numeración BCM)
PIR_PIN=4

# Tiempo mínimo entre fotos disparadas por PIR (segundos)
PIR_COOLDOWN_SECONDS=5

# Opcionales de debug
PIR_DEBUG=false      # true para ver cambios de nivel en GPIO4
WS_DEBUG=false       # true para ver trazas detalladas del cliente websocket
```

Asegúrate de que `CAMERA_ID` coincide con el ID configurado para la cámara en el panel web / base de datos.

### 3.3 Probar el PIR (GPIO4)

Para verificar el cableado y el sensor antes de usar el agente completo:

```bash
cd /ruta/a/TPI2/raspberry
python3 test_pir_gpio.py
```

Conecta:

- Entrada: GPIO4 (BCM) → 3.3V mediante un botón o jumper.
- Salida (opcional): GPIO17 → LED + resistencia → GND.

Al cambiar el nivel verás en consola:

- `GPIO4 = ALTO (3.3V) -> salida activada`

Pulsa `Ctrl+C` para salir.

### 3.4 Ejecutar el agente de cámara

Con el backend ya corriendo (`npm run dev` o `npm start`) y la Raspberry con el `.env` anterior:

```bash
cd /ruta/a/TPI2/raspberry
python3 camera_agent.py
```

Verás logs como:

- `Iniciando agente de cámara para 1764304793263 apuntando a http://192.168.1.6:3001`
- Cada `POLL_INTERVAL_SECONDS`:
  - `Consultando acciones en http://192.168.1.6:3001/api/camera/1764304793263/take-photo-or-video`
  - `Acción recibida: none / photo / stream`
- Al disparar una foto (UI o PIR):
  - `Iniciando captura de foto (handle_photo_action)`
  - `Capturando foto con fswebcam: fswebcam -r 1280x720 --jpeg 80 --no-banner /tmp/camera_snapshot.jpg`
  - `Foto subida correctamente. Respuesta: {...}`
- Al iniciar streaming:
  - `Iniciando streaming HTTP durante XX segundos hacia http://.../api/cameras/1764304793263/live-frame`
  - `Frame enviado (NNNN bytes) al backend`
  - `Streaming finalizado`

---

## 4. Flujo completo: fotos, streaming y vídeo

1. **Configura la cámara** en el panel web (`Configuración → Nueva Cámara`) usando `CAMERA_ID` (por ejemplo `1764304793263`).
2. El agente de la Raspberry se conecta al backend y reporta su estado.
3. Desde la vista **Cámaras**:
   - **Tomar foto**:
     - El frontend llama a `POST /api/cameras/:id/request-photo`.
     - La Raspberry captura una foto y la envía a `POST /api/cameras/:id/photo`.
     - El backend la guarda en `uploads/<id>/photos/...`, crea un `Photo` + `Event`, actualiza `camera.thumbnail` y la verás:
       - Como thumbnail en la tarjeta de la cámara.
       - En el modal de “Tomar foto”.
       - En la pestaña de **Eventos**.
   - **Ver video**:
     - El frontend llama a `POST /api/cameras/:id/request-stream` con `durationSeconds = streamTimeout * 60` (desde la configuración).
     - La Raspberry entra en `stream_for_duration` y envía frames cada `FRAME_INTERVAL_SECONDS` a `POST /api/cameras/:id/live-frame`.
     - El backend guarda el último frame en memoria (`latestFrames`) y el modal de streaming lo muestra vía `GET /api/cameras/:id/live-frame`.
     - Se van guardando los frames en `uploads/<id>/videos/<sessionId>/<timestamp>.jpg`.
     - Al finalizar la sesión, el backend genera automáticamente un `stream.mp4` en `uploads/<id>/videos/<sessionId>/stream.mp4` usando `ffmpeg` y guarda la ruta en `stream_sessions.video_path`.

4. Para regenerar un MP4 de una sesión existente, puedes llamar:

```bash
curl -X POST http://localhost:3001/api/streams/<sessionId>/generate-video
```

Esto vuelve a lanzar ffmpeg sobre los JPG de esa sesión y actualiza `video_path` cuando termine.
  