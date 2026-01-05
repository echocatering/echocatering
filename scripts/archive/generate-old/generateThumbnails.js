// Script to generate thumbnails for existing gallery images
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const galleryPath = path.join(__dirname, '../server/uploads/gallery');
const thumbnailsPath = path.join(__dirname, '../server/uploads/gallery/thumbnails');

// Ensure thumbnails directory exists
if (!fs.existsSync(thumbnailsPath)) {
  fs.mkdirSync(thumbnailsPath, { recursive: true });
  console.log('📁 Created thumbnails directory');
}

// Supported image extensions
const imageExtensions = /\.(jpeg|jpg|png|gif|webp)$/i;

async function generateThumbnail(imagePath, filename) {
  try {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    const thumbnailPath = path.join(thumbnailsPath, `${nameWithoutExt}_thumb.jpg`);
    
    // Skip if thumbnail already exists
    if (fs.existsSync(thumbnailPath)) {
      console.log(`   ⏭️  Thumbnail already exists: ${nameWithoutExt}_thumb.jpg`);
      return true;
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
    return true;
  } catch (error) {
    console.error(`   ❌ Error generating thumbnail for ${filename}:`, error.message);
    return false;
  }
}

async function processAllImages() {
  try {
    console.log('🖼️  Generating thumbnails for existing gallery images...');
    console.log(`📁 Gallery path: ${galleryPath}`);
    
    if (!fs.existsSync(galleryPath)) {
      console.error('❌ Gallery directory does not exist:', galleryPath);
      return;
    }
    
    const files = fs.readdirSync(galleryPath);
    console.log(`📊 Found ${files.length} items in gallery folder`);
    
    const imageFiles = files.filter(file => {
      // Skip hidden files, directories, and the thumbnails folder
      if (file.startsWith('.') || file === 'thumbnails') {
        return false;
      }
      
      // Check if it's an image file
      if (!imageExtensions.test(file)) {
        return false;
      }
      
      // Check if it's actually a file (not a directory)
      const filePath = path.join(galleryPath, file);
      const stats = fs.statSync(filePath);
      return stats.isFile();
    });
    
    console.log(`🖼️  Found ${imageFiles.length} image files to process\n`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const file of imageFiles) {
      const imagePath = path.join(galleryPath, file);
      console.log(`📸 Processing: ${file}`);
      
      const success = await generateThumbnail(imagePath, file);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }
    
    console.log(`\n✅ Complete! Generated ${successCount} thumbnails`);
    if (failCount > 0) {
      console.log(`⚠️  Failed to generate ${failCount} thumbnails`);
    }
  } catch (error) {
    console.error('❌ Error processing images:', error);
  }
}

// Run the script
processAllImages();

