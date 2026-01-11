const cors = require('cors');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cloudinary = require('cloudinary').v2;

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
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || '';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || '';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || '';

if (!WORKER_SECRET) {
  console.error('❌ VIDEO_WORKER_SECRET is required for the worker.');
  process.exit(1);
}

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error('❌ Cloudinary env vars are required on the worker (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).');
  process.exit(1);
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

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

function runCmd(cmd, args, { onLine } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';

    p.stdout.on('data', (d) => {
      const s = d.toString();
      stdout += s;
      if (onLine) s.split('\n').forEach((line) => line && onLine(line));
    });
    p.stderr.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      if (onLine) s.split('\n').forEach((line) => line && onLine(line));
    });

    p.on('error', (err) => reject(err));
    p.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      return reject(new Error(`${cmd} exited with code ${code}\n${stderr || stdout}`));
    });
  });
}

async function postJobProgress(jobId, payload) {
  return fetchJson(`${RENDER_API_BASE}/api/video-jobs/${jobId}/progress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Secret': WORKER_SECRET,
    },
    body: JSON.stringify({ workerId: WORKER_ID, ...payload }),
  });
}

async function postJobComplete(jobId, payload) {
  return fetchJson(`${RENDER_API_BASE}/api/video-jobs/${jobId}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Secret': WORKER_SECRET,
    },
    body: JSON.stringify(payload),
  });
}

async function postJobFail(jobId, payload) {
  return fetchJson(`${RENDER_API_BASE}/api/video-jobs/${jobId}/fail`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Secret': WORKER_SECRET,
    },
    body: JSON.stringify(payload),
  });
}

