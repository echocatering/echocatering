const cors = require('cors');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cloudinary = require('cloudinary').v2;
const sharp = require('sharp');

// Load environment variables from worker/local.env if it exists
// This allows running the worker directly without needing to source the env file in the shell
try {
  require('dotenv').config({ path: path.join(__dirname, 'local.env') });
} catch (err) {
  // dotenv is optional - env vars might be set by the shell instead
  // If dotenv fails, we'll just use whatever is in process.env
}

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
    origin: (origin, callback) => {
      // Allow multiple origins from ALLOWED_ORIGIN (comma-separated)
      const allowedOrigins = ALLOWED_ORIGIN.split(',').map(o => o.trim());
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS not allowed for origin: ${origin}`));
      }
    },
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Upload-Token'],
  })
);

app.use(express.json({ limit: '2mb' }));

// Track in-flight work so we can cancel immediately when a new job supersedes the current one.
// itemNumber -> { jobId, abortController, children:Set<ChildProcess>, jobDir, uploadedPublicIds:Set<string> }
const activeByItem = new Map();
const activeByJobId = new Map();

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

function runCmd(cmd, args, { onLine, signal, onChild } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    if (onChild) onChild(p);
    let stderr = '';
    let stdout = '';

    const abortHandler = () => {
      try {
        p.kill('SIGTERM');
        setTimeout(() => {
          try {
            p.kill('SIGKILL');
          } catch {}
        }, 1500);
      } catch {}
    };
    if (signal) {
      if (signal.aborted) abortHandler();
      signal.addEventListener('abort', abortHandler, { once: true });
    }

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
      if (signal) signal.removeEventListener('abort', abortHandler);
      if (signal?.aborted) {
        const e = new Error(`${cmd} aborted`);
        e.name = 'AbortError';
        return reject(e);
      }
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

async function cancelActiveJobForItem(itemNumber, reason) {
  const active = activeByItem.get(itemNumber);
  if (!active) return;
  console.warn(`🛑 Cancelling active job for item ${itemNumber}:`, { jobId: active.jobId, reason });
  try {
    active.abortController.abort();
  } catch {}
  try {
    await postJobProgress(active.jobId, {
      status: 'superseded',
      stage: 'superseded',
      progress: 0,
      message: reason || 'Superseded by a newer upload',
    });
  } catch {}
  // Best-effort cleanup of local files
  try {
    if (active.jobDir) await fs.promises.rm(active.jobDir, { recursive: true, force: true });
  } catch {}
  activeByItem.delete(itemNumber);
  activeByJobId.delete(active.jobId);
}

async function sampleTopRowWhiteBalanceScale(inputPath, { signal, onChild } = {}) {
  const tempFramePath = path.join(path.dirname(inputPath), `wb_frame_${Date.now()}.png`);
  try {
    await runCmd('ffmpeg', ['-y', '-i', inputPath, '-frames:v', '1', tempFramePath], { signal, onChild });
    const { data, info } = await sharp(tempFramePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    if (!width || !height || channels < 3) throw new Error('Could not read frame pixels for white balance');

    let topRowMax = -Infinity;
    const stride = channels;
    for (let idx = 0; idx < data.length; idx += stride) {
      const pixelIndex = idx / stride;
      const y = Math.floor(pixelIndex / width);
      if (y !== 0) continue;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const maxChannel = Math.max(r, g, b);
      if (maxChannel > topRowMax) topRowMax = maxChannel;
    }
    if (!Number.isFinite(topRowMax) || topRowMax <= 0) throw new Error('Brightest pixel on top row not found');
    return { scale: 255 / topRowMax };
  } finally {
    fs.promises.unlink(tempFramePath).catch(() => {});
  }
}

async function applyUniformGain(inputPath, outputPath, scale, { signal, onChild } = {}) {
  const scaleStr = Number(scale).toFixed(6);
  await runCmd(
    'ffmpeg',
    [
      '-y',
      '-i',
      inputPath,
      '-vf',
      `colorchannelmixer=rr=${scaleStr}:gg=${scaleStr}:bb=${scaleStr}`,
      '-c:v',
      'prores_ks',
      '-profile:v',
      '3',
      '-c:a',
      'copy',
      outputPath,
    ],
    { signal, onChild }
  );
}

async function generateIconVideo(inputPath, outputPath, itemNumber, { signal, onChild } = {}) {
  // Match old backend: 480x480 padded, target under 2MB.
  const qualitySettings = [
    { crf: 18, scale: '480:480' },
    { crf: 20, scale: '480:480' },
    { crf: 22, scale: '480:480' },
    { crf: 24, scale: '480:480' },
  ];
  const maxSizeMB = 2;

  for (let i = 0; i < qualitySettings.length; i++) {
    const setting = qualitySettings[i];
    const tempOutput = outputPath.replace(/\.mp4$/i, `_temp_${i}.mp4`);
    await runCmd(
      'ffmpeg',
      [
        '-y',
        '-i',
        inputPath,
        '-vf',
        `scale=${setting.scale}:force_original_aspect_ratio=decrease,pad=${setting.scale}:(ow-iw)/2:(oh-ih)/2`,
        '-c:v',
        'libx264',
        '-crf',
        String(setting.crf),
        '-preset',
        'slow',
        '-movflags',
        '+faststart',
        tempOutput,
      ],
      { signal, onChild }
    );

    const stats = await fs.promises.stat(tempOutput);
    const sizeMB = stats.size / (1024 * 1024);
    if (sizeMB < maxSizeMB) {
      await fs.promises.rename(tempOutput, outputPath);
      return { success: true, sizeMB, quality: setting };
    }
    await fs.promises.unlink(tempOutput).catch(() => {});
  }

  throw new Error(`Failed to generate icon video under ${maxSizeMB}MB for item ${itemNumber}`);
}

async function generateBackgroundFbf({
  jobId,
  itemNumber,
  inputPath,
  outputPath,
  maxDuration = 15.58,
  encodingCRF = 30,
  encodingPreset = 'medium',
  signal,
  onChild,
  ensureNotSuperseded,
}) {
  // Port of the old backend "generate-background-fbf" pipeline, simplified for the worker.
  const probe = await runCmd(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,duration,r_frame_rate',
      '-count_frames',
      '-show_entries',
      'stream=nb_read_frames',
      '-of',
      'json',
      inputPath,
    ],
    { signal, onChild }
  );
  const probeJson = JSON.parse(probe.stdout || '{}');
  const s = probeJson?.streams?.[0];
  if (!s) throw new Error('Could not read video properties');

  const originalWidth = parseInt(s.width) || 1080;
  const originalHeight = parseInt(s.height) || 1080;
  const originalSize = Math.min(originalWidth, originalHeight);
  const duration = parseFloat(s.duration) || maxDuration;

  let fps = 30;
  if (s.r_frame_rate) {
    const [num, den] = String(s.r_frame_rate).split('/').map(Number);
    if (den && den > 0) fps = num / den;
  }

  let actualFrameCount = null;
  if (s.nb_read_frames) actualFrameCount = parseInt(s.nb_read_frames);

  const outerSize = 2160;
  const innerSize = 720;
  const innerLeft = Math.floor((outerSize - innerSize) / 2);
  const innerTop = Math.floor((outerSize - innerSize) / 2);
  const innerRight = innerLeft + innerSize;
  const innerBottom = innerTop + innerSize;
  const extractSize = Math.max(originalSize, innerSize * 3); // 2160+

  const framesToProcess = actualFrameCount
    ? Math.min(actualFrameCount, Math.ceil(maxDuration * fps))
    : Math.ceil(maxDuration * fps);

  const videoFramesDir = path.join(path.dirname(outputPath), 'video_frames_fbf');
  const preprocessedDir = path.join(path.dirname(outputPath), 'preprocessed_video_frames_fbf');
  const processedDir = path.join(path.dirname(outputPath), 'processed_frames_fbf');
  const blurredDir = path.join(path.dirname(outputPath), 'blurred_frames_fbf');
  const finalDir = path.join(path.dirname(outputPath), 'final_frames_fbf');

  await fs.promises.mkdir(videoFramesDir, { recursive: true });
  await fs.promises.mkdir(preprocessedDir, { recursive: true });
  await fs.promises.mkdir(processedDir, { recursive: true });
  await fs.promises.mkdir(blurredDir, { recursive: true });
  await fs.promises.mkdir(finalDir, { recursive: true });

  // Fast path: batch extract frames in one ffmpeg invocation.
  // Safety: verify frame count; if mismatch, fall back to slow per-frame extraction.
  await postJobProgress(jobId, {
    status: 'processing',
    stage: 'extracting',
    progress: 0,
    total: framesToProcess,
    message: `${framesToProcess} frames to extract...`,
  });

  const batchOutputPattern = path.join(videoFramesDir, 'frame_%06d.png');
  const batchArgs = [
    '-y',
    '-ss',
    '0',
    '-i',
    inputPath,
    '-t',
    String(maxDuration),
    '-vf',
    `scale=${extractSize}:${extractSize}:force_original_aspect_ratio=increase`,
    '-vsync',
    '0',
    '-start_number',
    '1',
    batchOutputPattern,
  ];

  await runCmd('ffmpeg', batchArgs, { signal, onChild });

  let extracted = (await fs.promises.readdir(videoFramesDir)).filter((f) => f.endsWith('.png')).length;
  if (extracted !== framesToProcess) {
    console.warn(
      `⚠️ Batch extract frame count mismatch (got ${extracted}, expected ${framesToProcess}). Falling back to per-frame extraction.`
    );
    await fs.promises.rm(videoFramesDir, { recursive: true, force: true });
    await fs.promises.mkdir(videoFramesDir, { recursive: true });

    const frameInterval = 1 / fps;
    for (let frameNum = 0; frameNum < framesToProcess; frameNum++) {
      if (frameNum % 5 === 0) await ensureNotSuperseded(`extract-${frameNum}`);
      const timestamp = frameNum * frameInterval;
      const frameFileName = `frame_${String(frameNum + 1).padStart(6, '0')}.png`;
      const framePath = path.join(videoFramesDir, frameFileName);
      await runCmd(
        'ffmpeg',
        [
          '-ss',
          timestamp.toFixed(6),
          '-i',
          inputPath,
          '-vf',
          `scale=${extractSize}:${extractSize}:force_original_aspect_ratio=increase`,
          '-frames:v',
          '1',
          '-vsync',
          '0',
          '-y',
          framePath,
        ],
        { signal, onChild }
      );
      // Report every frame for detailed progress
      await postJobProgress(jobId, {
        status: 'processing',
        stage: 'extracting',
        progress: frameNum + 1,
        total: framesToProcess,
        message: `Frame ${frameNum + 1} of ${framesToProcess}`,
      });
    }
    extracted = framesToProcess;
  }

  await postJobProgress(jobId, {
    status: 'processing',
    stage: 'extracting',
    progress: extracted,
    total: framesToProcess,
    message: `${extracted} frames extracted`,
  });

  await postJobProgress(jobId, {
    status: 'processing',
    stage: 'preprocessing',
    progress: 0,
    total: framesToProcess,
    message: `${framesToProcess} frames to process...`,
  });
  const whiteThreshold = 150;
  const centerX = innerSize / 2;
  const centerY = innerSize / 2;
  const maxDistance = innerSize / 2;
  const fadeStartDistance = maxDistance * 0.8;
  const fadeStartDistanceSq = fadeStartDistance * fadeStartDistance;

  for (let i = 0; i < framesToProcess; i++) {
    if (i % 5 === 0) await ensureNotSuperseded(`preprocess-${i}`);
    const frameFileName = `frame_${String(i + 1).padStart(6, '0')}.png`;
    const srcPath = path.join(videoFramesDir, frameFileName);
    const outPath = path.join(preprocessedDir, frameFileName);

    const resizedBuffer = await sharp(srcPath)
      .resize(innerSize, innerSize, {
        kernel: 'lanczos3',
        fit: 'contain',
        position: 'center',
        withoutEnlargement: false,
      })
      .sharpen()
      .ensureAlpha()
      .raw()
      .toBuffer();

    const videoData = Buffer.from(resizedBuffer);

    // Fade white/off-white in outer ring and apply 5px border fade.
    const maxCornerDistance = maxDistance * Math.sqrt(2);
    const processingRadius = Math.max(maxDistance, maxCornerDistance * 1.05);
    const startY = Math.floor(centerY - processingRadius);
    const endY = Math.ceil(centerY + processingRadius);
    const startX = Math.floor(centerX - processingRadius);
    const endX = Math.ceil(centerX + processingRadius);

    for (let y = Math.max(0, startY); y < Math.min(innerSize, endY); y++) {
      for (let x = Math.max(0, startX); x < Math.min(innerSize, endX); x++) {
        const idx = (y * innerSize + x) * 4;
        const r = videoData[idx];
        const g = videoData[idx + 1];
        const b = videoData[idx + 2];
        const a = videoData[idx + 3];

        const dx = x - centerX;
        const dy = y - centerY;
        const distanceSq = dx * dx + dy * dy;

        const avgBrightness = (r + g + b) / 3;
        const isWhite = (r > whiteThreshold && g > whiteThreshold && b > whiteThreshold) || avgBrightness > 170;
        if (a === 0 || !isWhite) continue;

        if (distanceSq >= fadeStartDistanceSq) {
          const distanceFromCenter = Math.sqrt(distanceSq);
          const effectiveFadeEnd = Math.max(maxDistance, maxCornerDistance * 1.05);
          const effectiveFadeRange = effectiveFadeEnd - fadeStartDistance;
          if (distanceFromCenter <= effectiveFadeEnd) {
            const t = (distanceFromCenter - fadeStartDistance) / effectiveFadeRange;
            const smoothT = t * t * (3 - 2 * t);
            const fadeFactor = Math.max(0, 1 - smoothT);
            videoData[idx + 3] = Math.floor(a * fadeFactor);
            if (videoData[idx + 3] === 0) {
              videoData[idx] = 0;
              videoData[idx + 1] = 0;
              videoData[idx + 2] = 0;
            }
          } else {
            videoData[idx + 3] = 0;
            videoData[idx] = 0;
            videoData[idx + 1] = 0;
            videoData[idx + 2] = 0;
          }
        }
      }
    }

    const borderWidth = 5;
    for (let y = 0; y < innerSize; y++) {
      for (let x = 0; x < innerSize; x++) {
        const minDistFromEdge = Math.min(x, innerSize - 1 - x, y, innerSize - 1 - y);
        if (minDistFromEdge < borderWidth) {
          const idx = (y * innerSize + x) * 4;
          videoData[idx + 3] = 0;
          videoData[idx] = 0;
          videoData[idx + 1] = 0;
          videoData[idx + 2] = 0;
        }
      }
    }

    for (let p = 0; p < videoData.length; p += 4) {
      const r = videoData[p];
      const g = videoData[p + 1];
      const b = videoData[p + 2];
      const avgBrightness = (r + g + b) / 3;
      const isWhite = (r > whiteThreshold && g > whiteThreshold && b > whiteThreshold) || avgBrightness > 170;
      if (!isWhite && videoData[p + 3] > 0) {
        videoData[p + 3] = 255;
      }
      if (videoData[p + 3] === 0) {
        videoData[p] = 0;
        videoData[p + 1] = 0;
        videoData[p + 2] = 0;
      }
    }

    await sharp(videoData, { raw: { width: innerSize, height: innerSize, channels: 4 } })
      .ensureAlpha()
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(outPath);

    // Report every frame for detailed progress
    await postJobProgress(jobId, {
      status: 'processing',
      stage: 'preprocessing',
      progress: i + 1,
      total: framesToProcess,
      message: `Frame ${i + 1} of ${framesToProcess}`,
    });
  }

  // Big perf win: build blurred background via sharp.extend({ extendWith: 'copy' }) instead of per-pixel JS loops.
  await postJobProgress(jobId, {
    status: 'processing',
    stage: 'compositing',
    progress: 0,
    total: framesToProcess,
    message: `${framesToProcess} frames to composite...`,
  });

  const pad = innerLeft; // 1080
  for (let i = 0; i < framesToProcess; i++) {
    if (i % 2 === 0) await ensureNotSuperseded(`composite-${i}`);
    const frameFileName = `frame_${String(i + 1).padStart(6, '0')}.png`;
    const srcPath = path.join(videoFramesDir, frameFileName);
    const finalPath = path.join(finalDir, frameFileName);
    const preprocessedPath = path.join(preprocessedDir, frameFileName);

    // Background: inner 1080 extracted frame -> extend edges -> blur
    const innerFrame = await sharp(srcPath)
      .resize(innerSize, innerSize, {
        kernel: 'lanczos3',
        fit: 'contain',
        position: 'center',
        withoutEnlargement: false,
      })
      .ensureAlpha()
      .toBuffer();

    const blurredBackground = await sharp(innerFrame)
      .extend({ top: pad, bottom: pad, left: pad, right: pad, extendWith: 'copy' })
      .blur(50)
      .ensureAlpha()
      .toBuffer();

    await sharp(blurredBackground)
      .composite([{ input: preprocessedPath, left: innerLeft, top: innerTop, blend: 'over' }])
      .ensureAlpha()
      .png()
      .toFile(finalPath);

    // Report every frame for detailed progress
    await postJobProgress(jobId, {
      status: 'processing',
      stage: 'compositing',
      progress: i + 1,
      total: framesToProcess,
      message: `Frame ${i + 1} of ${framesToProcess}`,
    });
  }

  await postJobProgress(jobId, { status: 'processing', stage: 'encoding', progress: 0, total: framesToProcess, message: 'Encoding frames to mp4...' });
  const finalFrameCount = framesToProcess;
  const videoDuration = duration || maxDuration;
  const encodeFps = videoDuration > 0 && finalFrameCount > 0 ? finalFrameCount / videoDuration : fps;

  await runCmd(
    'ffmpeg',
    [
      '-y',
      '-framerate',
      encodeFps.toFixed(6),
      '-i',
      path.join(finalDir, 'frame_%06d.png'),
      '-fps_mode',
      'passthrough',
      '-c:v',
      'libx264',
      '-preset',
      encodingPreset,
      '-crf',
      String(encodingCRF),
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outputPath,
    ],
    {
      signal,
      onChild,
      onLine: (line) => {
        const m = String(line || '').match(/frame=\s*(\d+)/);
        if (!m) return;
        const frame = Number(m[1]);
        if (!Number.isFinite(frame)) return;
        // Best-effort progress updates; keep them throttled.
        // Report every frame for detailed encoding progress
        postJobProgress(jobId, {
          status: 'processing',
          stage: 'encoding',
          progress: Math.min(frame, finalFrameCount),
          total: finalFrameCount,
          message: `Frame ${Math.min(frame, finalFrameCount)} of ${finalFrameCount}`,
        }).catch(() => {});
      },
    }
  );

  // Cleanup frame directories (keep only the output mp4)
  await fs.promises.rm(videoFramesDir, { recursive: true, force: true }).catch(() => {});
  await fs.promises.rm(preprocessedDir, { recursive: true, force: true }).catch(() => {});
  await fs.promises.rm(finalDir, { recursive: true, force: true }).catch(() => {});
}

async function processAndUpload(jobId, itemNumber, inputPath) {
  const jobDir = uploadsDirForJob(jobId);
  const state = {
    jobId,
    itemNumber,
    jobDir,
    abortController: new AbortController(),
    children: new Set(),
    uploadedPublicIds: new Set(),
  };
  activeByItem.set(itemNumber, state);
  activeByJobId.set(jobId, state);

  const { signal } = state.abortController;
  const trackChild = (p) => {
    state.children.add(p);
    p.on('close', () => state.children.delete(p));
  };

  const ensureNotSuperseded = async (label) => {
    if (signal.aborted) {
      const e = new Error(`Job aborted (${label || 'cancelled'})`);
      e.name = 'AbortError';
      throw e;
    }
    if (await isSuperseded(jobId, itemNumber)) {
      const e = new Error('Job superseded by a newer upload');
      e.name = 'SupersededError';
      throw e;
    }
  };

  console.log(`🎬 Starting FULL pipeline for job ${jobId}, item ${itemNumber}`);
  try {
    await ensureNotSuperseded('start');

    await postJobProgress(jobId, { status: 'processing', stage: 'preprocessing', progress: 5, message: 'Cropping and trimming...' });
    const probe = await runCmd(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', inputPath],
      { signal, onChild: trackChild }
    );
    const probeJson = JSON.parse(probe.stdout || '{}');
    const stream = probeJson?.streams?.[0];
    if (!stream?.width || !stream?.height) throw new Error('ffprobe could not read video dimensions');

    const w = Number(stream.width);
    const h = Number(stream.height);
    const cropSize = h;
    const cropX = Math.max(0, Math.floor((w - cropSize) / 2));
    const preprocessedPath = path.join(jobDir, `${itemNumber}_preprocessed.mov`);
    await runCmd(
      'ffmpeg',
      [
        '-y',
        '-ss',
        '2',
        '-i',
        inputPath,
        '-t',
        '15.58',
        '-vf',
        `crop=${cropSize}:${cropSize}:${cropX}:0`,
        '-c:v',
        'prores_ks',
        '-profile:v',
        '3',
        '-c:a',
        'copy',
        preprocessedPath,
      ],
      { signal, onChild: trackChild }
    );

    await ensureNotSuperseded('after-preprocess');

    await postJobProgress(jobId, { status: 'processing', stage: 'white-balance', progress: 12, message: 'Applying white balance...' });
    const wbPath = path.join(jobDir, `${itemNumber}_preprocessed_wb.mov`);
    const { scale: wbScale } = await sampleTopRowWhiteBalanceScale(preprocessedPath, { signal, onChild: trackChild });
    await applyUniformGain(preprocessedPath, wbPath, wbScale, { signal, onChild: trackChild });
    await fs.promises.unlink(preprocessedPath).catch(() => {});

    await ensureNotSuperseded('after-white-balance');

    await postJobProgress(jobId, { status: 'processing', stage: 'icon-generation', progress: 18, message: 'Generating icon video...' });
    const outIcon = path.join(jobDir, `${itemNumber}_icon.mp4`);
    try {
      await generateIconVideo(wbPath, outIcon, itemNumber, { signal, onChild: trackChild });
    } catch (err) {
      console.warn('⚠️ Icon generation failed (continuing):', err.message);
    }

    await ensureNotSuperseded('after-icon');

    // Main video pipeline (old backend: generate-background-fbf with CRF 30)
    const outFull = path.join(jobDir, `${itemNumber}_full.mp4`);
    await postJobProgress(jobId, { status: 'processing', stage: 'processing', progress: 22, message: 'Generating full video (frame-by-frame)...' });
    await generateBackgroundFbf({
      jobId,
      itemNumber,
      inputPath: wbPath,
      outputPath: outFull,
      maxDuration: 15.58,
      encodingCRF: 30,
      encodingPreset: 'medium',
      signal,
      onChild: trackChild,
      ensureNotSuperseded,
    });

    await ensureNotSuperseded('after-full');

    // Upload to Cloudinary
    await postJobProgress(jobId, { status: 'cloudinary-upload', stage: 'cloudinary-upload', progress: 85, message: 'Uploading to Cloudinary...' });
    const mainVideoResult = await cloudinary.uploader.upload(outFull, {
      folder: 'echo-catering/videos',
      public_id: `${itemNumber}_full`,
      resource_type: 'video',
      overwrite: true,
    });
    if (mainVideoResult?.public_id) state.uploadedPublicIds.add(mainVideoResult.public_id);
    if (!mainVideoResult?.secure_url || !mainVideoResult?.public_id) throw new Error('Cloudinary main upload failed');

    let iconVideoResult = null;
    if (fs.existsSync(outIcon)) {
      try {
        iconVideoResult = await cloudinary.uploader.upload(outIcon, {
          folder: 'echo-catering/videos',
          public_id: `${itemNumber}_icon`,
          resource_type: 'video',
          overwrite: true,
        });
        if (iconVideoResult?.public_id) state.uploadedPublicIds.add(iconVideoResult.public_id);
      } catch (err) {
        console.warn('⚠️ Icon upload failed (non-fatal):', err.message);
      }
    }

    await postJobProgress(jobId, { status: 'processing', stage: 'finalizing', progress: 95, message: 'Finalizing...' });
    await postJobComplete(jobId, {
      result: {
        cloudinaryVideoUrl: mainVideoResult.secure_url,
        cloudinaryVideoPublicId: mainVideoResult.public_id,
        cloudinaryIconUrl: iconVideoResult?.secure_url || '',
        cloudinaryIconPublicId: iconVideoResult?.public_id || '',
      },
      message: 'Complete',
    });
  } catch (err) {
    if (err?.name === 'SupersededError' || err?.name === 'AbortError') {
      // Best-effort delete anything uploaded by this job (requirement: cancelled job should not leave assets).
      for (const publicId of state.uploadedPublicIds) {
        try {
          await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
        } catch {}
      }
      throw err;
    }
    throw err;
  } finally {
    await fs.promises.rm(jobDir, { recursive: true, force: true }).catch(() => {});
    activeByItem.delete(itemNumber);
    activeByJobId.delete(jobId);
  }
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

    // Also enforce "newest upload wins" even if the browser hasn't uploaded yet.
    // If an admin starts a new job on Render, the backend supersedes the old job immediately.
    // This loop makes the worker cancel within the heartbeat window (~3s).
    for (const [itemNumber, active] of activeByItem.entries()) {
      // eslint-disable-next-line no-await-in-loop
      const superseded = await isSuperseded(active.jobId, itemNumber).catch(() => false);
      if (superseded) {
        // eslint-disable-next-line no-await-in-loop
        await cancelActiveJobForItem(itemNumber, 'Superseded by a newer job (heartbeat)');
      }
    }
  } catch (err) {
    console.warn('⚠️ Heartbeat failed:', err.message);
  }
}

const HEARTBEAT_MS = Number(process.env.WORKER_HEARTBEAT_MS || 5000);
setInterval(heartbeatOnce, HEARTBEAT_MS);
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

    // If there's already an active job for this item, cancel it immediately (newest wins).
    const existing = activeByItem.get(itemNumber);
    if (existing && String(existing.jobId) !== String(jobId)) {
      await cancelActiveJobForItem(itemNumber, 'Superseded by a newer upload');
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
    console.log(`🚀 Starting processing for job ${jobId}, item ${itemNumber}...`);
    processAndUpload(jobId, itemNumber, req.file.path)
      .catch(async (err) => {
        // Superseded/aborted jobs are expected when the user starts a new upload.
        if (err?.name === 'SupersededError' || err?.name === 'AbortError') {
          console.warn(`🛑 Job ${jobId} stopped:`, err.message);
          return;
        }
        console.error(`❌ Job ${jobId} failed:`, err.message);
        try {
          await postJobFail(jobId, { error: err.message, message: 'Video processing failed' });
        } catch (postErr) {
          console.warn('⚠️ Failed to post job failure:', postErr.message);
        }
      })
      .finally(() => {
        console.log(`✅ Job ${jobId} finished processing`);
      });

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


