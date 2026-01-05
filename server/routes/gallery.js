const express = require('express');
const { body, validationResult } = require('express-validator');
const fs = require('fs').promises;
const path = require('path');
const Gallery = require('../models/Gallery');
const { authenticateToken, requireEditor } = require('../middleware/auth');

const router = express.Router();

// Helper function to check if file exists
async function fileExists(filepath) {
  try {
    await fs.access(filepath);
    return true;
  } catch (error) {
    return false;
  }
}

// Helper function to get gallery file path
function getGalleryFilePath(filename) {
  // Primary source: server/uploads/gallery
  const uploadsPath = path.join(__dirname, '../uploads/gallery', filename);
  return uploadsPath;
}

// Helper function to filter images that exist
async function filterExistingImages(images) {
  const existingImages = [];
  
  for (const image of images) {
    const filename = image.filename || image.originalName;
    if (!filename) {
      console.warn('⚠️  Image missing filename:', image._id);
      continue;
    }
    
    const uploadsPath = getGalleryFilePath(filename);
    const existsInUploads = await fileExists(uploadsPath);
    
    if (existsInUploads) {
      existingImages.push(image);
    } else {
      console.warn(`⚠️  Image file not found: ${filename} (skipping)`);
    }
  }
  
  return existingImages;
}

// Helper function to scan gallery folder and create entries for all images
// Scans server/uploads/gallery - this is the primary source for hero and event gallery images
async function scanGalleryFolder() {
  const galleryPath = path.join(__dirname, '../uploads/gallery');
  const imageExtensions = /\.(jpeg|jpg|png|gif|webp)$/i;
  const images = [];
  
  try {
    // Check if directory exists
    try {
      await fs.access(galleryPath);
    } catch (error) {
      console.warn('⚠️  Gallery directory does not exist:', galleryPath);
      return images;
    }
    
    const files = await fs.readdir(galleryPath);
    console.log(`📁 Found ${files.length} files in gallery folder`);
    
    for (const file of files) {
      // Skip hidden files and directories
      if (file.startsWith('.') || file === 'thumbnails') {
        continue;
      }
      
      // Check if it's an image file
      if (imageExtensions.test(file)) {
        const filePath = path.join(galleryPath, file);
        const stats = await fs.stat(filePath);
        
        // Skip if it's a directory
        if (stats.isDirectory()) {
          continue;
        }
        
        // Get file extension and determine mime type
        const ext = path.extname(file).toLowerCase().slice(1);
        const mimeTypeMap = {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'gif': 'image/gif',
          'webp': 'image/webp'
        };
        
        // Create a unique ID based on filename
        const fileId = Buffer.from(file).toString('base64').replace(/[+/=]/g, '').substring(0, 24);
        
        // Create image entry from file
        const nameWithoutExt = file.replace(/\.[^/.]+$/, '');
        const imageEntry = {
          _id: `file-${fileId}`,
          filename: file,
          originalName: file,
          title: file.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          description: '',
          category: 'gallery',
          order: 0,
          isActive: true,
          featured: false,
          tags: [],
          createdAt: stats.birthtime || new Date(),
          updatedAt: stats.mtime || new Date(),
          imagePath: `/gallery/${file}`,
          thumbnailPath: `/gallery/thumbnails/${nameWithoutExt}_thumb.jpg`,
          fileSize: stats.size,
          mimeType: mimeTypeMap[ext] || `image/${ext}`
        };
        
        images.push(imageEntry);
        console.log(`   ✅ Found image: ${file}`);
      }
    }
    
    // Sort by filename for consistency
    images.sort((a, b) => a.filename.localeCompare(b.filename));
    
    console.log(`📊 Scanned ${images.length} images from gallery folder`);
    return images;
  } catch (error) {
    console.error('❌ Error scanning gallery folder:', error);
    return images;
  }
}

