const cors = require('cors');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

/**
 * Local Video Worker (runs on your Mac)
 *
 * Responsibilities (Step 2):
 * - Expose HTTPS-reachable upload endpoint via Cloudflare Tunnel.
 * - Verify upload token with Render backend.
 * - Persist uploaded raw file locally (NOT Cloudinary).
 * - Heartbeat every 3 seconds to Render backend so admin UI can show Online/Offline.
 *
 * Next step (Step 4) will add FFmpeg processing + Cloudinary outputs.
 */

const app = express();

const PORT = Number(process.env.WORKER_PORT || 8787);
const WORKER_ID = process.env.WORKER_ID || 'andy-mac-worker';
const RENDER_API_BASE = (process.env.RENDER_API_BASE || 'https://echocatering.onrender.com').replace(/\/+$/, '');
const WORKER_SECRET = process.env.VIDEO_WORKER_SECRET || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://echocatering.onrender.com';

if (!WORKER_SECRET) {
  console.error('❌ VIDEO_WORKER_SECRET is required for the worker.');
  process.exit(1);
}

app.use(
  cors({
    origin: ALLOWED_ORIGIN,
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Upload-Token'],
  })
);

app.use(express.json({ limit: '2mb' }));

function uploadsDirForJob(jobId) {
  return path.join(__dirname, 'uploads', String(jobId));
}

const uploadStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const jobId = req.params.jobId;
      const dir = uploadsDirForJob(jobId);
      await fs.promises.mkdir(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mov';
    cb(null, `source${ext}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: {
    files: 1,
    fileSize: 250 * 1024 * 1024, // 250MB guardrail
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|mov|avi|webm|mkv/i;
    if (allowedTypes.test(path.extname(file.originalname))) return cb(null, true);
    return cb(new Error('Only video files are allowed'));
  },
});

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `${res.status} ${res.statusText}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function heartbeatOnce() {
  try {
    await fetchJson(`${RENDER_API_BASE}/api/video-worker/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': WORKER_SECRET,
      },
      body: JSON.stringify({ workerId: WORKER_ID }),
    });
  } catch (err) {
    console.warn('⚠️ Heartbeat failed:', err.message);
  }
}

setInterval(heartbeatOnce, 3000);
heartbeatOnce();

// Health
app.get('/health', (req, res) => {
  res.json({ ok: true, workerId: WORKER_ID, time: new Date().toISOString() });
});

// Upload raw video for a job
// POST /upload/:jobId  (multipart: video=<file>, header X-Upload-Token or Authorization: Bearer <token>)
app.post('/upload/:jobId', upload.single('video'), async (req, res) => {
  const jobId = req.params.jobId;
  try {
    const tokenHeader =
      String(req.headers['x-upload-token'] || '').trim() ||
      String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

    if (!tokenHeader) {
      return res.status(401).json({ ok: false, message: 'Missing upload token' });
    }

    // Verify token with Render backend
    await fetchJson(`${RENDER_API_BASE}/api/video-jobs/${jobId}/verify-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenHeader }),
    });

    if (!req.file) {
      return res.status(400).json({ ok: false, message: 'No file uploaded' });
    }

    // Mark job as uploaded (DB-backed status)
    await fetchJson(`${RENDER_API_BASE}/api/video-jobs/${jobId}/progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': WORKER_SECRET,
      },
      body: JSON.stringify({
        workerId: WORKER_ID,
        status: 'uploaded',
        stage: 'uploaded',
        progress: 5,
        message: 'Upload received by local worker',
      }),
    });

    return res.json({
      ok: true,
      jobId,
      storedPath: req.file.path,
      bytes: req.file.size,
    });
  } catch (err) {
    console.error('❌ Upload failed:', err.message);
    return res.status(err.status || 500).json({ ok: false, message: err.message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log('✅ Local video worker listening:', { port: PORT, workerId: WORKER_ID });
  console.log('   Render API:', RENDER_API_BASE);
  console.log('   Allowed origin:', ALLOWED_ORIGIN);
});


