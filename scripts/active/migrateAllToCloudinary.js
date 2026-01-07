const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import models
const Gallery = require('../../server/models/Gallery');
const Content = require('../../server/models/Content');
const Cocktail = require('../../server/models/Cocktail');
const { uploadToCloudinary } = require('../../server/utils/cloudinary');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Migration statistics
const stats = {
  videos: { success: 0, failed: 0, skipped: 0 },
  gallery: { success: 0, failed: 0, skipped: 0 },
  about: { success: 0, failed: 0, skipped: 0 },
  logo: { success: 0, failed: 0, skipped: 0 },
};

/**
 * Migrate videos to Cloudinary
 */
const migrateVideos = async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🎥 MIGRATING VIDEOS TO CLOUDINARY');
  console.log('='.repeat(60) + '\n');

  try {
    // Check backup folder first
    const backupDir = path.join(process.env.HOME, 'echo-catering-video-backup');
    const localDir = path.join(__dirname, '../../server/uploads/items');
    
    let videoFiles = [];
    
    // Check backup folder
    if (fs.existsSync(backupDir)) {
      const backupFiles = fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.mp4'))
        .map(f => ({ path: path.join(backupDir, f), source: 'backup', filename: f }));
      videoFiles.push(...backupFiles);
    }
    
    // Check local folder
    if (fs.existsSync(localDir)) {
      const localFiles = fs.readdirSync(localDir)
        .filter(f => f.endsWith('.mp4'))
        .map(f => ({ path: path.join(localDir, f), source: 'local', filename: f }));
      videoFiles.push(...localFiles);
    }

    if (videoFiles.length === 0) {
      console.log('⚠️  No video files found to migrate');
      return;
    }

    console.log(`📊 Found ${videoFiles.length} video files to migrate\n`);

    for (let i = 0; i < videoFiles.length; i++) {
      const video = videoFiles[i];
      console.log(`\n[${i + 1}/${videoFiles.length}] Processing: ${video.filename} (from ${video.source})`);

      try {
        // Extract item number from filename (e.g., "1.mp4" -> 1, "1_icon.mp4" -> 1)
        const itemNumberMatch = video.filename.match(/^(\d+)/);
        if (!itemNumberMatch) {
          console.log(`   ⚠️  Cannot extract item number from filename, skipping`);
          stats.videos.skipped++;
          continue;
        }

        const itemNumber = parseInt(itemNumberMatch[1]);
        const isIcon = video.filename.includes('_icon');

        // Find cocktail by itemNumber
        const cocktail = await Cocktail.findOne({ itemNumber });
        if (!cocktail) {
          console.log(`   ⚠️  Cocktail with itemNumber ${itemNumber} not found, skipping`);
          stats.videos.skipped++;
          continue;
        }

        // Check if already uploaded
        if (isIcon && cocktail.cloudinaryIconUrl) {
          console.log(`   ⏭️  Icon video already in Cloudinary, skipping`);
          stats.videos.skipped++;
          continue;
        }
        if (!isIcon && cocktail.cloudinaryVideoUrl) {
          console.log(`   ⏭️  Video already in Cloudinary, skipping`);
          stats.videos.skipped++;
          continue;
        }

        // Upload to Cloudinary
        console.log(`   ☁️  Uploading to Cloudinary...`);
        const folder = isIcon ? 'echo-catering/videos/icons' : 'echo-catering/videos';
        const cloudinaryResult = await uploadToCloudinary(video.path, {
          folder,
          resourceType: 'video',
        });

        console.log(`   ✅ Uploaded: ${cloudinaryResult.url}`);

        // Update database
        if (isIcon) {
          cocktail.cloudinaryIconUrl = cloudinaryResult.url;
          cocktail.cloudinaryIconPublicId = cloudinaryResult.publicId;
        } else {
          cocktail.cloudinaryVideoUrl = cloudinaryResult.url;
          cocktail.cloudinaryVideoPublicId = cloudinaryResult.publicId;
        }
        await cocktail.save();

        console.log(`   💾 Database updated`);
        stats.videos.success++;

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.error(`   ❌ Error migrating ${video.filename}:`, error.message);
        stats.videos.failed++;
      }
    }

  } catch (error) {
    console.error('❌ Video migration error:', error);
  }
};

/**
 * Migrate gallery images to Cloudinary
 */