// @route   GET /api/gallery
// @desc    Get all gallery images
// @access  Public
router.get('/', async (req, res) => {
  try {
    // Check if database is connected
    if (!req.app.locals.dbConnected) {
      // When database is not available, scan the gallery folder directly
      console.log('📁 Database not connected, scanning gallery folder...');
      const scannedImages = await scanGalleryFolder();
      return res.json(scannedImages);
    }

    const { category, active, featured, tags } = req.query;
    let query = {};

    if (category) {
      query.category = category;
    }
    if (active !== undefined) {
      query.isActive = active === 'true';
    }
    if (featured !== undefined) {
      query.featured = featured === 'true';
    }
    if (tags) {
      query.tags = { $in: tags.split(',') };
    }

    const images = await Gallery.find(query)
      .sort({ category: 1, order: 1, createdAt: -1 });

    // Filter images to only include files that exist
    const existingImages = await filterExistingImages(images);
    console.log(`📊 Gallery: ${existingImages.length} of ${images.length} images exist`);
    
    // Also scan folder for any files not in database and add them
    const scannedImages = await scanGalleryFolder();
    const dbFilenames = new Set(existingImages.map(img => img.filename));
    const missingFromDb = scannedImages.filter(img => !dbFilenames.has(img.filename));
    
    if (missingFromDb.length > 0) {
      console.log(`📋 Found ${missingFromDb.length} images in folder not in database`);
      // Combine existing database images with missing folder images
      const allImages = [...existingImages, ...missingFromDb];
      // Sort by filename for consistency
      allImages.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
          return a.order - b.order;
        }
        return (a.filename || '').localeCompare(b.filename || '');
      });
      return res.json(allImages);
    }
    
    res.json(existingImages);
  } catch (error) {
    console.error('Get gallery error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/gallery/categories
// @desc    Get all categories with image counts
// @access  Public
router.get('/categories', async (req, res) => {
  try {
    // Check if database is connected
    if (!req.app.locals.dbConnected) {
      // Return mock categories data
      const mockCategories = [
        {
          category: 'gallery',
          count: 4,
          activeCount: 4,
          featuredCount: 1
        }
      ];
      return res.json(mockCategories);
    }

    const categories = await Gallery.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          featuredCount: {
            $sum: { $cond: ['$featured', 1, 0] }
          }
        }
      },
      {
        $project: {
          category: '$_id',
          count: 1,
          activeCount: 1,
          featuredCount: 1,
          _id: 0
        }
      },
      {
        $sort: { category: 1 }
      }
    ]);

    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/gallery/tags
// @desc    Get all unique tags
// @access  Public
router.get('/tags', async (req, res) => {
  try {
    // Check if database is connected
    if (!req.app.locals.dbConnected) {
      // Return mock tags data
      const mockTags = ['event', 'catering', 'cocktail', 'wedding', 'party', 'social', 'food', 'appetizer'];
      return res.json(mockTags);
    }

    const tags = await Gallery.distinct('tags');
    res.json(tags.filter(tag => tag && tag.trim()));
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/gallery/:id
// @desc    Get gallery image by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    // Check if database is connected
    if (!req.app.locals.dbConnected) {
      // For mock data, return the mock image if it exists
      const mockImages = [
        {
          _id: 'mock1',
          filename: '6d7aa8b6-ab25-4a6c-a2c6-473bf53a7a62~rs_1536.webp',
          originalName: '6d7aa8b6-ab25-4a6c-a2c6-473bf53a7a62~rs_1536.webp',
          title: 'Gallery Image 1',
          description: 'A beautiful gallery image',
          category: 'gallery',
          order: 0,
          isActive: true,
          featured: false,
          tags: ['event', 'catering'],
          createdAt: new Date(),
          updatedAt: new Date(),
          imagePath: '/gallery/6d7aa8b6-ab25-4a6c-a2c6-473bf53a7a62~rs_1536.webp'
        },
        {
          _id: 'mock2',
          filename: 'Modern-Citrus-Wedding-Signature-Drink-4-2.webp',
          originalName: 'Modern-Citrus-Wedding-Signature-Drink-4-2.webp',
          title: 'Modern Citrus Wedding Drink',
          description: 'Signature cocktail for modern weddings',
          category: 'gallery',
          order: 1,
          isActive: true,
          featured: true,
          tags: ['cocktail', 'wedding'],
          createdAt: new Date(),
          updatedAt: new Date(),
          imagePath: '/gallery/Modern-Citrus-Wedding-Signature-Drink-4-2.webp'
        },
        {
          _id: 'mock3',
          filename: 'friends-at-a-cocktail-party.jpg',
          originalName: 'friends-at-a-cocktail-party.jpg',
          title: 'Friends at Cocktail Party',
          description: 'Social gathering with cocktails',
          category: 'gallery',
          order: 2,
          isActive: true,
          featured: false,
          tags: ['party', 'social'],
          createdAt: new Date(),
          updatedAt: new Date(),
          imagePath: '/gallery/friends-at-a-cocktail-party.jpg'
        },
        {
          _id: 'mock4',
          filename: 'hors-doeuvres.jpg',
          originalName: 'hors-doeuvres.jpg',
          title: 'Hors D\'oeuvres Display',
          description: 'Beautiful appetizer presentation',
          category: 'gallery',
          order: 3,
          isActive: true,
          featured: false,
          tags: ['food', 'appetizer'],
          createdAt: new Date(),
          updatedAt: new Date(),
          imagePath: '/gallery/hors-doeuvres.jpg'
        }
      ];
      
      const mockImage = mockImages.find(img => img._id === req.params.id);
      if (mockImage) {
        // Check if file exists before returning
        const filename = mockImage.filename || mockImage.originalName;
        if (filename) {
          const uploadsPath = getGalleryFilePath(filename);
          const existsInUploads = await fileExists(uploadsPath);
          
          if (existsInUploads) {
            return res.json(mockImage);
          } else {
            console.warn(`⚠️  Image file not found: ${filename}`);
            return res.status(404).json({ message: 'Image file not found' });
          }
        }
        return res.json(mockImage);
      }
      return res.status(404).json({ message: 'Image not found' });
    }

    const image = await Gallery.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }
    
    // Check if file exists before returning
    const filename = image.filename || image.originalName;
    if (filename) {
      const uploadsPath = getGalleryFilePath(filename);
      const existsInUploads = await fileExists(uploadsPath);
      
      if (!existsInUploads) {
        console.warn(`⚠️  Image file not found: ${filename}`);
        return res.status(404).json({ message: 'Image file not found' });
      }
    }
    
    res.json(image);
  } catch (error) {
    console.error('Get image error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/gallery
// @desc    Create new gallery image
// @access  Private (Editor)
router.post('/', [
  authenticateToken,
  requireEditor,
  body('filename').notEmpty().trim(),
  body('originalName').notEmpty().trim(),
  body('category').isIn(['hero', 'gallery', 'footer', 'events', 'food', 'cocktails']),
  body('title').optional().trim().isLength({ max: 200 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('tags').optional().isArray(),
  body('altText').optional().trim().isLength({ max: 200 })
], async (req, res) => {
  try {
    console.log('📝 Creating gallery entry with data:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if database is connected
    if (!req.app.locals.dbConnected) {
      console.log('⚠️  Database not connected, using mock response');
      // For mock data, return a mock response
      const mockImage = {
        _id: `mock${Date.now()}`,
        ...req.body,
        order: 0,
        isActive: true,
        featured: false,
        tags: [],
        imagePath: `/gallery/${req.body.filename}`,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      return res.status(201).json(mockImage);
    }

    console.log('✅ Database connected, creating real gallery entry');

    // Check if image already exists
    const existingImage = await Gallery.findOne({ filename: req.body.filename });
    if (existingImage) {
      console.log('❌ Image already exists:', req.body.filename);
      return res.status(400).json({ message: 'Image with this filename already exists' });
    }

    // Get the next order number for this category
    const lastImage = await Gallery.findOne({ category: req.body.category })
      .sort({ order: -1 });
    const nextOrder = lastImage ? lastImage.order + 1 : 0;

    const image = new Gallery({
      ...req.body,
      order: nextOrder,
      imagePath: `/gallery/${req.body.filename}`
    });

    console.log('💾 Saving gallery image:', image);

    await image.save();
    console.log('✅ Gallery image saved successfully:', image._id);
    
    res.status(201).json(image);
  } catch (error) {
    console.error('❌ Create image error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/gallery/:id
// @desc    Update gallery image
// @access  Private (Editor)
router.put('/:id', [
  authenticateToken,
  requireEditor,
  body('title').optional().trim().isLength({ max: 200 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('category').optional().isIn(['hero', 'gallery', 'footer', 'events', 'food', 'cocktails']),
  body('tags').optional().isArray(),
  body('altText').optional().trim().isLength({ max: 200 })
], async (req, res) => {
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

    res.json(image);
  } catch (error) {
    console.error('Update image error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/gallery/:id
// @desc    Delete gallery image and its thumbnail
// @access  Private (Editor)
router.delete('/:id', [authenticateToken, requireEditor], async (req, res) => {
  try {
    // Check if database is connected
    if (!req.app.locals.dbConnected) {
      // For mock data, just return success
      if (req.params.id.startsWith('mock')) {
        return res.json({ message: 'Image deleted successfully' });
      }
    }

    const image = await Gallery.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }

    const filename = image.filename || image.originalName;
    
    // Delete the main image file
    const uploadsPath = getGalleryFilePath(filename);
    try {
      if (await fileExists(uploadsPath)) {
        await fs.unlink(uploadsPath);
        console.log(`✅ Deleted image: ${filename}`);
      }
    } catch (fileError) {
      console.warn(`⚠️  Error deleting image file: ${fileError.message}`);
    }
    
    // Delete the thumbnail file
    if (filename) {
      const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
      const thumbnailPath = path.join(__dirname, '../uploads/gallery/thumbnails', `${nameWithoutExt}_thumb.jpg`);
      try {
        if (await fileExists(thumbnailPath)) {
          await fs.unlink(thumbnailPath);
          console.log(`✅ Deleted thumbnail: ${nameWithoutExt}_thumb.jpg`);
        }
      } catch (thumbError) {
        console.warn(`⚠️  Error deleting thumbnail: ${thumbError.message}`);
      }
    }

    // Delete from database
    await Gallery.findByIdAndDelete(req.params.id);
    res.json({ message: 'Image and thumbnail deleted successfully' });
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/gallery/:id/toggle
// @desc    Toggle image active status
// @access  Private (Editor)
router.put('/:id/toggle', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const image = await Gallery.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }

    image.isActive = !image.isActive;
    await image.save();

    res.json(image);
  } catch (error) {
    console.error('Toggle image error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/gallery/:id/feature
// @desc    Toggle image featured status
// @access  Private (Editor)
router.put('/:id/feature', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const image = await Gallery.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }

    image.featured = !image.featured;
    await image.save();

    res.json(image);
  } catch (error) {
    console.error('Feature image error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/gallery/reorder
// @desc    Reorder gallery images
// @access  Private (Editor)
router.put('/reorder', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const { category, imageIds } = req.body;

    if (!category || !Array.isArray(imageIds)) {
      return res.status(400).json({ message: 'Category and imageIds array required' });
    }

    // Update order for each image
    const updatePromises = imageIds.map((id, index) => {
      return Gallery.findByIdAndUpdate(id, { order: index }, { new: true });
    });

    await Promise.all(updatePromises);

    // Get updated images
    const images = await Gallery.find({ category })
      .sort({ order: 1 });

    res.json(images);
  } catch (error) {
    console.error('Reorder images error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});



module.exports = router;


