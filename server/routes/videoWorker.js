const express = require('express');
const VideoJob = require('../models/VideoJob');

const router = express.Router();

function now() {
  return Date.now();
}

function workerOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  return now() - new Date(lastSeenAt).getTime() <= 9000; // 9s window for 3s heartbeat
}

function requireWorkerSecret(req, res, next) {
  const provided = String(req.headers['x-worker-secret'] || '').trim();
  const expected = String(process.env.VIDEO_WORKER_SECRET || '').trim();
  if (!expected) return res.status(500).json({ message: 'VIDEO_WORKER_SECRET not set' });
  if (!provided || provided !== expected) return res.status(401).json({ message: 'Invalid worker secret' });
  return next();
}

// POST /api/video-worker/heartbeat
// Worker calls this every ~3s to indicate it's online.
router.post('/heartbeat', [requireWorkerSecret], async (req, res) => {
  const workerId = String(req.body?.workerId || 'local-worker').trim();

  // Store heartbeat on a lightweight “sentinel” job doc:
  // we just update the newest job (or create a dummy record if none exist).
  const newest = await VideoJob.findOne({}).sort({ createdAt: -1 });
  if (newest) {
    newest.workerLastSeenAt = new Date();
    newest.workerId = workerId;
    await newest.save();
    return res.json({ ok: true });
  }

  await VideoJob.create({
    itemNumber: 0,
    status: 'queued',
    stage: 'heartbeat',
    progress: 0,
    total: 100,
    message: 'Worker heartbeat sentinel',
    workerLastSeenAt: new Date(),
    workerId,
  });
  return res.json({ ok: true });
});

// GET /api/video-worker/status
// Admin UI uses this to show online/offline.
router.get('/status', async (req, res) => {
  const newest = await VideoJob.findOne({}).sort({ workerLastSeenAt: -1 }).select('workerLastSeenAt workerId').lean();
  const lastSeenAt = newest?.workerLastSeenAt || null;
  const online = workerOnline(lastSeenAt);
  const lastSeenSecondsAgo = lastSeenAt ? Math.floor((now() - new Date(lastSeenAt).getTime()) / 1000) : null;

  return res.json({
    online,
    workerId: newest?.workerId || null,
    lastHeartbeatAt: lastSeenAt,
    lastSeenSecondsAgo,
    configured: !!process.env.VIDEO_WORKER_URL && !!process.env.VIDEO_WORKER_SECRET,
  });
});

module.exports = router;


