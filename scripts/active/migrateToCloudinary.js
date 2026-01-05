const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import models
const Gallery = require('../server/models/Gallery');
const { uploadToCloudinary } = require('../server/utils/cloudinary');

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

// Migration function
const migrateGalleryToCloudinary = async () => {
  try {
    console.log('🚀 Starting gallery migration to Cloudinary...\n');
    
    // Get all gallery images that don't have Cloudinary URLs
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
      process.exit(0);
    }
    
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      console.log(`\n[${i + 1}/${images.length}] Processing: ${image.filename}`);
      
      // Check if local file exists
      const localPath = path.join(__dirname, '../server/uploads/gallery', image.filename);
      
      if (!fs.existsSync(localPath)) {
        console.log(`   ⚠️  Local file not found, skipping: ${image.filename}`);
        skipCount++;
        continue;
      }
      
      try {
        // Upload to Cloudinary
        console.log(`   ☁️  Uploading to Cloudinary...`);
        const cloudinaryResult = await uploadToCloudinary(localPath, {
          folder: 'echo-catering/gallery',
          resourceType: 'image',
        });
        
        console.log(`   ✅ Uploaded: ${cloudinaryResult.url}`);
        
        // Update database entry
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
        successCount++;
        
        // Optional: Delete local file after successful migration
        // Uncomment the lines below if you want to delete local files after migration
        /*
        try {
          fs.unlinkSync(localPath);
          console.log(`   🗑️  Deleted local file`);
        } catch (deleteError) {
          console.warn(`   ⚠️  Could not delete local file:`, deleteError.message);
        }
        */
        
      } catch (error) {
        console.error(`   ❌ Error migrating ${image.filename}:`, error.message);
        failCount++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Successfully migrated: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    mongoose.connection.close();
    process.exit(0);
  }
};

// Run migration
migrateGalleryToCloudinary();

