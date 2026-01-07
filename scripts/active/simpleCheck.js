/**
 * Simple script to check if database has Cloudinary URLs
 * Run: node scripts/active/simpleCheck.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Gallery = require('../../server/models/Gallery');
const Cocktail = require('../../server/models/Cocktail');

async function simpleCheck() {
  try {
    console.log('🔌 Connecting to database...');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected!\n');

    // Check Gallery
    console.log('📸 Checking Gallery Images:');
    const galleryCount = await Gallery.countDocuments({});
    const galleryWithCloudinary = await Gallery.countDocuments({
      cloudinaryUrl: { $exists: true, $ne: '', $regex: /^https?:\/\// }
    });
    
    console.log(`   Total images: ${galleryCount}`);
    console.log(`   With Cloudinary URLs: ${galleryWithCloudinary}`);
    console.log(`   Without Cloudinary URLs: ${galleryCount - galleryWithCloudinary}\n`);

    // Check one example
    if (galleryCount > 0) {
      const example = await Gallery.findOne({});
      console.log('📋 Example image:');
      console.log(`   Filename: ${example.filename}`);
      console.log(`   Cloudinary URL: ${example.cloudinaryUrl || '(empty or missing)'}`);
      console.log(`   Has valid URL: ${example.cloudinaryUrl?.startsWith('http') || false}\n`);
    }

    // Check Cocktails
    console.log('🎥 Checking Cocktail Videos:');
    const cocktailCount = await Cocktail.countDocuments({});
    const cocktailWithCloudinary = await Cocktail.countDocuments({
      cloudinaryVideoUrl: { $exists: true, $ne: '', $regex: /^https?:\/\// }
    });
    
    console.log(`   Total cocktails: ${cocktailCount}`);
    console.log(`   With Cloudinary URLs: ${cocktailWithCloudinary}`);
    console.log(`   Without Cloudinary URLs: ${cocktailCount - cocktailWithCloudinary}\n`);

    // Check one example
    if (cocktailCount > 0) {
      const example = await Cocktail.findOne({});
      console.log('📋 Example cocktail:');
      console.log(`   Name: ${example.name}`);
      console.log(`   Item Number: ${example.itemNumber}`);
      console.log(`   Cloudinary Video URL: ${example.cloudinaryVideoUrl || '(empty or missing)'}`);
      console.log(`   Has valid URL: ${example.cloudinaryVideoUrl?.startsWith('http') || false}\n`);
    }

    // Summary
    console.log('💡 Summary:');
    if (galleryWithCloudinary === 0 && galleryCount > 0) {
      console.log('❌ Gallery images need Cloudinary URLs!');
    } else if (galleryWithCloudinary > 0) {
      console.log(`✅ ${galleryWithCloudinary} gallery images have Cloudinary URLs`);
    }
    
    if (cocktailWithCloudinary === 0 && cocktailCount > 0) {
      console.log('❌ Cocktails need Cloudinary video URLs!');
    } else if (cocktailWithCloudinary > 0) {
      console.log(`✅ ${cocktailWithCloudinary} cocktails have Cloudinary video URLs`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('connect')) {
      console.log('\n💡 Make sure:');
      console.log('   1. MongoDB is running');
      console.log('   2. MONGODB_URI in .env is correct');
    }
  }
}

simpleCheck();

