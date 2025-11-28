const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const multer = require('multer');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// HTTP server (needed to attach WebSocket server)
const server = http.createServer(app);

// Middlewares
app.use(express.json({ limit: '10mb' }));

// In-memory stores for demo / development.
// TODO: Replace with a real database if needed.
const cameras = new Map();
const events = [];
const energySamples = [];
const latestFrames = new Map(); // cameraId -> { buffer, timestamp }
const cameraActions = new Map(); // cameraId -> { photoRequested?: boolean, photoRequestedAt?: number, streamUntil?: number }

// Healthcheck
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Register or update a camera status from a Raspberry Pi
app.post('/api/cameras/:cameraId/status', (req, res) => {
  const { cameraId } = req.params;
  const {
    name,
    location,
    status,
    type,
    url,
    enabled = true,
    coordinates,
  } = req.body || {};

  if (!status || !type) {
    return res.status(400).json({ error: 'Missing required fields: status, type' });
  }

  const camera = {
    id: cameraId,
    name: name || `Camera ${cameraId}`,
    location: location || '',
    status,
    type,
    url: url || '',
    enabled,
    coordinates,
    lastSeenAt: new Date().toISOString(),
  };

  cameras.set(cameraId, camera);

  res.json({ ok: true, camera });
});

// Receive an event (e.g. detection, photo captured) from a Raspberry Pi
app.post('/api/cameras/:cameraId/events', (req, res) => {
  const { cameraId } = req.params;
  const { eventType = 'detection', thumbnail, imageUrl } = req.body || {};

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const event = {
    id,
    cameraId,
    eventType,
    thumbnail: thumbnail || '',
    imageUrl: imageUrl || '',
    timestamp: new Date().toISOString(),
  };

  events.push(event);

  res.status(201).json({ ok: true, event });
});

// Receive energy / telemetry data from a Raspberry Pi
app.post('/api/cameras/:cameraId/energy', (req, res) => {
  const { cameraId } = req.params;
  const { voltage, current, watts, cpuTemp } = req.body || {};

  if (
    typeof voltage !== 'number' ||
    typeof current !== 'number' ||
    typeof watts !== 'number' ||
    typeof cpuTemp !== 'number'
  ) {
    return res.status(400).json({
      error: 'voltage, current, watts and cpuTemp must be numbers',
    });
  }

  const sample = {
    cameraId,
    voltage,
    current,
    watts,
    cpuTemp,
    timestamp: new Date().toISOString(),
  };

  energySamples.push(sample);

  res.status(201).json({ ok: true, sample });
});

// Configure storage for photo uploads
const uploadsRoot = path.join(__dirname, 'uploads');
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const { cameraId } = req.params;
    const cameraDir = path.join(uploadsRoot, cameraId || 'unknown');
    fs.mkdirSync(cameraDir, { recursive: true });
    cb(null, cameraDir);
  },
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${ts}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máx por imagen
  },
});

// Endpoint para que la Raspberry envíe una foto puntual (snapshot)
// POST /api/cameras/:cameraId/photo  (multipart/form-data, campo "image")
app.post('/api/cameras/:cameraId/photo', upload.single('image'), (req, res) => {
  const { cameraId } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: 'Missing image file in "image" field' });
  }

  const relativeUrl = `/uploads/${cameraId}/${req.file.filename}`;

  // Opcional: registrar un evento asociado a esta foto
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const event = {
    id,
    cameraId,
    eventType: 'photo',
    thumbnail: relativeUrl,
    imageUrl: relativeUrl,
    timestamp: new Date().toISOString(),
  };
  events.push(event);

  res.status(201).json({
    ok: true,
    imageUrl: relativeUrl,
    event,
  });
});

// Endpoint HTTP para obtener el último frame "en vivo" de una cámara como imagen JPEG
// Esto permite que el frontend haga polling si aún no se quiere usar WebSockets en el navegador.
app.get('/api/cameras/:cameraId/live-frame', (req, res) => {
  const { cameraId } = req.params;
  const frame = latestFrames.get(cameraId);

  if (!frame) {
    return res.status(404).json({ error: 'No live frame available for this camera' });
  }

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(frame.buffer);
});

