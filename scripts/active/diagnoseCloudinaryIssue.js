const mongoose = require('mongoose');
require('dotenv').config();
const Cocktail = require('../../server/models/Cocktail');
const Gallery = require('../../server/models/Gallery');
const Content = require('../../server/models/Content');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log('✅ Connected to MongoDB\n');
  console.log('='.repeat(80));
  console.log('🔍 CLOUDINARY DIAGNOSTIC REPORT');
  console.log('='.repeat(80) + '\n');
  
  // Check Cocktails
  console.log('📊 COCKTAILS (Videos):');
  console.log('-'.repeat(80));
  const cocktails = await Cocktail.find({ itemNumber: { $exists: true } })
    .sort({ itemNumber: 1 })
    .limit(10);
  
  if (cocktails.length === 0) {
    console.log('⚠️  No cocktails found with itemNumbers');
  } else {
    let withCloudinary = 0;
    let withEmptyString = 0;
    let withNull = 0;
    let withValidUrl = 0;
    
    cocktails.forEach(c => {
      const json = c.toJSON({ virtuals: true });
      const hasCloudinary = !!c.cloudinaryVideoUrl;
      const isEmpty = c.cloudinaryVideoUrl === '';
      const isNull = c.cloudinaryVideoUrl === null || c.cloudinaryVideoUrl === undefined;
      const isValidUrl = c.cloudinaryVideoUrl && 
                        c.cloudinaryVideoUrl.trim() !== '' && 
                        (c.cloudinaryVideoUrl.startsWith('http://') || c.cloudinaryVideoUrl.startsWith('https://'));
      
      if (hasCloudinary) withCloudinary++;
      if (isEmpty) withEmptyString++;
      if (isNull) withNull++;
      if (isValidUrl) withValidUrl++;
      
      console.log(`\nItem ${c.itemNumber} (${c.name || 'unnamed'}):`);
      console.log(`  cloudinaryVideoUrl: ${c.cloudinaryVideoUrl ? `"${c.cloudinaryVideoUrl.substring(0, 60)}..."` : 'NOT SET'}`);
      console.log(`  Type: ${typeof c.cloudinaryVideoUrl}, Value: ${JSON.stringify(c.cloudinaryVideoUrl)}`);
      console.log(`  Is Empty String: ${isEmpty}`);
      console.log(`  Is Null/Undefined: ${isNull}`);
      console.log(`  Is Valid URL: ${isValidUrl}`);
      console.log(`  videoUrl (virtual): ${json.videoUrl ? `"${json.videoUrl.substring(0, 60)}..."` : 'EMPTY'}`);
      console.log(`  videoFile: ${c.videoFile || 'none'}`);
    });
    
    console.log('\n' + '-'.repeat(80));
    console.log(`Summary: ${cocktails.length} cocktails checked`);
    console.log(`  With cloudinaryVideoUrl field: ${withCloudinary}`);
    console.log(`  With empty string '': ${withEmptyString}`);
    console.log(`  With null/undefined: ${withNull}`);
    console.log(`  With valid URL: ${withValidUrl}`);
  }
  
  // Check Gallery
  console.log('\n\n📊 GALLERY IMAGES:');
  console.log('-'.repeat(80));
  const galleryImages = await Gallery.find().limit(5);
  
  if (galleryImages.length === 0) {
    console.log('⚠️  No gallery images found');
  } else {
    let withValidUrl = 0;
    galleryImages.forEach(img => {
      const json = img.toJSON({ virtuals: true });
      const isValidUrl = img.cloudinaryUrl && 
                        img.cloudinaryUrl.trim() !== '' && 
                        (img.cloudinaryUrl.startsWith('http://') || img.cloudinaryUrl.startsWith('https://'));
      if (isValidUrl) withValidUrl++;
      
      console.log(`\n${img.filename}:`);
      console.log(`  cloudinaryUrl: ${img.cloudinaryUrl ? `"${img.cloudinaryUrl.substring(0, 60)}..."` : 'NOT SET'}`);
      console.log(`  Is Valid URL: ${isValidUrl}`);
      console.log(`  imagePath (virtual): ${json.imagePath ? `"${json.imagePath.substring(0, 60)}..."` : 'EMPTY'}`);
    });
    console.log(`\nSummary: ${galleryImages.length} images checked, ${withValidUrl} with valid URLs`);
  }
  
  // Check Content (Logo, About)
  console.log('\n\n📊 CONTENT (Logo, About Images):');
  console.log('-'.repeat(80));
  const logoContent = await Content.findOne({ page: 'global', section: 'header', type: 'logo' });
  const aboutImages = await Content.find({ page: 'about', type: 'image' }).limit(3);
  
  if (logoContent) {
    const isValidUrl = logoContent.cloudinaryUrl && 
                      logoContent.cloudinaryUrl.trim() !== '' && 
                      (logoContent.cloudinaryUrl.startsWith('http://') || logoContent.cloudinaryUrl.startsWith('https://'));
    console.log(`\nLogo:`);
    console.log(`  cloudinaryUrl: ${logoContent.cloudinaryUrl ? `"${logoContent.cloudinaryUrl.substring(0, 60)}..."` : 'NOT SET'}`);
    console.log(`  Is Valid URL: ${isValidUrl}`);
  } else {
    console.log('\n⚠️  No logo content found');
  }
  
  if (aboutImages.length > 0) {
    console.log(`\nAbout Images (${aboutImages.length}):`);
    aboutImages.forEach(img => {
      const isValidUrl = img.cloudinaryUrl && 
                        img.cloudinaryUrl.trim() !== '' && 
                        (img.cloudinaryUrl.startsWith('http://') || img.cloudinaryUrl.startsWith('https://'));
      console.log(`  ${img.section}: ${img.cloudinaryUrl ? `"${img.cloudinaryUrl.substring(0, 40)}..."` : 'NOT SET'} (Valid: ${isValidUrl})`);
    });
  } else {
    console.log('\n⚠️  No about images found');
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Diagnostic complete');
  console.log('='.repeat(80));
  console.log('\n💡 If cloudinaryVideoUrl shows "NOT SET" or empty strings,');
  console.log('   you need to run: node scripts/active/migrateAllToCloudinary.js');
  console.log('\n💡 If URLs exist but start with wrong protocol or are invalid,');
  console.log('   check your Cloudinary configuration.\n');
  
  mongoose.connection.close();
  process.exit(0);
})
.catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