const migrateGallery = async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🖼️  MIGRATING GALLERY IMAGES TO CLOUDINARY');
  console.log('='.repeat(60) + '\n');

  try {
    const images = await Gallery.find({
      $or: [
        { cloudinaryUrl: { $exists: false } },
        { cloudinaryUrl: null },
        { cloudinaryUrl: '' }
      ]
    });

    console.log(`📊 Found ${images.length} images to migrate\n`);

    if (images.length === 0) {
      console.log('✅ No images to migrate. All images are already in Cloudinary!');
      return;
    }

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      console.log(`\n[${i + 1}/${images.length}] Processing: ${image.filename}`);

      const localPath = path.join(__dirname, '../../server/uploads/gallery', image.filename);

      if (!fs.existsSync(localPath)) {
        console.log(`   ⚠️  Local file not found, skipping: ${image.filename}`);
        stats.gallery.skipped++;
        continue;
      }

      try {
        console.log(`   ☁️  Uploading to Cloudinary...`);
        const cloudinaryResult = await uploadToCloudinary(localPath, {
          folder: 'echo-catering/gallery',
          resourceType: 'image',
        });

        console.log(`   ✅ Uploaded: ${cloudinaryResult.url}`);

        image.cloudinaryUrl = cloudinaryResult.url;
        image.cloudinaryPublicId = cloudinaryResult.publicId;
        if (cloudinaryResult.width && cloudinaryResult.height) {
          image.dimensions = {
            width: cloudinaryResult.width,
            height: cloudinaryResult.height
          };
        }
        await image.save();

        console.log(`   💾 Database updated`);
        stats.gallery.success++;

        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`   ❌ Error migrating ${image.filename}:`, error.message);
        stats.gallery.failed++;
      }
    }

  } catch (error) {
    console.error('❌ Gallery migration error:', error);
  }
};

/**
 * Migrate about page images to Cloudinary
 */
const migrateAbout = async () => {
  console.log('\n' + '='.repeat(60));
  console.log('📄 MIGRATING ABOUT PAGE IMAGES TO CLOUDINARY');
  console.log('='.repeat(60) + '\n');

  try {
    const aboutDir = path.join(__dirname, '../../server/uploads/about');
    if (!fs.existsSync(aboutDir)) {
      console.log('⚠️  About directory not found');
      return;
    }

    const imageFiles = fs.readdirSync(aboutDir)
      .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));

    console.log(`📊 Found ${imageFiles.length} about images to migrate\n`);

    for (let i = 0; i < imageFiles.length; i++) {
      const filename = imageFiles[i];
      console.log(`\n[${i + 1}/${imageFiles.length}] Processing: ${filename}`);

      const localPath = path.join(aboutDir, filename);
      const sectionMatch = filename.match(/section(\d+)/i);
      const sectionNumber = sectionMatch ? sectionMatch[1] : null;

      try {
        // Find or create Content entry
        let content = await Content.findOne({
          page: 'about',
          section: sectionNumber ? `section${sectionNumber}` : 'main',
          type: 'image'
        });

        if (content && content.cloudinaryUrl) {
          console.log(`   ⏭️  Already in Cloudinary, skipping`);
          stats.about.skipped++;
          continue;
        }

        console.log(`   ☁️  Uploading to Cloudinary...`);
        const cloudinaryResult = await uploadToCloudinary(localPath, {
          folder: 'echo-catering/about',
          resourceType: 'image',
        });

        console.log(`   ✅ Uploaded: ${cloudinaryResult.url}`);

        if (!content) {
          content = new Content({
            page: 'about',
            section: sectionNumber ? `section${sectionNumber}` : 'main',
            type: 'image',
            value: filename,
          });
        }

        content.cloudinaryUrl = cloudinaryResult.url;
        content.cloudinaryPublicId = cloudinaryResult.publicId;
        await content.save();

        console.log(`   💾 Database updated`);
        stats.about.success++;

        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`   ❌ Error migrating ${filename}:`, error.message);
        stats.about.failed++;
      }
    }

  } catch (error) {
    console.error('❌ About migration error:', error);
  }
};

/**
 * Migrate logo images to Cloudinary
 */
const migrateLogo = async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🎨 MIGRATING LOGO IMAGES TO CLOUDINARY');
  console.log('='.repeat(60) + '\n');

  try {
    const logoDir = path.join(__dirname, '../../server/uploads/logo');
    if (!fs.existsSync(logoDir)) {
      console.log('⚠️  Logo directory not found');
      return;
    }

    const logoFiles = fs.readdirSync(logoDir)
      .filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f));

    console.log(`📊 Found ${logoFiles.length} logo files to migrate\n`);

    for (let i = 0; i < logoFiles.length; i++) {
      const filename = logoFiles[i];
      console.log(`\n[${i + 1}/${logoFiles.length}] Processing: ${filename}`);

      const localPath = path.join(logoDir, filename);

      try {
        // Find logo content
        let content = await Content.findOne({
          page: 'global',
          section: 'header',
          type: 'logo'
        });

        if (content && content.cloudinaryUrl) {
          console.log(`   ⏭️  Already in Cloudinary, skipping`);
          stats.logo.skipped++;
          continue;
        }

        console.log(`   ☁️  Uploading to Cloudinary...`);
        const cloudinaryResult = await uploadToCloudinary(localPath, {
          folder: 'echo-catering/logo',
          resourceType: 'image',
        });

        console.log(`   ✅ Uploaded: ${cloudinaryResult.url}`);

        if (!content) {
          content = new Content({
            page: 'global',
            section: 'header',
            type: 'logo',
            value: filename,
          });
        }

        content.cloudinaryUrl = cloudinaryResult.url;
        content.cloudinaryPublicId = cloudinaryResult.publicId;
        await content.save();

        console.log(`   💾 Database updated`);
        stats.logo.success++;

        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`   ❌ Error migrating ${filename}:`, error.message);
        stats.logo.failed++;
      }
    }

  } catch (error) {
    console.error('❌ Logo migration error:', error);
  }
};

/**
 * Print migration summary
 */
const printSummary = () => {
  console.log('\n' + '='.repeat(60));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(60));
  
  console.log('\n🎥 Videos:');
  console.log(`   ✅ Success: ${stats.videos.success}`);
  console.log(`   ❌ Failed: ${stats.videos.failed}`);
  console.log(`   ⏭️  Skipped: ${stats.videos.skipped}`);

  console.log('\n🖼️  Gallery Images:');
  console.log(`   ✅ Success: ${stats.gallery.success}`);
  console.log(`   ❌ Failed: ${stats.gallery.failed}`);
  console.log(`   ⏭️  Skipped: ${stats.gallery.skipped}`);

  console.log('\n📄 About Images:');
  console.log(`   ✅ Success: ${stats.about.success}`);
  console.log(`   ❌ Failed: ${stats.about.failed}`);
  console.log(`   ⏭️  Skipped: ${stats.about.skipped}`);

  console.log('\n🎨 Logo Images:');
  console.log(`   ✅ Success: ${stats.logo.success}`);
  console.log(`   ❌ Failed: ${stats.logo.failed}`);
  console.log(`   ⏭️  Skipped: ${stats.logo.skipped}`);

  const totalSuccess = stats.videos.success + stats.gallery.success + stats.about.success + stats.logo.success;
  const totalFailed = stats.videos.failed + stats.gallery.failed + stats.about.failed + stats.logo.failed;
  const totalSkipped = stats.videos.skipped + stats.gallery.skipped + stats.about.skipped + stats.logo.skipped;

  console.log('\n' + '='.repeat(60));
  console.log('📈 TOTALS:');
  console.log(`   ✅ Success: ${totalSuccess}`);
  console.log(`   ❌ Failed: ${totalFailed}`);
  console.log(`   ⏭️  Skipped: ${totalSkipped}`);
  console.log('='.repeat(60) + '\n');
};

/**
 * Main migration function
 */
const migrateAll = async () => {
  console.log('🚀 Starting complete migration to Cloudinary...\n');
  console.log('⚠️  Make sure your .env file has Cloudinary credentials configured!\n');

  // Check Cloudinary config
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error('❌ Cloudinary credentials not found in .env file!');
    console.error('   Please add:');
    console.error('   CLOUDINARY_CLOUD_NAME=your-cloud-name');
    console.error('   CLOUDINARY_API_KEY=your-api-key');
    console.error('   CLOUDINARY_API_SECRET=your-api-secret');
    process.exit(1);
  }

  try {
    // Run migrations in order
    await migrateVideos();
    await migrateGallery();
    await migrateAbout();
    await migrateLogo();

    // Print summary
    printSummary();

  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    mongoose.connection.close();
    process.exit(0);
  }
};

// Run migration
migrateAll();

