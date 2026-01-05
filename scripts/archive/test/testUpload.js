const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Test script to simulate image upload
const BASE_URL = 'http://localhost:5001';

async function testUpload() {
  console.log('📤 Testing Image Upload...\n');
  
  try {
    // Test 1: Check if we can access the upload endpoint
    console.log('1️⃣ Testing upload endpoint access...');
    
    // Create a dummy FormData
    const formData = new FormData();
    
    // Create a dummy text file since we can't easily create an image file
    const dummyContent = 'This is a dummy image file for testing';
    formData.append('gallery', Buffer.from(dummyContent), 'test-image.txt');
    
    console.log('   📁 Created test FormData with dummy file');
    
    // Test 2: Try upload without authentication
    console.log('\n2️⃣ Testing upload without authentication...');
    try {
      const response = await axios.post(`${BASE_URL}/api/upload/gallery`, formData, {
        headers: {
          ...formData.getHeaders()
        }
      });
      console.log('   ⚠️  Upload succeeded without auth (unexpected):', response.status);
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('   ✅ Upload properly requires authentication (401 Unauthorized)');
        console.log('   📄 Error details:', error.response.data);
      } else {
        console.log('   ❌ Unexpected upload error:', error.message);
        if (error.response) {
          console.log('   📄 Response status:', error.response.status);
          console.log('   📄 Response data:', error.response.data);
        }
      }
    }
    
    // Test 3: Check what the error response looks like
    console.log('\n3️⃣ Analyzing error response...');
    try {
      await axios.post(`${BASE_URL}/api/upload/gallery`, formData, {
        headers: {
          ...formData.getHeaders()
        }
      });
    } catch (error) {
      if (error.response) {
        console.log('   📊 Error Response Analysis:');
        console.log('      Status:', error.response.status);
        console.log('      Status Text:', error.response.statusText);
        console.log('      Headers:', JSON.stringify(error.response.headers, null, 2));
        console.log('      Data:', JSON.stringify(error.response.data, null, 2));
      }
    }
    
    console.log('\n🎉 Upload test completed!');
    console.log('\n💡 Next steps:');
    console.log('   1. Make sure you are logged into the admin panel');
    console.log('   2. Check that admin_token exists in localStorage');
    console.log('   3. Try uploading again and check browser console');
    console.log('   4. Look for authentication errors in the console');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Make sure your server is running:');
      console.log('   npm run server');
    }
  }
}

// Run the test
testUpload();
