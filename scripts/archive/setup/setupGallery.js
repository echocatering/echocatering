const fs = require('fs');
const path = require('path');

// Setup script to sync existing public gallery images to server uploads
console.log('🔄 Setting up gallery system...\n');

// Function to sync existing public gallery images to server uploads
function syncExistingGalleryImages() {
  const publicGalleryPath = path.join(__dirname, '../public/gallery');
  const serverGalleryPath = path.join(__dirname, '../server/uploads/gallery');
  
  console.log(`📁 Public gallery path: ${publicGalleryPath}`);
  console.log(`📁 Server gallery path: ${serverGalleryPath}`);
  
  if (!fs.existsSync(publicGalleryPath)) {
    console.log('⚠️  Public gallery directory not found, skipping sync');
    return;
  }
  
  // Create server uploads directory if it doesn't exist
  if (!fs.existsSync(serverGalleryPath)) {
    fs.mkdirSync(serverGalleryPath, { recursive: true });
    console.log('✅ Created server uploads directory');
  }
  
  try {
    const files = fs.readdirSync(publicGalleryPath);
    const imageExtensions = /\.(jpeg|jpg|png|gif|webp)$/i;
    
    console.log(`\n📋 Found ${files.length} files in public gallery:`);
    files.forEach(file => console.log(`   - ${file}`));
    
    const imageFiles = files.filter(file => imageExtensions.test(file));
    console.log(`\n🖼️  Found ${imageFiles.length} image files to sync:`);
    
    let syncedCount = 0;
    imageFiles.forEach(file => {
      const sourcePath = path.join(publicGalleryPath, file);
      const destPath = path.join(serverGalleryPath, file);
      
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`   ✅ Synced: ${file}`);
        syncedCount++;
      } else {
        console.log(`   ⏭️  Already exists: ${file}`);
      }
    });
    
    console.log(`\n✅ Gallery sync completed! Synced ${syncedCount} new images.`);
    console.log(`\n🔄 Next steps:`);
    console.log(`   1. Start your server: npm run server`);
    console.log(`   2. Start your frontend: npm start`);
    console.log(`   3. Check the admin panel gallery manager`);
    console.log(`   4. Verify images appear on frontend pages`);
    
  } catch (error) {
    console.error('❌ Error syncing gallery images:', error);
  }
}

// Run the sync
syncExistingGalleryImages();
