const express = require('express');
const { body, validationResult } = require('express-validator');
const Gallery = require('../models/Gallery');
const { authenticateToken, requireEditor } = require('../middleware/auth');
const { deleteFromCloudinary } = require('../utils/cloudinary');

const router = express.Router();

// DELETE /api/gallery/purge
// Protected admin tool: wipe gallery documents and best-effort delete Cloudinary assets.
router.delete('/purge', [authenticateToken, requireEditor], async (req, res) => {
  try {
    // Safety latch to prevent accidental wipes
    if (req.query.confirm !== 'true') {
      return res.status(400).json({
        message: 'Confirmation required. Re-run with ?confirm=true to purge the gallery.'
      });
    }

    const docs = await Gallery.find({}).select('_id cloudinaryPublicId mimeType').lean();
    const total = docs.length;

    let cloudinaryDeleted = 0;
    let cloudinaryFailed = 0;

    for (const d of docs) {
      const publicId = (d.cloudinaryPublicId || '').trim();
      if (!publicId) continue;
      const resourceType = (d.mimeType || '').startsWith('video') ? 'video' : 'image';
      try {
        await deleteFromCloudinary(publicId, resourceType);
        cloudinaryDeleted += 1;
      } catch (err) {
        cloudinaryFailed += 1;
      }
    }

    await Gallery.deleteMany({});

    return res.json({
      success: true,
      deletedMongoDocs: total,
      attemptedCloudinaryDeletes: docs.filter(d => (d.cloudinaryPublicId || '').trim()).length,
      cloudinaryDeleted,
      cloudinaryFailed
    });
  } catch (error) {
    console.error('Purge gallery error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/gallery
router.get('/', async (req, res) => {
  try {
    const { category, active, featured, tags } = req.query;
    const query = {};
    if (category) query.category = category;
    if (active !== undefined) query.isActive = active === 'true';
    if (featured !== undefined) query.featured = featured === 'true';
    if (tags) query.tags = { $in: tags.split(',') };

    const images = await Gallery.find(query).sort({ category: 1, order: 1, createdAt: -1 });
    const imagesJson = images.map((img) => img.toJSON({ virtuals: true }));
    return res.json(imagesJson);
  } catch (error) {
    console.error('Get gallery error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/gallery/categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await Gallery.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          activeCount: { $sum: { $cond: ['$isActive', 1, 0] } },
          featuredCount: { $sum: { $cond: ['$featured', 1, 0] } },
        },
      },
      {
        $project: {
          category: '$_id',
          count: 1,
          activeCount: 1,
          featuredCount: 1,
          _id: 0,
        },
      },
      { $sort: { category: 1 } },
    ]);
    return res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/gallery/tags
router.get('/tags', async (req, res) => {
  try {
    const tags = await Gallery.distinct('tags');
    return res.json(tags.filter((t) => t && t.trim()));
  } catch (error) {
    console.error('Get tags error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/gallery/:id
router.get('/:id', async (req, res) => {
  try {
    const image = await Gallery.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }
    return res.json(image.toJSON({ virtuals: true }));
  } catch (error) {
    console.error('Get image error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/gallery
router.post(
  '/',
  [
    authenticateToken,
    requireEditor,
    body('filename').notEmpty().trim(),
    body('originalName').notEmpty().trim(),
    body('category').isIn(['hero', 'gallery', 'footer', 'events', 'food', 'cocktails']),
    body('title').optional().trim().isLength({ max: 200 }),
    body('description').optional().trim().isLength({ max: 500 }),
    body('tags').optional().isArray(),
    body('altText').optional().trim().isLength({ max: 200 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const existingImage = await Gallery.findOne({ filename: req.body.filename });
      if (existingImage) {
        return res.status(400).json({ message: 'Image with this filename already exists' });
      }

      const lastImage = await Gallery.findOne({ category: req.body.category }).sort({ order: -1 });
      const nextOrder = lastImage ? lastImage.order + 1 : 0;

      const image = new Gallery({
        ...req.body,
        order: nextOrder,
        imagePath: `/gallery/${req.body.filename}`,
      });

      await image.save();
      return res.status(201).json(image);
    } catch (error) {
      console.error('Create image error:', error);
      return res.status(500).json({ message: 'Server error' });
    }
  }
);

// PUT /api/gallery/:id
router.put(
  '/:id',
  [
    authenticateToken,
    requireEditor,
    body('title').optional().trim().isLength({ max: 200 }),
    body('description').optional().trim().isLength({ max: 500 }),
    body('category').optional().isIn(['hero', 'gallery', 'footer', 'events', 'food', 'cocktails']),
    body('tags').optional().isArray(),
    body('altText').optional().trim().isLength({ max: 200 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const image = await Gallery.findById(req.params.id);
      if (!image) {
        return res.status(404).json({ message: 'Image not found' });
      }

      Object.assign(image, req.body);
      await image.save();
      return res.json(image);
    } catch (error) {
      console.error('Update image error:', error);
      return res.status(500).json({ message: 'Server error' });
    }
  }
);

// DELETE /api/gallery/:id
router.delete('/:id', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const image = await Gallery.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }

    // Delete Cloudinary asset first (best effort), then delete DB record.
    if (image.cloudinaryPublicId && image.cloudinaryPublicId.trim() !== '') {
      const resourceType = (image.mimeType || '').startsWith('video') ? 'video' : 'image';
      try {
        await deleteFromCloudinary(image.cloudinaryPublicId, resourceType);
      } catch (err) {
        // Continue with DB delete even if Cloudinary delete fails
        console.warn('Cloudinary delete failed (continuing with DB delete):', err.message);
      }
    }

    await Gallery.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Delete image error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/gallery/:id/toggle
router.put('/:id/toggle', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const image = await Gallery.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }
    image.isActive = !image.isActive;
    await image.save();
    return res.json(image);
  } catch (error) {
    console.error('Toggle image error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/gallery/:id/feature
router.put('/:id/feature', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const image = await Gallery.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }
    image.featured = !image.featured;
    await image.save();
    return res.json(image);
  } catch (error) {
    console.error('Feature image error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/gallery/reorder
router.put('/reorder', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const { category, imageIds } = req.body;
    if (!category || !Array.isArray(imageIds)) {
      return res.status(400).json({ message: 'Category and imageIds array required' });
    }

    const updatePromises = imageIds.map((id, index) =>
      Gallery.findByIdAndUpdate(id, { order: index }, { new: true })
    );
    await Promise.all(updatePromises);

    const images = await Gallery.find({ category }).sort({ order: 1 });
    return res.json(images);
  } catch (error) {
    console.error('Reorder images error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

