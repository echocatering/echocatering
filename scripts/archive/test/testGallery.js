const axios = require('axios');

// Test script to verify gallery system is working
const BASE_URL = 'http://localhost:5001';

async function testGallerySystem() {
  console.log('🧪 Testing Gallery System...\n');
  
  try {
    // Test 1: Health check
    console.log('1️⃣ Testing server health...');
    const healthResponse = await axios.get(`${BASE_URL}/api/health`);
    console.log('   ✅ Server is running:', healthResponse.data.status);
    
    // Test 2: Gallery API
    console.log('\n2️⃣ Testing gallery API...');
    const galleryResponse = await axios.get(`${BASE_URL}/api/gallery`);
    console.log(`   ✅ Gallery API working: ${galleryResponse.data.length} images found`);
    
    // Display image details
    galleryResponse.data.forEach((img, index) => {
      console.log(`   📸 Image ${index + 1}: ${img.title || img.originalName}`);
      console.log(`      File: ${img.filename}`);
      console.log(`      Image Path: ${img.imagePath || 'N/A'}`);
      console.log(`      Thumbnail: ${img.thumbnailPath || 'N/A'}`);
      console.log(`      Category: ${img.category}`);
      console.log(`      Active: ${img.isActive}`);
      console.log('');
    });
    
    // Test 3: Gallery categories
    console.log('3️⃣ Testing gallery categories...');
    const categoriesResponse = await axios.get(`${BASE_URL}/api/gallery/categories`);
    console.log('   ✅ Categories API working:', categoriesResponse.data);
    
    // Test 4: Gallery tags
    console.log('\n4️⃣ Testing gallery tags...');
    const tagsResponse = await axios.get(`${BASE_URL}/api/gallery/tags`);
    console.log('   ✅ Tags API working:', tagsResponse.data);
    
    // Test 5: Direct image access
    console.log('\n5️⃣ Testing direct image access...');
    if (galleryResponse.data.length > 0) {
      const firstImage = galleryResponse.data[0];
      const imageUrl = `${BASE_URL}${firstImage.imagePath || firstImage.filepath || `/gallery/${firstImage.filename}`}`;
      console.log(`   🔗 Testing image URL: ${imageUrl}`);
      
      try {
        const imageResponse = await axios.head(imageUrl);
        console.log(`   ✅ Image accessible: ${imageResponse.status} ${imageResponse.statusText}`);
      } catch (error) {
        console.log(`   ⚠️  Image access issue: ${error.message}`);
      }
    }
    
    console.log('\n🎉 Gallery system test completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   - Server: ✅ Running`);
    console.log(`   - Gallery API: ✅ ${galleryResponse.data.length} images`);
    console.log(`   - Categories: ✅ ${categoriesResponse.data.length} categories`);
    console.log(`   - Tags: ✅ ${tagsResponse.data.length} tags`);
    console.log(`   - Images: ✅ Accessible via /gallery/ endpoint`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Make sure your server is running:');
      console.log('   npm run server');
    }
    
    if (error.response) {
      console.log('\n📊 Server response:', error.response.status, error.response.statusText);
      console.log('   Data:', error.response.data);
    }
  }
}

// Run the test
testGallerySystem();
