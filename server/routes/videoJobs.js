const crypto = require('crypto');
const express = require('express');
const { authenticateToken, requireEditor } = require('../middleware/auth');
const VideoJob = require('../models/VideoJob');
const Cocktail = require('../models/Cocktail');

const router = express.Router();

function isWorkerConfigured() {
  return !!process.env.VIDEO_WORKER_URL && !!process.env.VIDEO_WORKER_SECRET;
}

function now() {
  return Date.now();
}

function workerOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  return now() - new Date(lastSeenAt).getTime() <= 9000; // 9s window for 3s heartbeat
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

// GET /api/video-jobs/:itemNumber/status
// Used by admin UI polling wheel.
router.get('/:itemNumber/status', [authenticateToken, requireEditor], async (req, res) => {
  const itemNumber = Number(req.params.itemNumber);
  if (!Number.isFinite(itemNumber) || itemNumber <= 0) {
    return res.status(400).json({ message: 'Invalid itemNumber' });
  }

  const job = await VideoJob.findOne({ itemNumber }).sort({ createdAt: -1 }).lean();

  if (!job) {
    return res.json({
      active: false,
      status: null,
      stage: null,
      progress: 0,
      total: 100,
      message: 'No job',
      error: null,
      itemNumber,
      workerOnline: false,
      workerLastSeenAt: null,
    });
  }

  const active = ['queued', 'awaiting-upload', 'uploaded', 'processing', 'cloudinary-upload'].includes(
    job.status
  );

  return res.json({
    active,
    status: job.status,
    stage: job.stage,
    progress: job.progress ?? 0,
    total: job.total ?? 100,
    message: job.message || '',
    error: job.error || null,
    itemNumber,
    workerOnline: workerOnline(job.workerLastSeenAt),
    workerLastSeenAt: job.workerLastSeenAt || null,
    jobId: String(job._id),
    result: job.result || {},
  });
});

// POST /api/video-jobs/:itemNumber/start
// Creates a new job and returns upload details for the worker.
router.post('/:itemNumber/start', [authenticateToken, requireEditor], async (req, res) => {
  const itemNumber = Number(req.params.itemNumber);
  if (!Number.isFinite(itemNumber) || itemNumber <= 0) {
    return res.status(400).json({ message: 'Invalid itemNumber' });
  }

  if (!process.env.VIDEO_WORKER_URL) {
    return res.status(501).json({ message: 'VIDEO_WORKER_URL is not configured on the backend' });
  }
  if (!process.env.VIDEO_WORKER_SECRET) {
    return res.status(501).json({ message: 'VIDEO_WORKER_SECRET is not configured on the backend' });
  }

  // Worker availability gate: require a recent heartbeat from *any* job.
  // We store last seen on the newest job (simple) and also allow worker to call /api/video-worker/heartbeat.
  const newest = await VideoJob.findOne({}).sort({ workerLastSeenAt: -1 }).select('workerLastSeenAt').lean();
  const online = workerOnline(newest?.workerLastSeenAt);
  if (!online) {
    return res.status(409).json({ message: 'Local worker is offline', workerOnline: false });
  }

  // Supersede any existing active jobs for this item.
  await VideoJob.updateMany(
    { itemNumber, status: { $in: ['queued', 'awaiting-upload', 'uploaded', 'processing', 'cloudinary-upload'] } },
    { $set: { status: 'superseded', message: 'Superseded by a newer upload' } }
  );

  const uploadToken = randomToken();
  const uploadTokenHash = sha256Hex(uploadToken);
  const expiresAt = new Date(now() + 15 * 60 * 1000); // 15 minutes

  const job = await VideoJob.create({
    itemNumber,
    status: 'awaiting-upload',
    stage: 'awaiting-upload',
    progress: 0,
    total: 100,
    message: 'Waiting for upload to local worker...',
    uploadTokenHash,
    uploadTokenExpiresAt: expiresAt,
  });

  const workerBase = String(process.env.VIDEO_WORKER_URL).replace(/\/+$/, '');
  const workerUploadUrl = `${workerBase}/upload/${job._id}`;

  return res.json({
    success: true,
    jobId: String(job._id),
    itemNumber,
    workerUploadUrl,
    uploadToken,
    uploadTokenExpiresAt: expiresAt.toISOString(),
  });
});

