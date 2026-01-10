const express = require('express');
const multer = require('multer');
const { authenticateToken, requireEditor } = require('../middleware/auth');
const { uploadBufferToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary');
const Gallery = require('../models/Gallery');

const router = express.Router();

// Memory-only upload; no disk writes.
const galleryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 50 * 1024 * 1024, // 50MB cap
  },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const isImage = /\.(jpe?g|png|gif|webp|svg)$/.test(name);
    const isVideo = /\.(mp4|mov|avi|webm)$/.test(name);
    if (isImage || isVideo) return cb(null, true);
    return cb(new Error('Only image or video files are allowed for gallery uploads'));
  },
});

const assertCloudinaryEnv = () => {
  const required = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Cloudinary configuration missing required env vars: ${missing.join(', ')}`);
  }
};

// Logo upload (memory only, overwrite fixed public_id)
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 10 * 1024 * 1024, // 10MB cap
  },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const isImage = /\.(jpe?g|png|gif|webp|svg)$/.test(name);
    if (isImage) return cb(null, true);
    return cb(new Error('Only image files are allowed for logo uploads'));
  },
});

// POST /api/upload/logo
router.post(
  '/logo',
  [authenticateToken, requireEditor, logoUpload.single('logo')],
  async (req, res) => {
    try {
      assertCloudinaryEnv();

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Fixed public id so uploads overwrite
      const publicId = 'echo-catering/logo/current_logo';
      const cloudinaryResult = await uploadBufferToCloudinary(req.file.buffer, {
        folder: 'echo-catering/logo',
        resourceType: 'image',
        publicId,
      });

      return res.json({
        success: true,
        message: 'Logo uploaded successfully',
        file: {
          cloudinaryUrl: cloudinaryResult.url,
          publicId: cloudinaryResult.publicId,
          width: cloudinaryResult.width,
          height: cloudinaryResult.height,
          bytes: cloudinaryResult.bytes,
          resourceType: cloudinaryResult.resourceType,
          format: cloudinaryResult.format,
        },
      });
    } catch (error) {
      console.error('❌ Logo upload error:', error.message);
      return res.status(500).json({ message: 'Upload failed', error: error.message });
    }
  }
);

// POST /api/upload/gallery
router.post(
  '/gallery',
  [authenticateToken, requireEditor, galleryUpload.single('gallery')],
  async (req, res) => {
    try {
      assertCloudinaryEnv();

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const lastPhoto = await Gallery.findOne({ category: 'gallery', photoNumber: { $exists: true } })
        .sort({ photoNumber: -1 })
        .select('photoNumber')
        .lean();
      const nextNumber = lastPhoto?.photoNumber ? lastPhoto.photoNumber + 1 : 1;
      const publicId = `echo-catering/gallery/${nextNumber}_gallery`;

      const cloudinaryResult = await uploadBufferToCloudinary(req.file.buffer, {
        folder: 'echo-catering/gallery',
        resourceType: 'auto',
        publicId,
        overwrite: false,
      });

      let record;
      try {
        record = await Gallery.create({
          filename: `${nextNumber}.jpg`,
          originalName: req.file.originalname,
          title: (req.file.originalname || '')
            .replace(/\.[^/.]+$/, '')
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          category: 'gallery',
          photoNumber: nextNumber,
          order: nextNumber,
          isActive: true,
          featured: false,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          cloudinaryUrl: cloudinaryResult.url,
          cloudinaryPublicId: cloudinaryResult.publicId,
          thumbnailUrl: cloudinaryResult.url, // Consumers can apply transformations as needed
          dimensions: {
            width: cloudinaryResult.width,
            height: cloudinaryResult.height,
          },
        });
      } catch (dbErr) {
        try {
          await deleteFromCloudinary(cloudinaryResult.publicId, cloudinaryResult.resourceType || 'image');
        } catch (rollbackErr) {
          console.warn('⚠️  Failed to roll back Cloudinary asset after DB error:', rollbackErr.message);
        }
        throw dbErr;
      }

      return res.json({
        success: true,
        message: 'Image uploaded successfully',
        file: {
          id: record._id,
          cloudinaryUrl: record.cloudinaryUrl,
          publicId: record.cloudinaryPublicId,
          filename: record.filename,
          originalName: record.originalName,
          width: cloudinaryResult.width,
          height: cloudinaryResult.height,
          bytes: cloudinaryResult.bytes,
          resourceType: cloudinaryResult.resourceType,
          format: cloudinaryResult.format,
        },
      });
    } catch (error) {
      console.error('❌ Gallery upload error:', error.message);
      return res.status(500).json({ message: 'Upload failed', error: error.message });
    }
  }
);

// DELETE /api/upload/gallery/:id
router.delete('/gallery/:id', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const record = await Gallery.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ message: 'Gallery record not found' });
    }

    if (record.cloudinaryPublicId) {
      try {
        await deleteFromCloudinary(
          record.cloudinaryPublicId,
          record.resourceType || 'image'
        );
      } catch (err) {
        console.warn('⚠️  Cloudinary delete failed (continuing with DB delete):', err.message);
      }
    }

    await Gallery.findByIdAndDelete(record._id);
    return res.json({ success: true, message: 'Image deleted successfully' });
  } catch (error) {
    console.error('❌ Gallery delete error:', error.message);
    return res.status(500).json({ message: 'Delete failed', error: error.message });
  }
});

// Disable all legacy filesystem endpoints to prevent disk usage
router.all('*', (req, res) => {
  return res
    .status(410)
    .json({ message: 'Filesystem-based upload endpoints are disabled (Cloudinary-only)' });
});

module.exports = router;

