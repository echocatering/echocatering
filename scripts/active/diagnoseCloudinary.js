const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const Cocktail = require('../../server/models/Cocktail');

async function diagnose() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering');
    console.log('✅ Connected to MongoDB\n');

    // Get item 1 directly
    const item1 = await Cocktail.findOne({ itemNumber: 1 });
    
    if (!item1) {
      console.log('❌ Item 1 not found in database');
      return;
    }

    console.log('=== RAW DATABASE DOCUMENT ===');
    console.log('Item Number:', item1.itemNumber);
    console.log('Name:', item1.name);
    console.log('cloudinaryVideoUrl (direct):', item1.cloudinaryVideoUrl);
    console.log('cloudinaryVideoUrl type:', typeof item1.cloudinaryVideoUrl);
    console.log('cloudinaryVideoUrl length:', item1.cloudinaryVideoUrl?.length || 0);
    console.log('cloudinaryVideoUrl via .get():', item1.get('cloudinaryVideoUrl'));
    console.log('videoFile:', item1.videoFile);
    console.log('\n=== AFTER toObject() ===');
    const asObject = item1.toObject();
    console.log('cloudinaryVideoUrl in object:', asObject.cloudinaryVideoUrl);
    console.log('cloudinaryVideoUrl type:', typeof asObject.cloudinaryVideoUrl);
    console.log('Has cloudinaryVideoUrl key:', 'cloudinaryVideoUrl' in asObject);
    console.log('All keys:', Object.keys(asObject).filter(k => k.includes('cloudinary') || k.includes('video')));
    console.log('\n=== AFTER toJSON({ virtuals: true }) ===');
    const asJson = item1.toJSON({ virtuals: true });
    console.log('cloudinaryVideoUrl in JSON:', asJson.cloudinaryVideoUrl);
    console.log('videoUrl virtual:', asJson.videoUrl);
    console.log('Has cloudinaryVideoUrl key:', 'cloudinaryVideoUrl' in asJson);
    
    // Test the actual API endpoint
    console.log('\n=== TESTING API ENDPOINT ===');
    const http = require('http');
    const url = 'http://localhost:5002/api/menu-items/menu-gallery';
    
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const cocktails = json.cocktails?.cocktailInfo || {};
          const item1Key = Object.keys(cocktails).find(k => {
            const info = cocktails[k];
            return info.itemNumber === 1;
          });
          
          if (item1Key) {
            const item1Info = cocktails[item1Key];
            console.log('Item 1 from API:');
            console.log('  cloudinaryVideoUrl:', item1Info.cloudinaryVideoUrl);
            console.log('  cloudinaryVideoUrl type:', typeof item1Info.cloudinaryVideoUrl);
            console.log('  videoUrl:', item1Info.videoUrl);
            console.log('  All keys:', Object.keys(item1Info));
          } else {
            console.log('❌ Item 1 not found in API response');
          }
        } catch (e) {
          console.error('Error parsing API response:', e.message);
        }
        mongoose.connection.close();
      });
    }).on('error', (err) => {
      console.error('API request error:', err.message);
      mongoose.connection.close();
    });
    
  } catch (error) {
    console.error('Error:', error);
    mongoose.connection.close();
  }
}

diagnose();

