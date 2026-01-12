const mongoose = require('mongoose');
require('dotenv').config();
const Cocktail = require('../../server/models/Cocktail');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    // Check cocktails with itemNumber 1-10
    const cocktails = await Cocktail.find({ itemNumber: { $in: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] } })
      .sort({ itemNumber: 1 });
    
    console.log(`📊 Found ${cocktails.length} cocktails with itemNumbers 1-10\n`);
    console.log('='.repeat(60));
    
    if (cocktails.length === 0) {
      console.log('⚠️  No cocktails found! Check if itemNumbers are set correctly.');
    } else {
      cocktails.forEach(c => {
        const json = c.toJSON();
        console.log(`\nItem ${c.itemNumber} (${c.name || 'unnamed'}):`);
        console.log(`  cloudinaryVideoUrl: ${c.cloudinaryVideoUrl ? '✅ ' + c.cloudinaryVideoUrl.substring(0, 50) + '...' : '❌ NOT SET'}`);
        console.log(`  videoUrl (virtual): ${json.videoUrl ? '✅ ' + json.videoUrl.substring(0, 50) + '...' : '❌ EMPTY'}`);
        console.log(`  videoFile: ${c.videoFile || 'none'}`);
        console.log(`  Has Cloudinary: ${!!c.cloudinaryVideoUrl}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`\n📈 Summary:`);
    const withCloudinary = cocktails.filter(c => c.cloudinaryVideoUrl).length;
    console.log(`   Total checked: ${cocktails.length}`);
    console.log(`   With Cloudinary URLs: ${withCloudinary}`);
    console.log(`   Without Cloudinary URLs: ${cocktails.length - withCloudinary}`);
    
    mongoose.connection.close();
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });


