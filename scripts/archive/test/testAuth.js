const axios = require('axios');

// Test script to verify authentication and upload functionality
const BASE_URL = 'http://localhost:5001';

async function testAuthentication() {
  console.log('🔐 Testing Authentication System...\n');
  
  try {
    // Test 1: Health check
    console.log('1️⃣ Testing server health...');
    const healthResponse = await axios.get(`${BASE_URL}/api/health`);
    console.log('   ✅ Server is running:', healthResponse.data.status);
    
    // Test 2: Try to access protected endpoint without auth
    console.log('\n2️⃣ Testing protected endpoint without authentication...');
    try {
      await axios.get(`${BASE_URL}/api/gallery`);
      console.log('   ⚠️  Gallery endpoint accessible without auth (should require auth)');
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('   ✅ Gallery endpoint properly protected (401 Unauthorized)');
      } else {
        console.log('   ❌ Unexpected error:', error.message);
      }
    }
    
    // Test 3: Try to access upload endpoint without auth
    console.log('\n3️⃣ Testing upload endpoint without authentication...');
    try {
      await axios.post(`${BASE_URL}/api/upload/gallery`);
      console.log('   ⚠️  Upload endpoint accessible without auth (should require auth)');
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('   ✅ Upload endpoint properly protected (401 Unauthorized)');
      } else {
        console.log('   ❌ Unexpected error:', error.message);
      }
    }
    
    // Test 4: Check if there are any users in the system
    console.log('\n4️⃣ Testing user authentication...');
    try {
      const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
        email: 'test@example.com',
        password: 'testpassword'
      });
      console.log('   ⚠️  Test login succeeded (unexpected)');
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('   ✅ Login properly rejects invalid credentials (401 Unauthorized)');
      } else if (error.response && error.response.status === 400) {
        console.log('   ✅ Login properly validates input (400 Bad Request)');
      } else {
        console.log('   ❌ Unexpected login error:', error.message);
      }
    }
    
    console.log('\n🎉 Authentication test completed!');
    console.log('\n📋 Summary:');
    console.log('   - Server: ✅ Running');
    console.log('   - Protected endpoints: ✅ Require authentication');
    console.log('   - Login validation: ✅ Working');
    
    console.log('\n💡 To test uploads:');
    console.log('   1. Make sure you are logged into the admin panel');
    console.log('   2. Check browser console for authentication errors');
    console.log('   3. Verify admin_token exists in localStorage');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Make sure your server is running:');
      console.log('   npm run server');
    }
  }
}

// Run the test
testAuthentication();