// POST /api/video-jobs/:jobId/verify-upload
// Worker calls this to verify the upload token sent by the browser.
router.post('/:jobId/verify-upload', async (req, res) => {
  const jobId = req.params.jobId;
  const token = String(req.body?.token || '').trim();
  if (!token) return res.status(400).json({ ok: false, message: 'token required' });

  const job = await VideoJob.findById(jobId).select('uploadTokenHash uploadTokenExpiresAt status itemNumber').lean();
  if (!job) return res.status(404).json({ ok: false, message: 'job not found' });

  if (job.status === 'superseded') return res.status(409).json({ ok: false, message: 'job superseded' });
  if (job.uploadTokenExpiresAt && new Date(job.uploadTokenExpiresAt).getTime() < now()) {
    return res.status(410).json({ ok: false, message: 'token expired' });
  }

  const matches = sha256Hex(token) === job.uploadTokenHash;
  if (!matches) return res.status(401).json({ ok: false, message: 'invalid token' });

  return res.json({ ok: true, itemNumber: job.itemNumber });
});

// Worker-auth helper
function requireWorkerSecret(req, res, next) {
  const provided = String(req.headers['x-worker-secret'] || '').trim();
  const expected = String(process.env.VIDEO_WORKER_SECRET || '').trim();
  if (!expected) return res.status(500).json({ message: 'VIDEO_WORKER_SECRET not set' });
  if (!provided || provided !== expected) return res.status(401).json({ message: 'Invalid worker secret' });
  return next();
}

// POST /api/video-jobs/:jobId/progress
router.post('/:jobId/progress', [requireWorkerSecret], async (req, res) => {
  const jobId = req.params.jobId;
  const { stage, progress, message, workerId, status } = req.body || {};

  const update = {
    ...(stage !== undefined ? { stage: String(stage) } : {}),
    ...(progress !== undefined ? { progress: Number(progress) } : {}),
    ...(message !== undefined ? { message: String(message) } : {}),
    ...(status ? { status: String(status) } : { status: 'processing' }),
    workerLastSeenAt: new Date(),
    ...(workerId ? { workerId: String(workerId) } : {}),
  };

  const job = await VideoJob.findByIdAndUpdate(jobId, { $set: update }, { new: true }).lean();
  if (!job) return res.status(404).json({ message: 'job not found' });

  return res.json({ ok: true });
});

// POST /api/video-jobs/:jobId/complete
router.post('/:jobId/complete', [requireWorkerSecret], async (req, res) => {
  const jobId = req.params.jobId;
  const { result, message } = req.body || {};

  const job = await VideoJob.findById(jobId);
  if (!job) return res.status(404).json({ message: 'job not found' });
  if (job.status === 'superseded') return res.status(409).json({ message: 'job superseded' });

  job.status = 'complete';
  job.stage = 'complete';
  job.progress = 100;
  job.message = message || 'Complete';
  job.error = '';
  job.workerLastSeenAt = new Date();
  if (result && typeof result === 'object') {
    job.result = {
      cloudinaryVideoUrl: result.cloudinaryVideoUrl || job.result?.cloudinaryVideoUrl || '',
      cloudinaryVideoPublicId: result.cloudinaryVideoPublicId || job.result?.cloudinaryVideoPublicId || '',
      cloudinaryIconUrl: result.cloudinaryIconUrl || job.result?.cloudinaryIconUrl || '',
      cloudinaryIconPublicId: result.cloudinaryIconPublicId || job.result?.cloudinaryIconPublicId || '',
    };
  }
  await job.save();

  // Update Cocktail doc as part of the completion handshake (source of truth for app).
  if (job.result?.cloudinaryVideoUrl) {
    await Cocktail.updateOne(
      { itemNumber: job.itemNumber },
      {
        $set: {
          cloudinaryVideoUrl: job.result.cloudinaryVideoUrl,
          cloudinaryVideoPublicId: job.result.cloudinaryVideoPublicId || '',
          ...(job.result.cloudinaryIconUrl
            ? {
                cloudinaryIconUrl: job.result.cloudinaryIconUrl,
                cloudinaryIconPublicId: job.result.cloudinaryIconPublicId || '',
              }
            : {}),
        },
      }
    );
  }

  return res.json({ ok: true });
});

// POST /api/video-jobs/:jobId/fail
router.post('/:jobId/fail', [requireWorkerSecret], async (req, res) => {
  const jobId = req.params.jobId;
  const { error, message } = req.body || {};

  const job = await VideoJob.findById(jobId);
  if (!job) return res.status(404).json({ message: 'job not found' });
  if (job.status === 'superseded') return res.status(409).json({ message: 'job superseded' });

  job.status = 'failed';
  job.stage = 'failed';
  job.progress = Math.min(100, Number(job.progress || 0));
  job.message = message || 'Video processing failed';
  job.error = String(error || 'Unknown error');
  job.workerLastSeenAt = new Date();
  await job.save();

  return res.json({ ok: true });
});

module.exports = router;


