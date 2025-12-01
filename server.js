const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const multer = require('multer');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const { AppDataSource } = require('./db/data-source');
const { Not, IsNull } = require('typeorm');

const app = express();
const PORT = process.env.PORT || 3000;
const STREAM_FPS = Number(process.env.STREAM_FPS || '1'); // fps usados al generar el MP4
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

// HTTP server (needed to attach WebSocket server)
const server = http.createServer(app);

// Middlewares
app.use(express.json({ limit: '10mb' }));

// In-memory stores for demo / development (non-persistent).
const latestFrames = new Map(); // cameraId -> { buffer, timestamp }
const cameraActions = new Map(); // cameraId -> { photoRequested?: boolean, photoRequestedAt?: number, streamUntil?: number, currentStreamSessionId?: string }

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

    // Actualizar último "ping" de la cámara
    camera.last_seen_at = new Date();
    await cameraRepo.save(camera);

    res.status(201).json({ ok: true, sample: saved });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error receiving energy data', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Receive data usage metrics from a Raspberry Pi
app.post('/api/cameras/:cameraId/data-usage', async (req, res) => {
  try {
    const dataUsageRepo = AppDataSource.getRepository('DataUsageEvent');
    const cameraRepo = AppDataSource.getRepository('Camera');
    const { cameraId } = req.params;
    const { type, bytes } = req.body || {};

    const allowedTypes = ['detection', 'photo', 'stream', 'system'];
    if (!allowedTypes.includes(type) || typeof bytes !== 'number' || bytes <= 0) {
      return res.status(400).json({
        error: 'type must be one of detection|photo|stream|system and bytes must be > 0',
      });
    }

    const camera = await cameraRepo.findOne({ where: { id: cameraId } });

    const event = dataUsageRepo.create({
      type,
      bytes,
      camera,
    });

    const saved = await dataUsageRepo.save(event);

    // Actualizar último "ping" de la cámara
    if (camera) {
      camera.last_seen_at = new Date();
      await cameraRepo.save(camera);
    }

    res.status(201).json({ ok: true, event: saved });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error receiving data usage event', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Configure storage for photo uploads
const uploadsRoot = path.join(__dirname, 'uploads');
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const { cameraId } = req.params;
    const cameraDir = path.join(uploadsRoot, cameraId || 'unknown', 'photos');
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

// Multer en memoria para frames de streaming (no queremos escribirlos a disco)
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024, // 500KB por frame debería ser suficiente
  },
});

// ----------------------------
// Helpers para generación de video a partir de frames
// ----------------------------

