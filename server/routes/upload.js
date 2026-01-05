const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { authenticateToken, requireEditor } = require('../middleware/auth');

const router = express.Router();

// Helper function to generate thumbnail from uploaded image
async function generateThumbnail(imagePath, filename) {
  try {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    const thumbnailPath = path.join(__dirname, '../uploads/gallery/thumbnails', `${nameWithoutExt}_thumb.jpg`);
    const thumbnailDir = path.dirname(thumbnailPath);
    
    // Ensure thumbnails directory exists
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
    }
    
    // Generate 200x200px thumbnail with quality optimization
    await sharp(imagePath)
      .resize(200, 200, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ 
        quality: 85,
        mozjpeg: true 
      })
      .toFile(thumbnailPath);
    
    console.log(`   ✅ Generated thumbnail: ${nameWithoutExt}_thumb.jpg`);
    return thumbnailPath;
  } catch (error) {
    console.error(`   ⚠️  Error generating thumbnail for ${filename}:`, error.message);
    // Don't fail upload if thumbnail generation fails
    return null;
  }
}


  // Ensure upload directories exist
const createUploadDirs = () => {
  // Use absolute paths based on server directory
  const serverBasePath = path.join(__dirname, '..');
  const dirs = [
    path.join(serverBasePath, 'uploads'),
    path.join(serverBasePath, 'uploads/gallery'),
    path.join(serverBasePath, 'uploads/items'),
    path.join(serverBasePath, 'uploads/gallery/thumbnails'),
    path.join(serverBasePath, 'uploads/logo'),
    path.join(serverBasePath, 'uploads/about')
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Created directory: ${dir}`);
    }
  });
};

createUploadDirs();

// Configure multer for different file types
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = path.join(__dirname, '../uploads/');
    
    console.log('📁 Multer file fieldname:', file.fieldname);
    
    if (file.fieldname === 'cocktail') {
      uploadPath = path.join(uploadPath, 'cocktails/');
    } else if (file.fieldname === 'gallery') {
      uploadPath = path.join(uploadPath, 'gallery/');
    } else if (file.fieldname === 'logo') {
      uploadPath = path.join(uploadPath, 'logo/');
    } else if (file.fieldname === 'aboutImage') {
      uploadPath = path.join(uploadPath, 'about/');
      console.log('✅ About image detected - saving to about folder');
    } else {
      uploadPath = path.join(uploadPath, 'gallery/');
      console.log('⚠️  Unknown fieldname, defaulting to gallery folder');
    }
    
    console.log('📁 Multer destination path:', uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const filename = `${name}-${uniqueSuffix}${ext}`;
    console.log('📝 Generated filename:', filename);
    cb(null, filename);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = /jpeg|jpg|png|gif|webp|svg/;
  const allowedVideoTypes = /mp4|mov|avi|webm/;
  
  // Log file information for debugging
  const ext = path.extname(file.originalname).toLowerCase();
  console.log('🔍 FileFilter - File info:', {
    fieldname: file.fieldname,
    originalname: file.originalname,
    mimetype: file.mimetype,
    extension: ext,
    isLogo: file.fieldname === 'logo'
  });
  
  if (file.fieldname === 'cocktail') {
    // For cocktail videos
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedVideoTypes.test(ext)) {
      console.log('✅ FileFilter - Cocktail video accepted');
      cb(null, true);
    } else {
      console.log('❌ FileFilter - Cocktail video rejected:', ext);
      cb(new Error('Only video files are allowed for cocktails'), false);
    }
  } else if (file.fieldname === 'logo' || file.fieldname === 'aboutImage') {
    // For logo images and about images (SVG preferred for logos)
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Define allowed extensions explicitly
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    
    // Check if extension is in the allowed list
    if (allowedExtensions.includes(ext)) {
      console.log('✅ FileFilter - Logo/About image accepted:', { ext, mimetype: file.mimetype, fieldname: file.fieldname });
      cb(null, true);
    } else {
      console.log('❌ FileFilter - Logo/About image rejected:', { 
        ext, 
        mimetype: file.mimetype, 
        fieldname: file.fieldname,
        originalname: file.originalname
      });
      cb(new Error(`Only image files (SVG preferred) are allowed. Received extension: ${ext || 'none'}, MIME type: ${file.mimetype || 'unknown'}`), false);
    }
  } else {
    // For gallery images (default)
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedImageTypes.test(ext)) {
      console.log('✅ FileFilter - Gallery image accepted');
      cb(null, true);
    } else {
      console.log('❌ FileFilter - Gallery image rejected:', ext);
      cb(new Error('Only image files are allowed for gallery'), false);
    }
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    files: 10 // Max 10 files at once
  }
});

// @route   POST /api/upload/cocktail
// @desc    Upload cocktail video
// @access  Private (Editor)
router.post('/cocktail', [
  authenticateToken,
  requireEditor,
  upload.single('cocktail')
], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const fileInfo = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: `/uploads/items/${req.file.filename}`
    };

    res.json({
      message: 'Cocktail video uploaded successfully',
      file: fileInfo
    });
  } catch (error) {
    console.error('Cocktail upload error:', error);
    res.status(500).json({ message: 'Upload failed' });
  }
});

// @route   POST /api/upload/gallery
// @desc    Upload gallery image(s)
// @access  Private (Editor)
router.post('/gallery', [
  authenticateToken,
  requireEditor,
  upload.array('gallery', 10)
], async (req, res) => {
  try {
    console.log('📤 Gallery upload request received');
    console.log('🔐 User authenticated:', req.user.email);
    console.log('📁 Files received:', req.files ? req.files.length : 'No files');
    
    if (!req.files || req.files.length === 0) {
      console.log('❌ No files in request');
      return res.status(400).json({ message: 'No files uploaded' });
    }

    console.log('📋 Processing files:');

    // Process each uploaded file
    const uploadedFiles = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      console.log(`   Processing: ${file.originalname} -> ${file.filename}`);
      console.log(`      Size: ${file.size} bytes`);
      console.log(`      MIME: ${file.mimetype}`);
      console.log(`      Saved to: ${file.path}`);
      console.log(`      Full path: ${path.resolve(file.path)}`);
      
      // Verify file exists in server/uploads/gallery
      const serverGalleryPath = path.join(__dirname, '../uploads/gallery', file.filename);
      if (fs.existsSync(serverGalleryPath)) {
        console.log(`   ✅ File confirmed in server/uploads/gallery: ${serverGalleryPath}`);
      } else {
        console.warn(`   ⚠️  File not found at expected location: ${serverGalleryPath}`);
      }
      
      // Generate thumbnail for the uploaded image
      await generateThumbnail(file.path, file.filename);
      
      uploadedFiles.push({
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: `/gallery/${file.filename}`
      });
    }

    console.log('✅ Upload successful, returning file info:', uploadedFiles);

    res.json({
      message: `${uploadedFiles.length} image(s) uploaded successfully`,
      files: uploadedFiles
    });
  } catch (error) {
    console.error('❌ Gallery upload error:', error);
    res.status(500).json({ message: 'Upload failed' });
  }
});

// @route   POST /api/upload/about-image
// @desc    Upload about page image and optionally copy to section file
// @access  Private (Editor)
router.post('/about-image', [
  authenticateToken,
  requireEditor,
  upload.single('aboutImage')
], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Check if it's an image file
    const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
    if (!allowedImageTypes.test(path.extname(req.file.originalname).toLowerCase())) {
      return res.status(400).json({ message: 'Only image files are allowed for about images' });
    }

    // Use the actual file path from multer (req.file.path)
    // This ensures we use the file where multer actually saved it
    let actualFilePath = req.file.path;
    console.log(`   📁 File was saved to: ${actualFilePath}`);
    
    // Verify file exists at the actual location
    if (!fs.existsSync(actualFilePath)) {
      console.error(`   ❌ File not found at: ${actualFilePath}`);
      return res.status(500).json({ message: 'Uploaded file not found' });
    }
    
    // Check if file was saved to gallery instead of about (this shouldn't happen, but let's handle it)
    if (actualFilePath.includes('uploads/gallery') && !actualFilePath.includes('uploads/about')) {
      console.warn(`   ⚠️  File was saved to gallery instead of about! Moving it...`);
      // Move file to about folder
      const aboutDir = path.join(__dirname, '../uploads/about');
      if (!fs.existsSync(aboutDir)) {
        fs.mkdirSync(aboutDir, { recursive: true });
      }
      const correctAboutPath = path.join(aboutDir, req.file.filename);
      fs.renameSync(actualFilePath, correctAboutPath);
      console.log(`   ✅ Moved file to: ${correctAboutPath}`);
      // Update the path to use
      actualFilePath = correctAboutPath;
    }

    // Check if sectionNumber is provided in query or body
    // Note: With multer, non-file fields are in req.body
    const sectionNumber = req.query.sectionNumber || req.body?.sectionNumber;
    
    console.log('📋 Section number from request:', sectionNumber);
    console.log('📋 Request body:', req.body);
    
    // If section number provided, save directly to section file and delete temporary file
    if (sectionNumber) {
      const sectionFileName = `section${sectionNumber}.jpg`;
      const sectionFilePath = path.join(__dirname, '../uploads/about', sectionFileName);
      
      // Ensure about directory exists
      const aboutDir = path.dirname(sectionFilePath);
      if (!fs.existsSync(aboutDir)) {
        fs.mkdirSync(aboutDir, { recursive: true });
      }
      
      try {
        // Overwrite existing file if it exists
        if (fs.existsSync(sectionFilePath)) {
          fs.unlinkSync(sectionFilePath);
          console.log(`   🔄 Overwriting existing ${sectionFileName}`);
        }

        // Get file extension from original file
        const ext = path.extname(req.file.originalname).toLowerCase();

        // Convert to JPEG format using sharp (or copy if already JPEG)
        // Use actualFilePath which is the real location of the uploaded file
        if (ext === '.jpg' || ext === '.jpeg') {
          // Already JPEG, just copy
          fs.copyFileSync(actualFilePath, sectionFilePath);
        } else {
          // Convert to JPEG using sharp
          await sharp(actualFilePath)
            .jpeg({ 
              quality: 90,
              mozjpeg: true 
            })
            .toFile(sectionFilePath);
        }

        // Delete the temporary uploaded file since we have the section file
        try {
          if (fs.existsSync(actualFilePath)) {
            fs.unlinkSync(actualFilePath);
            console.log(`   🗑️  Deleted temporary file: ${req.file.filename}`);
          }
        } catch (deleteError) {
          console.warn(`   ⚠️  Could not delete temporary file:`, deleteError);
        }

        console.log(`   ✅ Saved directly to ${sectionFileName}`);
        
        const fileInfo = {
          filename: sectionFileName,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          path: `/uploads/about/${sectionFileName}`,
          sectionPath: `/uploads/about/${sectionFileName}`
        };

        console.log('✅ About image uploaded and saved to section:', fileInfo.sectionPath);

        return res.json({
          message: 'About image uploaded and saved to section file successfully',
          file: fileInfo
        });
      } catch (copyError) {
        console.error(`   ⚠️  Error saving to section file:`, copyError);
        // Continue with regular response even if copy fails
      }
    }

    // Ensure the file is in the about folder (if it wasn't moved earlier)
    if (actualFilePath.includes('uploads/gallery') && !actualFilePath.includes('uploads/about')) {
      const aboutDir = path.join(__dirname, '../uploads/about');
      if (!fs.existsSync(aboutDir)) {
        fs.mkdirSync(aboutDir, { recursive: true });
      }
      const correctAboutPath = path.join(aboutDir, req.file.filename);
      fs.renameSync(actualFilePath, correctAboutPath);
      actualFilePath = correctAboutPath;
      console.log(`   ✅ Moved file to about folder: ${correctAboutPath}`);
    }

    const fileInfo = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: `/uploads/about/${req.file.filename}`
    };

    console.log('✅ About image uploaded:', fileInfo.path);
    console.log(`   📁 Saved to: ${actualFilePath}`);

    res.json({
      message: 'About image uploaded successfully',
      file: fileInfo
    });
  } catch (error) {
    console.error('About image upload error:', error);
    res.status(500).json({ message: 'Upload failed' });
  }
});

// @route   POST /api/upload/copy-to-section
// @desc    Copy uploaded image to about folder with section naming
// @access  Private (Editor)
router.post('/copy-to-section', [
  authenticateToken,
  requireEditor
], async (req, res) => {
  try {
    const { sourcePath, sectionNumber } = req.body;
    
    if (!sourcePath || !sectionNumber) {
      return res.status(400).json({ message: 'sourcePath and sectionNumber are required' });
    }

    const aboutPath = path.join(__dirname, '../uploads/about');
    if (!fs.existsSync(aboutPath)) {
      fs.mkdirSync(aboutPath, { recursive: true });
    }

    const sectionFileName = `section${sectionNumber}.jpg`;
    const aboutFilePath = path.join(aboutPath, sectionFileName);
    
    // Get source file path - handle both /uploads/about/filename and full paths
    let sourceFilePath;
    if (sourcePath.startsWith('/uploads/')) {
      // Remove /uploads prefix and construct full path
      const relativePath = sourcePath.replace('/uploads/', '');
      sourceFilePath = path.join(__dirname, '../uploads', relativePath);
    } else {
      sourceFilePath = sourcePath;
    }

    if (!fs.existsSync(sourceFilePath)) {
      return res.status(404).json({ message: 'Source file not found' });
    }

    try {
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

      console.log(`   ✅ Copied/Converted to server/uploads/about/${sectionFileName}`);

      res.json({
        message: 'Image copied to section file successfully',
        path: `/uploads/about/${sectionFileName}`
      });
    } catch (copyError) {
      console.error(`   ❌ Error copying to section file:`, copyError);
      res.status(500).json({ message: 'Failed to copy file' });
    }
  } catch (error) {
    console.error('Copy to section error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/upload/logo
// @desc    Upload logo image
// @access  Private (Editor)
router.post('/logo', [
  authenticateToken,
  requireEditor,
  (req, res, next) => {
    upload.single('logo')(req, res, (err) => {
      if (err) {
        console.error('❌ Multer error in logo upload:', err.message);
        console.error('❌ Error details:', {
          code: err.code,
          field: err.field,
          message: err.message
        });
        return res.status(400).json({ 
          message: err.message || 'File upload failed',
          error: 'FILE_FILTER_REJECTED'
        });
      }
      next();
    });
  }
], async (req, res) => {
  try {
    console.log('📥 Logo upload request received');
    
    if (!req.file) {
      console.log('❌ No file in request');
      return res.status(400).json({ message: 'No file uploaded. Please select a file.' });
    }
    
    console.log('✅ File received:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      filename: req.file.filename
    });

    // Check if it's an image file (SVG is preferred)
    const ext = path.extname(req.file.originalname).toLowerCase();
    const allowedImageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    
    // Explicitly check for SVG first (preferred)
    if (ext !== '.svg' && !allowedImageExtensions.includes(ext)) {
      console.log('❌ Route validation rejected file:', { ext, originalname: req.file.originalname });
      return res.status(400).json({ 
        message: `Only image files (SVG preferred) are allowed for logo. Received: ${ext}` 
      });
    }
    
    console.log('✅ Route validation passed for:', ext);

    // Import Content model to check for existing logo
    const Content = require('../models/Content');

    // Find existing logo content
    const existingLogo = await Content.findOne({ 
      page: 'global', 
      section: 'header', 
      type: 'logo' 
    });

    // If there's an existing logo, delete the old file
    if (existingLogo && existingLogo.content && existingLogo.content.startsWith('/uploads/logo/')) {
      const oldFilePath = path.join(__dirname, '..', existingLogo.content);
      console.log('Deleting old logo file:', oldFilePath);
      
      try {
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
          console.log('✅ Old logo file deleted successfully');
        } else {
          console.log('⚠️  Old logo file not found, continuing with upload');
        }
      } catch (deleteError) {
        console.error('❌ Error deleting old logo file:', deleteError);
        // Continue with upload even if deletion fails
      }
    }

    const fileInfo = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: `/uploads/logo/${req.file.filename}`
    };

    console.log('✅ New logo uploaded:', fileInfo.path);

    res.json({
      message: 'Logo uploaded successfully',
      file: fileInfo
    });
  } catch (error) {
    console.error('Logo upload error:', error);
    res.status(500).json({ message: 'Upload failed' });
  }
});

// @route   DELETE /api/upload/:type/:filename
// @desc    Delete uploaded file
// @access  Private (Editor)
router.delete('/:type/:filename', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const { type, filename } = req.params;
    
    if (!['cocktails', 'gallery'].includes(type)) {
      return res.status(400).json({ message: 'Invalid file type' });
    }

    const filePath = path.join('server/uploads', type, filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ message: 'File deleted successfully' });
    } else {
      res.status(404).json({ message: 'File not found' });
    }
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ message: 'Delete failed' });
  }
});

// @route   GET /api/upload/files/:type
// @desc    Get list of uploaded files by type
// @access  Private (Editor)
router.get('/files/:type', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const { type } = req.params;
    
    if (!['cocktails', 'gallery'].includes(type)) {
      return res.status(400).json({ message: 'Invalid file type' });
    }

    const uploadPath = path.join('server/uploads', type);
    
    if (!fs.existsSync(uploadPath)) {
      return res.json([]);
    }

    const files = fs.readdirSync(uploadPath)
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        if (type === 'cocktails') {
          return /\.(mp4|mov|avi|webm)$/.test(ext);
        } else {
          return /\.(jpeg|jpg|png|gif|webp)$/.test(ext);
        }
      })
      .map(file => {
        const filePath = path.join(uploadPath, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          size: stats.size,
          created: stats.birthtime,
          path: `/uploads/${type}/${file}`
        };
      })
      .sort((a, b) => b.created - a.created);

    res.json(files);
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ message: 'Failed to get files' });
  }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large. Maximum size is 50MB.' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: 'Too many files. Maximum is 10 files.' });
    }
    return res.status(400).json({ message: 'Upload error' });
  }
  
  if (error.message) {
    return res.status(400).json({ message: error.message });
  }
  
  next(error);
});

module.exports = router;


