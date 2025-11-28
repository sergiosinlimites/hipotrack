const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const multer = require('multer');
const WebSocket = require('ws');
const { AppDataSource } = require('./db/data-source');

const app = express();
const PORT = process.env.PORT || 3000;

// HTTP server (needed to attach WebSocket server)
const server = http.createServer(app);

// Middlewares
app.use(express.json({ limit: '10mb' }));

// In-memory stores for demo / development (non-persistent).
const latestFrames = new Map(); // cameraId -> { buffer, timestamp }
const cameraActions = new Map(); // cameraId -> { photoRequested?: boolean, photoRequestedAt?: number, streamUntil?: number }

// Healthcheck
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Register or update a camera status from a Raspberry Pi
app.post('/api/cameras/:cameraId/status', async (req, res) => {
  try {
    const cameraRepo = AppDataSource.getRepository('Camera');
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

    let camera = await cameraRepo.findOne({ where: { id: cameraId } });

    if (!camera) {
      camera = cameraRepo.create({
        id: cameraId,
        name: name || `Camera ${cameraId}`,
        location: location || '',
        status,
        type,
        url: url || '',
        enabled,
        coordinates,
        last_seen_at: new Date(),
      });
    } else {
      camera.name = name || camera.name;
      camera.location = location || camera.location;
      camera.status = status;
      camera.type = type;
      camera.url = url || camera.url;
      camera.enabled = enabled;
      camera.coordinates = coordinates || camera.coordinates;
      camera.last_seen_at = new Date();
    }

    const saved = await cameraRepo.save(camera);

    res.json({ ok: true, camera: saved });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error updating camera status', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Receive an event (generic) from a Raspberry Pi
app.post('/api/cameras/:cameraId/events', async (req, res) => {
  try {
    const eventRepo = AppDataSource.getRepository('Event');
    const cameraRepo = AppDataSource.getRepository('Camera');
    const { cameraId } = req.params;
    const { eventType = 'detection', payload = {} } = req.body || {};

    const camera = await cameraRepo.findOne({ where: { id: cameraId } });

    const event = eventRepo.create({
      type: eventType,
      payload,
      camera,
    });

    const saved = await eventRepo.save(event);

    res.status(201).json({ ok: true, event: saved });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error receiving event', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Receive energy / telemetry data from a Raspberry Pi
app.post('/api/cameras/:cameraId/energy', async (req, res) => {
  try {
    const energyRepo = AppDataSource.getRepository('EnergySample');
    const cameraRepo = AppDataSource.getRepository('Camera');
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

    const camera = await cameraRepo.findOne({ where: { id: cameraId } });
    if (!camera) {
      return res.status(404).json({ error: 'Camera not found' });
    }

    const sample = energyRepo.create({
      voltage,
      current,
      watts,
      cpu_temp: cpuTemp,
      measured_at: new Date(),
      camera,
    });

    const saved = await energyRepo.save(sample);

    res.status(201).json({ ok: true, sample: saved });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error receiving energy data', err);
    res.status(500).json({ error: 'Internal server error' });
  }
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
app.post('/api/cameras/:cameraId/photo', upload.single('image'), async (req, res) => {
  try {
    const photoRepo = AppDataSource.getRepository('Photo');
    const cameraRepo = AppDataSource.getRepository('Camera');
    const eventRepo = AppDataSource.getRepository('Event');

    const { cameraId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'Missing image file in "image" field' });
    }

    const camera = await cameraRepo.findOne({ where: { id: cameraId } });

    const relativeUrl = `/uploads/${cameraId}/${req.file.filename}`;

    // Guardar la foto en la base de datos
    const photo = photoRepo.create({
      image_path: relativeUrl,
      thumbnail_path: relativeUrl,
      trigger_source: 'device',
      captured_at: new Date(),
      camera,
    });
    const savedPhoto = await photoRepo.save(photo);

    // Registrar un evento asociado a esta foto
    const event = eventRepo.create({
      type: 'photo',
      payload: {
        image_path: relativeUrl,
        photo_id: savedPhoto.id,
      },
      camera,
    });
    const savedEvent = await eventRepo.save(event);

    res.status(201).json({
      ok: true,
      imageUrl: relativeUrl,
      photo: savedPhoto,
      event: savedEvent,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error receiving photo', err);
    res.status(500).json({ error: 'Internal server error' });
  }
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

// Simple endpoints for the frontend to read current state
app.get('/api/cameras', async (_req, res) => {
  try {
    const cameraRepo = AppDataSource.getRepository('Camera');
    const cameras = await cameraRepo.find({ order: { created_at: 'ASC' } });
    res.json(cameras);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error listing cameras', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a camera (e.g. from the frontend config screen)
app.post('/api/cameras', async (req, res) => {
  try {
    const cameraRepo = AppDataSource.getRepository('Camera');
    const {
      id,
      name,
      location,
      status = 'waiting',
      type = 'USB',
      url = '',
      enabled = true,
      thumbnail = null,
      coordinates = null,
    } = req.body || {};

    const cameraId = id || Date.now().toString();

    const camera = cameraRepo.create({
      id: cameraId,
      name: name || `Camera ${cameraId}`,
      location: location || '',
      status,
      type,
      url,
      enabled,
      thumbnail,
      coordinates,
      last_seen_at: null,
    });

    const saved = await cameraRepo.save(camera);
    res.status(201).json(saved);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error creating camera', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update camera configuration
app.put('/api/cameras/:cameraId', async (req, res) => {
  try {
    const cameraRepo = AppDataSource.getRepository('Camera');
    const { cameraId } = req.params;
    const {
      name,
      location,
      status,
      type,
      url,
      enabled,
      thumbnail,
      coordinates,
    } = req.body || {};

    const camera = await cameraRepo.findOne({ where: { id: cameraId } });
    if (!camera) {
      return res.status(404).json({ error: 'Camera not found' });
    }

    if (typeof name === 'string') camera.name = name;
    if (typeof location === 'string') camera.location = location;
    if (typeof status === 'string') camera.status = status;
    if (typeof type === 'string') camera.type = type;
    if (typeof url === 'string') camera.url = url;
    if (typeof enabled === 'boolean') camera.enabled = enabled;
    if (typeof thumbnail === 'string' || thumbnail === null) camera.thumbnail = thumbnail;
    if (coordinates !== undefined) camera.coordinates = coordinates;

    const saved = await cameraRepo.save(camera);
    res.json(saved);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error updating camera', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete camera
app.delete('/api/cameras/:cameraId', async (req, res) => {
  try {
    const cameraRepo = AppDataSource.getRepository('Camera');
    const { cameraId } = req.params;

    const camera = await cameraRepo.findOne({ where: { id: cameraId } });
    if (!camera) {
      return res.status(404).json({ error: 'Camera not found' });
    }

    await cameraRepo.remove(camera);
    res.status(204).send();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error deleting camera', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Events (photo history) for a given camera
app.get('/api/cameras/:cameraId/events', async (req, res) => {
  try {
    const { cameraId } = req.params;
    const photoRepo = AppDataSource.getRepository('Photo');
    const cameraRepo = AppDataSource.getRepository('Camera');

    const camera = await cameraRepo.findOne({ where: { id: cameraId } });
    if (!camera) {
      return res.status(404).json({ error: 'Camera not found' });
    }

    const photos = await photoRepo.find({
      where: { camera: { id: cameraId } },
      order: { captured_at: 'DESC' },
      relations: ['camera'],
    });

    const events = photos.map((p) => ({
      id: p.id,
      cameraId,
      cameraName: p.camera.name,
      timestamp: p.captured_at,
      thumbnail: p.thumbnail_path || p.image_path,
      imageUrl: p.image_path,
    }));

    res.json(events);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error listing camera events', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Global events feed (for the Events view)
app.get('/api/events', async (_req, res) => {
  try {
    const photoRepo = AppDataSource.getRepository('Photo');
    const photos = await photoRepo.find({
      relations: ['camera'],
      order: { captured_at: 'DESC' },
      take: 200,
    });

    const events = photos.map((p) => ({
      id: p.id,
      cameraId: p.camera.id,
      cameraName: p.camera.name,
      timestamp: p.captured_at,
      thumbnail: p.thumbnail_path || p.image_path,
      imageUrl: p.image_path,
    }));

    res.json(events);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error listing events', err);
    res.status(500).json({ error: 'Internal server error' });
  }
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

// Start the HTTP + WebSocket server only after the database is ready
AppDataSource.initialize()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('Database connection established');
    server.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize database', err);
    process.exit(1);
  });