// ----------------------------
// Control de acciones desde el servidor hacia la Raspberry
// ----------------------------

// Endpoint para que el frontend/server solicite una foto de una cámara concreta.
// POST /api/cameras/:cameraId/request-photo
app.post('/api/cameras/:cameraId/request-photo', (req, res) => {
  const { cameraId } = req.params;
  const actions = cameraActions.get(cameraId) || {};

  actions.photoRequested = true;
  actions.photoRequestedAt = Date.now();
  cameraActions.set(cameraId, actions);

  res.json({ ok: true, cameraId, action: 'photo' });
});

// Endpoint para que el frontend/server solicite que una cámara haga streaming durante un tiempo.
// POST /api/cameras/:cameraId/request-stream  { durationSeconds?: number }
app.post('/api/cameras/:cameraId/request-stream', (req, res) => {
  const { cameraId } = req.params;
  const { durationSeconds = 300 } = req.body || {};

  const now = Date.now();
  const until = now + durationSeconds * 1000;
  const actions = cameraActions.get(cameraId) || {};

  actions.streamUntil = until;
  cameraActions.set(cameraId, actions);

  res.json({
    ok: true,
    cameraId,
    action: 'stream',
    streamUntil: new Date(until).toISOString(),
    durationSeconds,
  });
});

// Endpoint que la Raspberry consulta periódicamente para saber si debe tomar foto o hacer streaming.
// GET /api/camera/:cameraId/take-photo-or-video
// Respuesta: { action: "none" | "photo" | "stream", streamDurationSeconds?: number }
app.get('/api/camera/:cameraId/take-photo-or-video', (req, res) => {
  const { cameraId } = req.params;
  const now = Date.now();
  const actions = cameraActions.get(cameraId) || {};

  let action = 'none';
  let streamDurationSeconds = 0;

  // Prioridad: primero foto (evento puntual), luego stream, luego nada
  if (actions.photoRequested) {
    action = 'photo';
    actions.photoRequested = false; // se consume la petición de foto
  } else if (actions.streamUntil && actions.streamUntil > now) {
    action = 'stream';
    streamDurationSeconds = Math.round((actions.streamUntil - now) / 1000);
  } else {
    // Si ya ha pasado el tiempo de streaming, limpiamos
    actions.streamUntil = undefined;
  }

  cameraActions.set(cameraId, actions);

  res.json({
    cameraId,
    action,
    streamDurationSeconds,
  });
});

// Simple endpoints for the frontend to read current state (for future integration)
app.get('/api/cameras', (_req, res) => {
  res.json(Array.from(cameras.values()));
});

app.get('/api/cameras/:cameraId/events', (req, res) => {
  const { cameraId } = req.params;
  res.json(events.filter((e) => e.cameraId === cameraId));
});

// WebSocket server para streaming ligero de frames desde la Raspberry
// La Raspberry se conecta a: ws://<host>/ws/camera-stream?cameraId=cam-01
// y envía frames JPEG ya comprimidos (binary).
const wss = new WebSocket.Server({ server, path: '/ws/camera-stream' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const cameraId = url.searchParams.get('cameraId');

  if (!cameraId) {
    ws.close(1008, 'cameraId query parameter is required');
    return;
  }

  ws.on('message', (data) => {
    // Esperamos buffers binarios con contenido JPEG ya comprimido
    if (Buffer.isBuffer(data)) {
      latestFrames.set(cameraId, {
        buffer: data,
        timestamp: Date.now(),
      });
    }
  });

  ws.on('close', () => {
    // Opcional: podríamos limpiar latestFrames si queremos que deje de estar disponible.
  });
});

// Static files: serve the built React app from Vite (outDir: "build")
const clientBuildPath = path.join(__dirname, 'build');
app.use(express.static(clientBuildPath));

// Static files: serve uploaded images
app.use('/uploads', express.static(uploadsRoot));

// Fallback to index.html for React Router / SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${PORT}`);
});


