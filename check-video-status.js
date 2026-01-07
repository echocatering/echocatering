#!/usr/bin/env node

/**
 * Quick script to check video processing status
 * Usage: node check-video-status.js [itemNumber]
 */

const http = require('http');

const itemNumber = process.argv[2] || 1;
const port = process.env.PORT || 5002;

const options = {
  hostname: 'localhost',
  port: port,
  path: `/api/video-processing/status/${itemNumber}`,
  method: 'GET',
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const status = JSON.parse(data);
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log(`Video Processing Status for Item ${itemNumber}`);
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`Active: ${status.active ? '✅ YES' : '❌ NO'}`);
      console.log(`Stage: ${status.stage || 'N/A'}`);
      console.log(`Progress: ${status.progress || 0}%`);
      console.log(`Message: ${status.message || 'N/A'}`);
      if (status.error) {
        console.log(`❌ Error: ${status.error}`);
      }
      if (status.startTime) {
        const elapsed = Math.floor((Date.now() - status.startTime) / 1000);
        console.log(`Elapsed time: ${elapsed} seconds`);
      }
      console.log('═══════════════════════════════════════════════════════════\n');
    } catch (err) {
      console.error('Failed to parse response:', err);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (err) => {
  console.error('Request error:', err.message);
  console.log('\n⚠️  Could not connect to server. Make sure it\'s running on port', port);
});

req.end();

