const express = require('express');
const { body, validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Content = require('../models/Content');
const Gallery = require('../models/Gallery');
const { authenticateToken, requireEditor } = require('../middleware/auth');

const router = express.Router();

// Helper function to copy an uploaded image to a section file
async function copyImageToSection(sourceImagePath, sectionNumber) {
  try {
    const aboutPath = path.join(__dirname, '../uploads/about');
    if (!fs.existsSync(aboutPath)) {
      fs.mkdirSync(aboutPath, { recursive: true });
    }

    const sectionFileName = `section${sectionNumber}.jpg`;
    const aboutFilePath = path.join(aboutPath, sectionFileName);
    
    // Get source file path - handle both /uploads paths and full paths
    let sourceFilePath;
    if (sourceImagePath.startsWith('/uploads/')) {
      // Remove /uploads prefix and construct full path
      const relativePath = sourceImagePath.replace('/uploads/', '');
      sourceFilePath = path.join(__dirname, '../uploads', relativePath);
    } else if (sourceImagePath.startsWith('/')) {
      // Absolute path from root
      sourceFilePath = path.join(__dirname, '..', sourceImagePath);
    } else {
      sourceFilePath = sourceImagePath;
    }

    if (!fs.existsSync(sourceFilePath)) {
      console.warn(`⚠️  Source image not found: ${sourceFilePath} (from ${sourceImagePath})`);
      return false;
    }

    // Overwrite existing file if it exists
    if (fs.existsSync(aboutFilePath)) {
      fs.unlinkSync(aboutFilePath);
      console.log(`   🔄 Overwriting existing ${sectionFileName}`);
    }

    // Get file extension
    const ext = path.extname(sourceFilePath).toLowerCase();

    // Convert to JPEG format using sharp
    if (ext === '.jpg' || ext === '.jpeg') {
      // Already JPEG, just copy
      fs.copyFileSync(sourceFilePath, aboutFilePath);
    } else {
      // Convert to JPEG using sharp
      await sharp(sourceFilePath)
        .jpeg({ 
          quality: 90,
          mozjpeg: true 
        })
        .toFile(aboutFilePath);
    }

    console.log(`   ✅ Copied/Converted ${sourceImagePath} to ${sectionFileName}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Error copying image to section ${sectionNumber}:`, error.message);
    return false;
  }
}

// NOTE: Removed copyLatestGalleryImagesToAbout function - about section images
// should only come from images uploaded directly to the about sections, not from gallery

// @route   GET /api/content
// @desc    Get all content
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { page, section, type, active } = req.query;
    let query = {};

    if (page) {
      query.page = page;
    }
    if (section) {
      query.section = section;
    }
    if (type) {
      query.type = type;
    }
    if (active !== undefined) {
      query.isActive = active === 'true';
    }

    const content = await Content.find(query)
      .sort({ page: 1, order: 1, section: 1 });

    res.json(content);
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to check if section image file exists
function getSectionImagePath(sectionNumber) {
  const sectionFileName = `section${sectionNumber}.jpg`;
  const sectionFilePath = path.join(__dirname, '../uploads/about', sectionFileName);
  if (fs.existsSync(sectionFilePath)) {
    return `/uploads/about/${sectionFileName}`;
  }
  return null;
}

// @route   GET /api/content/about
// @desc    Get about page content (supports multi-section)
// @access  Public
router.get('/about', async (req, res) => {
  console.log('📥 GET /about request received');
  
  try {
    const aboutContent = await Content.find({ 
      page: 'about'
    }).sort({ order: 1, section: 1 });

    // Helper to pull image
    const getImage = (item, sectionNumber) => {
      const sectionFile = getSectionImagePath(sectionNumber);
      if (sectionFile) return sectionFile;
      if (item?.metadata?.get) return item.metadata.get('image') || '';
      if (item?.metadata?.image) return item.metadata.image || '';
      return '';
    };

    const sections = aboutContent.map((item, idx) => {
      const img = getImage(item, idx + 1);
      return {
        id: idx + 1,
        title: item.title || '',
        content: item.content || '',
        image: img,
        imageVisibility: item.isActive !== false
      };
    });

    // Legacy fields for backward compatibility
    const story = sections[0] || {};
    const mission = sections[1] || {};
    const team = sections[2] || {};

    const response = {
      storyTitle: story.title || 'Our Story',
      story: story.content || '',
      missionTitle: mission.title || '',
      mission: mission.content || '',
      teamTitle: team.title || '',
      team: team.content || '',
        images: {
        story: story.image || getSectionImagePath(1) || '',
        mission: mission.title || mission.content ? (mission.image || getSectionImagePath(2) || '') : '',
        team: team.title || team.content ? (team.image || getSectionImagePath(3) || '') : ''
        },
        imageVisibility: {
        story: story.imageVisibility !== false,
        mission: mission.title || mission.content ? mission.imageVisibility !== false : false,
        team: team.title || team.content ? team.imageVisibility !== false : false
      },
      sections: sections.length > 0 ? sections : [
        {
          id: 1,
          title: 'Our Story',
          content: '',
          image: getSectionImagePath(1) || '',
          imageVisibility: true
        }
      ]
    };

    res.json(response);
  } catch (error) {
    console.error('Get about content error:', error);
    res.json({
      storyTitle: 'Our Story',
      story: 'ECHO Catering has been at the forefront of culinary excellence, serving discerning clients with innovative menus and impeccable service. Our passion for quality ingredients and creative presentation has made us a trusted partner for events of all sizes.',
      missionTitle: '',
      mission: '',
      teamTitle: '',
      team: '',
      images: {
        story: getSectionImagePath(1) || '',
        mission: getSectionImagePath(2) || '',
        team: getSectionImagePath(3) || ''
      },
      imageVisibility: {
        story: true,
        mission: false,
        team: false
      },
      sections: [
        {
          id: 1,
          title: 'Our Story',
          content: '',
          image: getSectionImagePath(1) || '',
          imageVisibility: true
        }
      ]
    });
  }
});

// @route   PUT /api/content/about
// @desc    Update about page content
// @access  Private (Editor)
router.put('/about', [
  authenticateToken,
  requireEditor,
  body('sections').optional().isArray(),
  body('storyTitle').optional().trim().isLength({ max: 200 }),
  body('story').optional().trim().isLength({ max: 10000 }),
  body('missionTitle').optional().trim().isLength({ max: 200 }),
  body('mission').optional().trim().isLength({ max: 20000 }),
  body('teamTitle').optional().trim().isLength({ max: 200 }),
  body('team').optional().trim().isLength({ max: 10000 }),
  body('images').optional().isObject(),
  body('imageVisibility').optional().isObject()
], async (req, res) => {
  console.log('📥 PUT /about request received');
  console.log('🔐 User:', req.user?.email);
  console.log('📦 Request body:', req.body);
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { sections: incomingSections, storyTitle, story, missionTitle, mission, teamTitle, team, images: requestImages, imageVisibility } = req.body;

    // If sections array provided, upsert all sections using order
    if (Array.isArray(incomingSections) && incomingSections.length > 0) {
      // Remove existing about sections not in incoming list
      const existing = await Content.find({ page: 'about' }).sort({ order: 1, section: 1 });
      const keepIds = new Set();

      for (let i = 0; i < incomingSections.length; i++) {
        const sec = incomingSections[i];
        const order = i;
        const sectionKey = `section-${i + 1}`;
        const title = sec.title || '';
        const content = sec.content || '';
        const isActive = sec.imageVisibility !== false; // default true
        const imagePath = sec.image || '';

        let doc = await Content.findOne({ page: 'about', section: sectionKey });
        if (!doc) {
          doc = new Content({
        page: 'about',
            section: sectionKey,
        type: 'text',
            order
          });
        }
        doc.title = title;
        doc.content = content;
        doc.order = order;
        doc.isActive = isActive;
        doc.metadata = doc.metadata || new Map();
        doc.metadata.set('image', imagePath);
        await doc.save();
        keepIds.add(doc._id.toString());
      }

      // Delete any extra about sections not in the incoming list
      for (const item of existing) {
        if (!keepIds.has(item._id.toString())) {
          await Content.deleteOne({ _id: item._id });
        }
      }

      return res.json({ success: true });
    }

    // Legacy path (story/mission/team) retained for backward compatibility

    // Handle image visibility updates
    if (imageVisibility) {
      // Update image visibility for each section
      if (imageVisibility.story !== undefined) {
        storyContent.metadata = storyContent.metadata || new Map();
        storyContent.metadata.set('visible', imageVisibility.story);
        await storyContent.save();
      }
      if (imageVisibility.mission !== undefined) {
        missionContent.metadata = missionContent.metadata || new Map();
        missionContent.metadata.set('visible', imageVisibility.mission);
        await missionContent.save();
      }
      if (imageVisibility.team !== undefined) {
        teamContent.metadata = teamContent.metadata || new Map();
        teamContent.metadata.set('visible', imageVisibility.team);
        await teamContent.save();
      }
    }

    res.json({
      storyTitle: storyContent.title,
      story: storyContent.content,
      missionTitle: missionContent.title,
      mission: missionContent.content,
      teamTitle: teamContent.title,
      team: teamContent.content,
      images: {
        story: storyContent.metadata?.get('image') || '',
        mission: missionContent.metadata?.get('image') || '',
        team: teamContent.metadata?.get('image') || ''
      },
      imageVisibility: {
        story: storyContent.metadata?.get('visible') !== false,
        mission: missionContent.metadata?.get('visible') !== false,
        team: teamContent.metadata?.get('visible') !== false
      }
    });
  } catch (error) {
    console.error('Update about content error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/content/logo
// @desc    Get current logo information
// @access  Public
router.get('/logo', async (req, res) => {
  try {
    const logoContent = await Content.findOne({ 
      page: 'global', 
      section: 'header', 
      type: 'logo' 
    });
    
    if (logoContent) {
      res.json(logoContent);
    } else {
      // Return default logo if none in database
      res.json({
        content: '',
        title: 'ECHO Catering Logo',
        altText: 'ECHO Catering Logo',
        page: 'global',
        section: 'header',
        type: 'logo'
      });
    }
  } catch (error) {
    console.error('Get logo error:', error);
    // Return default logo even if database fails
    res.json({
      content: '',
      title: 'ECHO Catering Logo',
      altText: 'ECHO Catering Logo',
      page: 'global',
      section: 'header',
      type: 'logo'
    });
  }
});

// @route   PUT /api/content/logo
// @desc    Update logo information
// @access  Private (Editor)
router.put('/logo', [
  authenticateToken,
  requireEditor,
  body('content').notEmpty().trim().isLength({ max: 500 }),
  body('title').optional().trim().isLength({ max: 200 }),
  body('altText').optional().trim().isLength({ max: 200 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    let logoContent = await Content.findOne({ 
      page: 'global', 
      section: 'header', 
      type: 'logo' 
    });

    if (logoContent) {
      // Update existing logo
      Object.assign(logoContent, req.body);
      await logoContent.save();
    } else {
      // Create new logo content
      logoContent = new Content({
        page: 'global',
        section: 'header',
        type: 'logo',
        content: req.body.content, // This will be the logo file path
        title: req.body.title || 'ECHO Catering Logo',
        altText: req.body.altText || 'ECHO Catering Logo',
        order: 0,
        isActive: true
      });
      await logoContent.save();
    }

    res.json(logoContent);
  } catch (error) {
    console.error('Update logo error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/content/:id
// @desc    Get content by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const content = await Content.findById(req.params.id);
    if (!content) {
      return res.status(404).json({ message: 'Content not found' });
    }
    res.json(content);
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/content/page/:page
// @desc    Get all content for a specific page
// @access  Public
router.get('/page/:page', async (req, res) => {
  try {
    const content = await Content.find({ 
      page: req.params.page,
      isActive: true 
    }).sort({ order: 1, section: 1 });

    res.json(content);
  } catch (error) {
    console.error('Get page content error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/content
// @desc    Create new content
// @access  Private (Editor)
router.post('/', [
  authenticateToken,
  requireEditor,
  body('page').isIn(['home', 'echo-originals', 'echo-classics', 'spirits', 'event-gallery']),
  body('section').notEmpty().trim().isLength({ max: 100 }),
  body('type').isIn(['text', 'html', 'image', 'video', 'info-box', 'hero', 'footer']),
  body('content').notEmpty().trim().isLength({ max: 10000 }),
  body('title').optional().trim().isLength({ max: 200 }),
  body('position').optional().isIn(['left', 'right', 'center', 'top', 'bottom'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if content already exists for this page/section/type combination
    const existingContent = await Content.findOne({
      page: req.body.page,
      section: req.body.section,
      type: req.body.type
    });

    if (existingContent) {
      return res.status(400).json({ 
        message: 'Content already exists for this page/section/type combination' 
      });
    }

    // Get the next order number for this page
    const lastContent = await Content.findOne({ page: req.body.page })
      .sort({ order: -1 });
    const nextOrder = lastContent ? lastContent.order + 1 : 0;

    const content = new Content({
      ...req.body,
      order: nextOrder
    });

    await content.save();
    res.status(201).json(content);
  } catch (error) {
    console.error('Create content error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/content/:id
// @desc    Update content
// @access  Private (Editor)
router.put('/:id', [
  authenticateToken,
  requireEditor,
  body('content').optional().trim().isLength({ max: 10000 }),
  body('title').optional().trim().isLength({ max: 200 }),
  body('position').optional().isIn(['left', 'right', 'center', 'top', 'bottom']),
  body('styles').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const content = await Content.findById(req.params.id);
    if (!content) {
      return res.status(404).json({ message: 'Content not found' });
    }

    Object.assign(content, req.body);
    await content.save();

    res.json(content);
  } catch (error) {
    console.error('Update content error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/content/:id
// @desc    Delete content
// @access  Private (Editor)
router.delete('/:id', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const content = await Content.findById(req.params.id);
    if (!content) {
      return res.status(404).json({ message: 'Content not found' });
    }

    await Content.findByIdAndDelete(req.params.id);
    res.json({ message: 'Content deleted successfully' });
  } catch (error) {
    console.error('Delete content error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/content/:id/toggle
// @desc    Toggle content active status
// @access  Private (Editor)
router.put('/:id/toggle', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const content = await Content.findById(req.params.id);
    if (!content) {
      return res.status(404).json({ message: 'Content not found' });
    }

    content.isActive = !content.isActive;
    await content.save();

    res.json(content);
  } catch (error) {
    console.error('Toggle content error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/content/reorder
// @desc    Reorder content
// @access  Private (Editor)
router.put('/reorder', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const { page, contentIds } = req.body;

    if (!page || !Array.isArray(contentIds)) {
      return res.status(400).json({ message: 'Page and contentIds array required' });
    }

    // Update order for each content item
    const updatePromises = contentIds.map((id, index) => {
      return Content.findByIdAndUpdate(id, { order: index }, { new: true });
    });

    await Promise.all(updatePromises);

    // Get updated content
    const content = await Content.find({ page })
      .sort({ order: 1 });

    res.json(content);
  } catch (error) {
    console.error('Reorder content error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/content/pages
// @desc    Get all pages with content counts
// @access  Public
router.get('/pages', async (req, res) => {
  try {
    const pages = await Content.aggregate([
      {
        $group: {
          _id: '$page',
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          sections: { $addToSet: '$section' }
        }
      },
      {
        $project: {
          page: '$_id',
          count: 1,
          activeCount: 1,
          sectionCount: { $size: '$sections' },
          _id: 0
        }
      },
      {
        $sort: { page: 1 }
      }
    ]);

    res.json(pages);
  } catch (error) {
    console.error('Get pages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/content/sections/:page
// @desc    Get all sections for a specific page
// @access  Public
router.get('/sections/:page', async (req, res) => {
  try {
    const sections = await Content.distinct('section', { page: req.params.page });
    res.json(sections.sort());
  } catch (error) {
    console.error('Get sections error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;