const generateVideoForSession = async (sessionId) => {
  try {
    const sessionRepo = AppDataSource.getRepository('StreamSession');
    const session = await sessionRepo.findOne({
      where: { id: sessionId },
      relations: ['camera'],
    });
    if (!session) {
      return;
    }

    const cameraId = session.camera ? session.camera.id : 'unknown';
    const videoDir = path.join(uploadsRoot, cameraId || 'unknown', 'videos', sessionId);

    if (!fs.existsSync(videoDir)) {
      session.status = 'failed';
      session.ended_at = new Date();
      await sessionRepo.save(session);
      return;
    }

    const files = fs
      .readdirSync(videoDir)
      .filter((f) => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg'));

    if (!files.length) {
      session.status = 'failed';
      session.ended_at = new Date();
      await sessionRepo.save(session);
      return;
    }

    const outputFile = 'stream.mp4';
    const outputPath = path.join(videoDir, outputFile);

    const ffmpegArgs = [
      '-y',
      '-framerate',
      String(STREAM_FPS),
      '-pattern_type',
      'glob',
      '-i',
      '*.jpg',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      outputFile,
    ];

    // eslint-disable-next-line no-console
    console.log(
      'Iniciando generación de video con ffmpeg para sesión',
      sessionId,
      'en',
      videoDir
    );

    const child = spawn(FFMPEG_PATH, ffmpegArgs, { cwd: videoDir });

    child.on('close', async (code) => {
      if (code === 0) {
        session.video_path = `/uploads/${cameraId}/videos/${sessionId}/${outputFile}`;
        session.status = 'completed';
        session.ended_at = new Date();
        await sessionRepo.save(session);
        // eslint-disable-next-line no-console
        console.log('Video generado correctamente para sesión', sessionId);
      } else {
        session.status = 'failed';
        session.ended_at = new Date();
        await sessionRepo.save(session);
        // eslint-disable-next-line no-console
        console.error('ffmpeg terminó con código', code, 'para sesión', sessionId);
      }
    });

    child.on('error', async (err) => {
      // eslint-disable-next-line no-console
      console.error('Error ejecutando ffmpeg para sesión', sessionId, err);
      session.status = 'failed';
      session.ended_at = new Date();
      await sessionRepo.save(session);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error en generateVideoForSession', err);
  }
};

const scheduleVideoGeneration = (sessionId, durationSeconds) => {
  const bufferSeconds = 5; // margen para últimos frames
  const delayMs = (durationSeconds + bufferSeconds) * 1000;
  setTimeout(() => {
    generateVideoForSession(sessionId);
  }, delayMs);
};

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
    if (!camera) {
      return res.status(404).json({ error: 'Camera not found' });
    }

    const relativeUrl = `/uploads/${cameraId}/photos/${req.file.filename}`;

    // Guardar la foto en la base de datos
    const photo = photoRepo.create({
      image_path: relativeUrl,
      thumbnail_path: relativeUrl,
      trigger_source: 'device',
      captured_at: new Date(),
      camera,
    });
    const savedPhoto = await photoRepo.save(photo);

    // Actualizar thumbnail de la cámara con la última foto
    camera.thumbnail = relativeUrl;
    await cameraRepo.save(camera);

    // Registrar un evento asociado a esta foto
    const event = eventRepo.create({
      type: 'photo',
      filepath: relativeUrl,
      payload: {
        image_path: relativeUrl,
        photo_id: savedPhoto.id,
      },
      camera,
    });
    const savedEvent = await eventRepo.save(event);

    // Notificar a los clientes frontend por WebSocket
    broadcastEvent({
      type: 'photo',
      id: savedEvent.id,
      cameraId: camera.id,
      cameraName: camera.name,
      timestamp: savedEvent.created_at || new Date(),
      imageUrl: relativeUrl,
      thumbnail: relativeUrl,
    });

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

// Última foto registrada para una cámara
app.get('/api/cameras/:cameraId/latest-photo', async (req, res) => {
  try {
    const { cameraId } = req.params;
    const photoRepo = AppDataSource.getRepository('Photo');
    const cameraRepo = AppDataSource.getRepository('Camera');

    const camera = await cameraRepo.findOne({ where: { id: cameraId } });
    if (!camera) {
      return res.status(404).json({ error: 'Camera not found' });
    }

    const photo = await photoRepo.findOne({
      where: { camera: { id: cameraId } },
      order: { captured_at: 'DESC' },
      relations: ['camera'],
    });

    if (!photo) {
      return res.status(404).json({ error: 'No photos for this camera' });
    }

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    res.json({
      id: photo.id,
      cameraId: camera.id,
      cameraName: camera.name,
      imageUrl: photo.image_path,
      thumbnail: photo.thumbnail_path || photo.image_path,
      capturedAt: photo.captured_at,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error fetching latest photo', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint HTTP para obtener el último frame "en vivo" de una cámara como imagen JPEG.
// Solo devuelve frames provenientes del streaming; si no hay ninguno, responde 404.
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

// Endpoint para recibir frames de streaming vía HTTP (alternativa al WebSocket).
// POST /api/cameras/:cameraId/live-frame  (multipart/form-data, campo "image")
app.post('/api/cameras/:cameraId/live-frame', memoryUpload.single('image'), async (req, res) => {
  try {
    const { cameraId } = req.params;

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Missing image file in "image" field' });
    }

    // Actualizar último frame en memoria
    latestFrames.set(cameraId, {
      buffer: req.file.buffer,
      timestamp: Date.now(),
    });

    // Guardar frame en disco dentro de una carpeta de vídeo por sesión
    const actions = cameraActions.get(cameraId) || {};
    const sessionId = actions.currentStreamSessionId || `${Date.now()}`;
    const videoDir = path.join(uploadsRoot, cameraId || 'unknown', 'videos', sessionId);
    fs.mkdirSync(videoDir, { recursive: true });
    const filename = `${Date.now()}.jpg`;
    const fullPath = path.join(videoDir, filename);

    try {
      fs.writeFileSync(fullPath, req.file.buffer);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error writing video frame to disk', err);
    }

    // Actualizar métricas de la sesión en la base de datos
    if (actions.currentStreamSessionId) {
      try {
        const sessionRepo = AppDataSource.getRepository('StreamSession');
        const session = await sessionRepo.findOne({
          where: { id: actions.currentStreamSessionId },
        });
        if (session) {
          session.frame_count += 1;
          session.bytes_sent = Number(session.bytes_sent || 0) + req.file.buffer.length;
          await sessionRepo.save(session);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error updating stream session metrics', err);
      }
    }

    return res.json({ ok: true, sessionId });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error handling live-frame upload', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Permite regenerar el video de una sesión existente sin necesidad de un nuevo streaming.
app.post('/api/streams/:sessionId/generate-video', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionRepo = AppDataSource.getRepository('StreamSession');
    const session = await sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      return res.status(404).json({ error: 'StreamSession not found' });
    }

    generateVideoForSession(sessionId);
    return res.status(202).json({ ok: true, message: 'Video generation started', sessionId });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error starting manual video generation', err);
    res.status(500).json({ error: 'Internal server error' });
  }
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
app.post('/api/cameras/:cameraId/request-stream', async (req, res) => {
  try {
    const { cameraId } = req.params;
    const { durationSeconds = 300 } = req.body || {};

    const cameraRepo = AppDataSource.getRepository('Camera');
    const sessionRepo = AppDataSource.getRepository('StreamSession');

    const camera = await cameraRepo.findOne({ where: { id: cameraId } });
    if (!camera) {
      return res.status(404).json({ error: 'Camera not found' });
    }

    const now = Date.now();
    const until = now + durationSeconds * 1000;

    // Creamos una sesión de streaming en la base de datos
    const session = sessionRepo.create({
      camera,
      started_at: new Date(now),
      ended_at: null,
      initiated_by: 'user',
      video_path: null,
      frame_count: 0,
      bytes_sent: 0,
      status: 'active',
    });
    const savedSession = await sessionRepo.save(session);

    const actions = cameraActions.get(cameraId) || {};
    actions.streamUntil = until;
    actions.currentStreamSessionId = savedSession.id;
    cameraActions.set(cameraId, actions);

    // Programamos generación del MP4 para cuando termine el streaming (no bloquea el backend)
    scheduleVideoGeneration(savedSession.id, durationSeconds);

    res.json({
      ok: true,
      cameraId,
      action: 'stream',
      streamUntil: new Date(until).toISOString(),
      durationSeconds,
      sessionId: savedSession.id,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error requesting stream', err);
    res.status(500).json({ error: 'Internal server error' });
  }
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

    const now = Date.now();
    const onlineTimeoutSeconds = Number(process.env.ONLINE_TIMEOUT_SECONDS || '120');

    const mapped = cameras.map((c) => {
      let status = c.status;

      if (!c.enabled) {
        status = 'disabled';
      } else if (c.last_seen_at) {
        const lastSeen = new Date(c.last_seen_at).getTime();
        const diffSeconds = (now - lastSeen) / 1000;
        status = diffSeconds <= onlineTimeoutSeconds ? 'online' : 'waiting';
      } else {
        status = 'waiting';
      }

      return {
        ...c,
        status,
      };
    });

    res.json(mapped);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error listing cameras', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Energy history for all cameras
app.get('/api/energy', async (_req, res) => {
  try {
    const energyRepo = AppDataSource.getRepository('EnergySample');
    const samples = await energyRepo.find({
      relations: ['camera'],
      order: { measured_at: 'DESC' },
      take: 500,
    });

    const mapped = samples.map((s) => ({
      voltage: s.voltage,
      current: s.current,
      watts: s.watts,
      cpuTemp: s.cpu_temp,
      timestamp: s.measured_at,
      cameraId: s.camera ? s.camera.id : '',
      cameraName: s.camera ? s.camera.name : 'Sin cámara',
    }));

    res.json(mapped);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error listing energy samples', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Data usage events history
app.get('/api/data-usage', async (_req, res) => {
  try {
    const dataUsageRepo = AppDataSource.getRepository('DataUsageEvent');
    const events = await dataUsageRepo.find({
      relations: ['camera'],
      order: { created_at: 'DESC' },
      take: 1000,
    });

    const mapped = events.map((e) => ({
      id: e.id,
      type: e.type,
      bytes: Number(e.bytes || 0),
      timestamp: e.created_at,
      cameraId: e.camera ? e.camera.id : undefined,
    }));

    res.json(mapped);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error listing data usage events', err);
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
      enabled = true,
      coordinates = null,
    } = req.body || {};

    const cameraId = id || Date.now().toString();
    const generatedUrl = `/uploads/${cameraId}`;

    const camera = cameraRepo.create({
      id: cameraId,
      name: name || `Camera ${cameraId}`,
      location: location || '',
      status: 'waiting',
      type: 'USB',
      url: generatedUrl,
      enabled,
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
    const eventRepo = AppDataSource.getRepository('Event');

    const events = await eventRepo.find({
      where: { type: 'photo', camera: { id: cameraId } },
      relations: ['camera'],
      order: { created_at: 'DESC' },
    });

    const mapped = events.map((e) => ({
      id: e.id,
      cameraId: e.camera ? e.camera.id : '',
      cameraName: e.camera ? e.camera.name : 'Sin cámara',
      timestamp: e.created_at,
      thumbnail: e.filepath || (e.payload && e.payload.image_path) || '',
      imageUrl: e.filepath || (e.payload && e.payload.image_path) || '',
    }));

    res.json(mapped);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error listing camera events', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Global events feed (for the Events view)
// Combina:
//  - Eventos de tipo "photo" almacenados en la tabla events
//  - Sesiones de streaming completadas con video_path en stream_sessions
// Además, filtra cualquier evento que no tenga media válida (thumbnail + image/video).
app.get('/api/events', async (_req, res) => {
  try {
    const eventRepo = AppDataSource.getRepository('Event');
    const sessionRepo = AppDataSource.getRepository('StreamSession');

    const photoEvents = await eventRepo.find({
      where: { type: 'photo' },
      relations: ['camera'],
      order: { created_at: 'DESC' },
      take: 200,
    });

    const videoSessions = await sessionRepo.find({
      where: { video_path: Not(IsNull()) },
      relations: ['camera'],
      order: { created_at: 'DESC' },
      take: 200,
    });

    const photoMapped = photoEvents.map((e) => ({
      id: e.id,
      cameraId: e.camera ? e.camera.id : '',
      cameraName: e.camera ? e.camera.name : 'Sin cámara',
      timestamp: e.created_at,
      thumbnail: e.filepath || (e.payload && e.payload.image_path) || '',
      imageUrl: e.filepath || (e.payload && e.payload.image_path) || '',
      videoUrl: null,
      mediaType: 'photo',
    }));

    const videoMapped = videoSessions.map((s) => {
      const cameraId = s.camera ? s.camera.id : '';
      const cameraName = s.camera ? s.camera.name : 'Sin cámara';
      const timestamp = s.created_at || s.started_at || new Date();

      let thumbnail = '';
      try {
        const videoDir = path.join(uploadsRoot, cameraId || 'unknown', 'videos', s.id);
        if (fs.existsSync(videoDir)) {
          const files = fs
            .readdirSync(videoDir)
            .filter(
              (f) =>
                f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg')
            )
            .sort();
          if (files.length > 0) {
            const midIndex = Math.floor(files.length / 2);
            const thumbFile = files[midIndex] || files[0];
            thumbnail = `/uploads/${cameraId}/videos/${s.id}/${thumbFile}`;
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error leyendo thumbnails de vídeo para sesión', s.id, err);
      }

      return {
        id: s.id,
        cameraId,
        cameraName,
        timestamp,
        thumbnail,
        imageUrl: thumbnail,
        videoUrl: s.video_path || '',
        mediaType: 'video',
      };
    });

    // Unir ambos tipos de eventos y filtrar los que no tengan media válida
    const all = [...photoMapped, ...videoMapped].filter((e) => {
      if (e.mediaType === 'video') {
        return !!e.videoUrl;
      }
      return !!e.imageUrl;
    });

    // Ordenar por fecha descendente y limitar a los más recientes
    const sorted = all.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    res.json(sorted.slice(0, 200));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error listing events', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// WebSocket server para streaming ligero de frames desde la Raspberry
// La Raspberry se conecta a: ws://<host>/ws/camera-stream?cameraId=cam-01
// y envía frames JPEG ya comprimidos (binary).
const wss = new WebSocket.Server({
  server,
  path: '/ws/camera-stream',
  maxPayload: 50 * 1024 * 1024,
  perMessageDeflate: false,
});

// WebSocket server para eventos hacia el frontend (fotos, etc.)
const eventsWss = new WebSocket.Server({ server, path: '/ws/events' });

const broadcastEvent = (payload) => {
  const data = JSON.stringify(payload);
  eventsWss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const cameraId = url.searchParams.get('cameraId');

  if (!cameraId) {
    ws.close(1008, 'cameraId query parameter is required');
    return;
  }

  // eslint-disable-next-line no-console
  console.log('[WS] Nueva conexión de streaming para cámara', cameraId);

  ws.on('message', (data, isBinary) => {
    // Aceptamos tanto binario puro como texto y lo convertimos siempre a Buffer
    const buffer = isBinary || Buffer.isBuffer(data) ? data : Buffer.from(data);

    latestFrames.set(cameraId, {
      buffer,
      timestamp: Date.now(),
    });

    // eslint-disable-next-line no-console
    console.log('[WS] Frame recibido de cámara', cameraId, 'bytes:', buffer.length);
  });

  ws.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[WS] Error en streaming de cámara', cameraId, err);
  });

  ws.on('close', (code, reason) => {
    // eslint-disable-next-line no-console
    console.log(
      '[WS] Conexión de streaming cerrada para cámara',
      cameraId,
      'code:',
      code,
      'reason:',
      reason.toString()
    );
    // Opcional: podríamos limpiar latestFrames si queremos que deje de estar disponible.
    // latestFrames.delete(cameraId);
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


