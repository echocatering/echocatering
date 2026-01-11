const mongoose = require('mongoose');

/**
 * VideoJob
 * - DB-backed status so the Render admin progress wheel survives refresh/redeploy.
 * - Designed for a local worker (your Mac) to do CPU work and report progress.
 */

const videoJobSchema = new mongoose.Schema(
  {
    itemNumber: { type: Number, required: true, index: true, min: 0 },

    status: {
      type: String,
      enum: [
        'queued',
        'awaiting-upload',
        'uploaded',
        'processing',
        'cloudinary-upload',
        'complete',
        'failed',
        'superseded',
      ],
      default: 'queued',
      index: true,
    },

    stage: { type: String, default: null },
    progress: { type: Number, default: 0 }, // 0..100
    total: { type: Number, default: 100 },
    message: { type: String, default: '' },
    error: { type: String, default: '' },

    // Simple lease to avoid multiple workers processing the same job.
    lockedBy: { type: String, default: '' },
    leaseExpiresAt: { type: Date, default: null },

    // Upload token (short-lived) used by Render admin to upload directly to the worker.
    uploadTokenHash: { type: String, default: '' },
    uploadTokenExpiresAt: { type: Date, default: null },

    // Worker heartbeat for this job (used for “worker disconnected” UX).
    workerLastSeenAt: { type: Date, default: null },
    workerId: { type: String, default: '' },

    // Output (processed) assets in Cloudinary
    result: {
      cloudinaryVideoUrl: { type: String, default: '' },
      cloudinaryVideoPublicId: { type: String, default: '' },
      cloudinaryIconUrl: { type: String, default: '' },
      cloudinaryIconPublicId: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

videoJobSchema.index({ itemNumber: 1, createdAt: -1 });

module.exports = mongoose.model('VideoJob', videoJobSchema);