async function getLatestJobStatusByItem(itemNumber) {
  // Worker-safe route (doesn't require user auth)
  const res = await fetch(`${RENDER_API_BASE}/api/video-jobs/worker/status/${itemNumber}`, {
    headers: { 'X-Worker-Secret': WORKER_SECRET },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json().catch(() => null);
}

async function isSuperseded(jobId, itemNumber) {
  const status = await getLatestJobStatusByItem(itemNumber);
  if (!status?.jobId) return false;
  return String(status.jobId) !== String(jobId);
}

async function processAndUpload(jobId, itemNumber, inputPath) {
  console.log(`🎬 Starting processAndUpload for job ${jobId}, item ${itemNumber}, input: ${inputPath}`);
  
  // If a new upload starts for this item, stop as soon as possible.
  if (await isSuperseded(jobId, itemNumber)) {
    throw new Error('Job superseded by a newer upload');
  }

  const jobDir = uploadsDirForJob(jobId);
  const outFull = path.join(jobDir, `${itemNumber}_full.mp4`);
  const outIcon = path.join(jobDir, `${itemNumber}_icon.mp4`);

  console.log(`📐 Starting preprocessing (crop/trim/encode) for job ${jobId}...`);
  await postJobProgress(jobId, {
    status: 'processing',
    stage: 'preprocessing',
    progress: 10,
    message: 'Cropping/trimming/encoding locally...',
  });

  // Minimal pipeline:
  // - Skip first 2 seconds
  // - Trim to ~15.58s
  // - Crop center square based on input height
  // - Encode h264 mp4 faststart
  const probe = await runCmd('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'json',
    inputPath,
  ]);
  const probeJson = JSON.parse(probe.stdout || '{}');
  const stream = probeJson?.streams?.[0];
  if (!stream?.width || !stream?.height) throw new Error('ffprobe could not read video dimensions');

  const w = Number(stream.width);
  const h = Number(stream.height);
  const cropSize = h;
  const cropX = Math.max(0, Math.floor((w - cropSize) / 2));

  const cropFilter = `crop=${cropSize}:${cropSize}:${cropX}:0`;
  await runCmd('ffmpeg', [
    '-y',
    '-ss',
    '2',
    '-i',
    inputPath,
    '-t',
    '15.58',
    '-vf',
    cropFilter,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outFull,
  ]);

  console.log(`✅ Main video encoding complete for job ${jobId}, starting icon generation...`);
  await postJobProgress(jobId, {
    status: 'processing',
    stage: 'icon-generation',
    progress: 55,
    message: 'Generating icon video...',
  });

  // Icon: downscale and higher CRF to stay small-ish.
  console.log(`🎨 Generating icon video for job ${jobId}...`);
  await runCmd('ffmpeg', [
    '-y',
    '-i',
    outFull,
    '-vf',
    'scale=512:512',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '28',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outIcon,
  ]);

  if (await isSuperseded(jobId, itemNumber)) {
    throw new Error('Job superseded by a newer upload');
  }

  console.log(`✅ Icon video generated for job ${jobId}, uploading to Cloudinary...`);
  await postJobProgress(jobId, {
    status: 'cloudinary-upload',
    stage: 'cloudinary-upload',
    progress: 80,
    message: 'Uploading processed videos to Cloudinary...',
  });

  // Upload to Cloudinary
  console.log(`☁️ Uploading main video to Cloudinary for job ${jobId}...`);
  const mainVideoResult = await cloudinary.uploader.upload(outFull, {
    folder: 'echo-catering/videos',
    public_id: `${itemNumber}_full`,
    resource_type: 'video',
    overwrite: true,
  });
  if (!mainVideoResult?.secure_url || !mainVideoResult?.public_id) {
    throw new Error('Cloudinary main upload failed: missing secure_url/public_id');
  }

  let iconVideoResult = null;
  try {
    console.log(`☁️ Uploading icon video to Cloudinary for job ${jobId}...`);
    iconVideoResult = await cloudinary.uploader.upload(outIcon, {
      folder: 'echo-catering/videos',
      public_id: `${itemNumber}_icon`,
      resource_type: 'video',
      overwrite: true,
    });
    console.log(`✅ Icon video uploaded to Cloudinary for job ${jobId}`);
  } catch (err) {
    // Non-fatal: main video is the critical asset.
    console.warn(`⚠️ Icon upload failed (non-fatal) for job ${jobId}:`, err.message);
  }

  await postJobProgress(jobId, {
    status: 'processing',
    stage: 'finalizing',
    progress: 95,
    message: 'Finalizing...',
  });

  console.log(`✅ All uploads complete for job ${jobId}, marking job complete...`);
  await postJobComplete(jobId, {
    result: {
      cloudinaryVideoUrl: mainVideoResult.secure_url,
      cloudinaryVideoPublicId: mainVideoResult.public_id,
      cloudinaryIconUrl: iconVideoResult?.secure_url || '',
      cloudinaryIconPublicId: iconVideoResult?.public_id || '',
    },
    message: 'Complete',
  });

  // Cleanup local job folder
  console.log(`🧹 Cleaning up local files for job ${jobId}...`);
  await fs.promises.rm(jobDir, { recursive: true, force: true }).catch(() => {});
  console.log(`🎉 Job ${jobId} completed successfully!`);
}

const runningJobs = new Set();

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
  console.log(`📤 Upload request received for job ${jobId}`);
  try {
    const tokenHeader =
      String(req.headers['x-upload-token'] || '').trim() ||
      String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

    if (!tokenHeader) {
      console.error(`❌ Upload request for job ${jobId} rejected: Missing upload token`);
      return res.status(401).json({ ok: false, message: 'Missing upload token' });
    }

    console.log(`🔐 Verifying upload token for job ${jobId}...`);
    // Verify token with Render backend and get itemNumber
    const verify = await fetchJson(`${RENDER_API_BASE}/api/video-jobs/${jobId}/verify-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenHeader }),
    });

    if (!req.file) {
      console.error(`❌ Upload request for job ${jobId} rejected: No file uploaded`);
      return res.status(400).json({ ok: false, message: 'No file uploaded' });
    }

    console.log(`✅ Token verified for job ${jobId}, file received: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);

    const itemNumber = Number(verify?.itemNumber);
    if (!Number.isFinite(itemNumber) || itemNumber <= 0) {
      console.error(`❌ Upload request for job ${jobId} rejected: Invalid itemNumber from verify: ${verify?.itemNumber}`);
      return res.status(400).json({ ok: false, message: 'Invalid itemNumber from verify' });
    }

    console.log(`📥 Upload received for job ${jobId}, item ${itemNumber}, file size: ${(req.file.size / 1024 / 1024).toFixed(2)} MB, path: ${req.file.path}`);

    // Mark job as uploaded (DB-backed status)
    await postJobProgress(jobId, {
      status: 'uploaded',
      stage: 'uploaded',
      progress: 5,
      message: 'Upload received by local worker',
    });

    // Start processing asynchronously (don't block the HTTP response)
    if (!runningJobs.has(jobId)) {
      runningJobs.add(jobId);
      console.log(`🚀 Starting processing for job ${jobId}, item ${itemNumber}...`);
      processAndUpload(jobId, itemNumber, req.file.path)
        .catch(async (err) => {
          console.error(`❌ Job ${jobId} failed:`, err.message);
          try {
            await postJobFail(jobId, { error: err.message, message: 'Video processing failed' });
          } catch (postErr) {
            console.warn('⚠️ Failed to post job failure:', postErr.message);
          }
        })
        .finally(() => {
          runningJobs.delete(jobId);
          console.log(`✅ Job ${jobId} finished processing`);
        });
    } else {
      console.warn(`⚠️ Job ${jobId} is already running, skipping duplicate start`);
    }

    return res.json({ ok: true, jobId, itemNumber });
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


