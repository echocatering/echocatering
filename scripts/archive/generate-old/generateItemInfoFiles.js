/**
 * Generate .json info files for all existing cocktails
 * This script creates item#.json files in server/uploads/items/
 * for all existing items that don't have info files yet
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const Cocktail = require('../server/models/Cocktail');

const videoDir = path.join(__dirname, '..', 'server', 'uploads', 'cocktails');

async function generateInfoFiles() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Ensure directory exists
    if (!fs.existsSync(videoDir)) {
      fs.mkdirSync(videoDir, { recursive: true });
      console.log(`✅ Created directory: ${videoDir}`);
    }

    // Find all cocktails
    const cocktails = await Cocktail.find({}).lean();
    console.log(`📋 Found ${cocktails.length} cocktails`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const cocktail of cocktails) {
      const itemId = cocktail.itemId;
      
      if (!itemId) {
        console.log(`⚠️  Skipping cocktail "${cocktail.name}" - no itemId`);
        skipped++;
        continue;
      }

      const infoFilePath = path.join(videoDir, `${itemId}.json`);
      const exists = fs.existsSync(infoFilePath);

      // Prepare data for frontend
      const infoData = {
        itemId: itemId,
        name: cocktail.name || '',
        concept: cocktail.concept || '',
        ingredients: cocktail.ingredients || '',
        globalIngredients: cocktail.globalIngredients || '',
        regions: Array.isArray(cocktail.regions) ? cocktail.regions : [],
        category: cocktail.category || '',
        order: cocktail.order || 0,
        featured: cocktail.featured || false,
        videoFile: cocktail.videoFile || '',
        mapSnapshotFile: cocktail.mapSnapshotFile || '',
        videoUrl: cocktail.videoFile ? `/cocktails/${cocktail.videoFile}` : '',
        mapSnapshotUrl: cocktail.mapSnapshotFile ? `/cocktails/${cocktail.mapSnapshotFile}` : '',
        createdAt: cocktail.createdAt ? new Date(cocktail.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Write JSON file
      fs.writeFileSync(infoFilePath, JSON.stringify(infoData, null, 2), 'utf8');
      
      if (exists) {
        updated++;
        console.log(`🔄 Updated: ${itemId}.json`);
      } else {
        created++;
        console.log(`✅ Created: ${itemId}.json`);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${cocktails.length}`);

    await mongoose.connection.close();
    console.log('✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

generateInfoFiles();

