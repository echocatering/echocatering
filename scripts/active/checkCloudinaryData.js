/**
 * Diagnostic script to check if Cloudinary URLs are stored in the database
 * Run with: node scripts/active/checkCloudinaryData.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Gallery = require('../../server/models/Gallery');
const Cocktail = require('../../server/models/Cocktail');

async function checkCloudinaryData() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering';
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Check Gallery images
    console.log('📸 Checking Gallery Images:');
    console.log('='.repeat(60));
    const galleryImages = await Gallery.find({}).limit(10);
    console.log(`Found ${galleryImages.length} gallery images (showing first 10)\n`);
    
    let galleryWithCloudinary = 0;
    let galleryWithoutCloudinary = 0;
    
    galleryImages.forEach((img, index) => {
      const hasCloudinary = img.cloudinaryUrl && 
                           img.cloudinaryUrl.trim() !== '' && 
                           img.cloudinaryUrl.startsWith('http');
      if (hasCloudinary) galleryWithCloudinary++;
      else galleryWithoutCloudinary++;
      
      console.log(`Image ${index + 1}:`);
      console.log(`  Filename: ${img.filename}`);
      console.log(`  Cloudinary URL: ${img.cloudinaryUrl || '(empty or missing)'}`);
      console.log(`  Cloudinary URL Type: ${typeof img.cloudinaryUrl}`);
      console.log(`  Cloudinary URL Length: ${img.cloudinaryUrl?.length || 0}`);
      console.log(`  Has Valid Cloudinary URL: ${hasCloudinary}`);
      
      // Check virtual
      const imgJson = img.toJSON({ virtuals: true });
      console.log(`  imagePath (virtual): ${imgJson.imagePath}`);
      console.log(`  imagePath is Cloudinary: ${imgJson.imagePath?.startsWith('http') || false}`);
      console.log('');
    });
    
    const totalGallery = await Gallery.countDocuments({});
    const totalWithCloudinary = await Gallery.countDocuments({
      cloudinaryUrl: { $exists: true, $ne: '', $regex: /^https?:\/\// }
    });
    
    console.log(`\n📊 Gallery Summary:`);
    console.log(`  Total images: ${totalGallery}`);
    console.log(`  With Cloudinary URLs: ${totalWithCloudinary}`);
    console.log(`  Without Cloudinary URLs: ${totalGallery - totalWithCloudinary}`);
    console.log('');

    // Check Cocktails/Videos
    console.log('🎥 Checking Cocktail Videos:');
    console.log('='.repeat(60));
    const cocktails = await Cocktail.find({}).limit(10);
    console.log(`Found ${cocktails.length} cocktails (showing first 10)\n`);
    
    let cocktailsWithCloudinary = 0;
    let cocktailsWithoutCloudinary = 0;
    
    cocktails.forEach((cocktail, index) => {
      const hasCloudinary = cocktail.cloudinaryVideoUrl && 
                           cocktail.cloudinaryVideoUrl.trim() !== '' && 
                           cocktail.cloudinaryVideoUrl.startsWith('http');
      if (hasCloudinary) cocktailsWithCloudinary++;
      else cocktailsWithoutCloudinary++;
      
      console.log(`Cocktail ${index + 1}:`);
      console.log(`  Name: ${cocktail.name}`);
      console.log(`  Item Number: ${cocktail.itemNumber}`);
      console.log(`  Video File: ${cocktail.videoFile || '(none)'}`);
      console.log(`  Cloudinary Video URL: ${cocktail.cloudinaryVideoUrl || '(empty or missing)'}`);
      console.log(`  Cloudinary URL Type: ${typeof cocktail.cloudinaryVideoUrl}`);
      console.log(`  Cloudinary URL Length: ${cocktail.cloudinaryVideoUrl?.length || 0}`);
      console.log(`  Has Valid Cloudinary URL: ${hasCloudinary}`);
      
      // Check virtual
      const cocktailJson = cocktail.toJSON({ virtuals: true });
      console.log(`  videoUrl (virtual): ${cocktailJson.videoUrl}`);
      console.log(`  videoUrl is Cloudinary: ${cocktailJson.videoUrl?.startsWith('http') || false}`);
      console.log('');
    });
    
    const totalCocktails = await Cocktail.countDocuments({});
    const totalCocktailsWithCloudinary = await Cocktail.countDocuments({
      cloudinaryVideoUrl: { $exists: true, $ne: '', $regex: /^https?:\/\// }
    });
    
    console.log(`\n📊 Cocktails Summary:`);
    console.log(`  Total cocktails: ${totalCocktails}`);
    console.log(`  With Cloudinary URLs: ${totalCocktailsWithCloudinary}`);
    console.log(`  Without Cloudinary URLs: ${totalCocktails - totalCocktailsWithCloudinary}`);
    console.log('');

    // Recommendations
    console.log('💡 Recommendations:');
    console.log('='.repeat(60));
    if (totalWithCloudinary === 0 && totalGallery > 0) {
      console.log('❌ No gallery images have Cloudinary URLs!');
      console.log('   → Run migration script: node scripts/active/migrateAllToCloudinary.js');
    } else if (totalWithCloudinary < totalGallery) {
      console.log(`⚠️  Only ${totalWithCloudinary} of ${totalGallery} gallery images have Cloudinary URLs`);
      console.log('   → Run migration script to upload remaining images');
    } else {
      console.log('✅ All gallery images have Cloudinary URLs');
    }
    
    if (totalCocktailsWithCloudinary === 0 && totalCocktails > 0) {
      console.log('❌ No cocktails have Cloudinary video URLs!');
      console.log('   → Run migration script: node scripts/active/migrateAllToCloudinary.js');
    } else if (totalCocktailsWithCloudinary < totalCocktails) {
      console.log(`⚠️  Only ${totalCocktailsWithCloudinary} of ${totalCocktails} cocktails have Cloudinary URLs`);
      console.log('   → Run migration script to upload remaining videos');
    } else {
      console.log('✅ All cocktails have Cloudinary video URLs');
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkCloudinaryData();


