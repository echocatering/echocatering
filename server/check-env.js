#!/usr/bin/env node
/**
 * Diagnostic script to check environment variables
 * Run this on Render or locally to verify env vars are set correctly
 */

const requiredEnv = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'MONGODB_URI'
];

console.log('🔍 Environment Variable Check\n');
console.log('Environment:', process.env.NODE_ENV || 'not set');
console.log('Running on Render:', !!process.env.RENDER ? 'YES' : 'NO');
console.log('\n--- Required Variables ---\n');

let allPresent = true;
requiredEnv.forEach(key => {
  const value = process.env[key];
  const present = !!value;
  const preview = present 
    ? (key.includes('SECRET') || key.includes('KEY') || key.includes('URI')
        ? `${value.substring(0, 8)}...${value.substring(value.length - 4)}` 
        : value)
    : '❌ MISSING';
  
  console.log(`${present ? '✅' : '❌'} ${key}: ${preview}`);
  if (!present) allPresent = false;
});

console.log('\n--- Optional Variables ---\n');
const optionalVars = ['PORT', 'NODE_ENV', 'ALLOWED_ORIGINS', 'RENDER_EXTERNAL_URL'];
optionalVars.forEach(key => {
  const value = process.env[key];
  console.log(`${value ? '✅' : '⚪'} ${key}: ${value || 'not set'}`);
});

if (allPresent) {
  console.log('\n✅ All required environment variables are present!');
  process.exit(0);
} else {
  console.log('\n❌ Some required environment variables are missing!');
  console.log('\n💡 Troubleshooting:');
  console.log('  - If on Render: Check Environment tab in your BACKEND service');
  console.log('  - If locally: Check .env file in project root');
  console.log('  - Variable names are case-sensitive');
  console.log('  - Redeploy after adding env vars');
  process.exit(1);
}

