/**
 * Backfill gallery documents with existing Cloudinary URLs (no local files).
 *
 * What it does:
 * - Reads a list of mappings (by _id or filename) to Cloudinary URLs.
 * - For each gallery document: if cloudinaryUrl is empty, set it and hasCloudinaryUrl=true.
 * - Skips documents that already have cloudinaryUrl.
 *
 * How to supply the mappings:
 * - Option A (recommended): Create a JSON file and point MAPPINGS_FILE to it.
 *   Example JSON structure (array of objects):
 *   [
 *     { "_id": "64f123abc...", "cloudinaryUrl": "https://res.cloudinary.com/your-cloud/image/upload/v123/echo-catering/gallery/img1.jpg" },
 *     { "filename": "img2.jpg", "cloudinaryUrl": "https://res.cloudinary.com/your-cloud/image/upload/v123/echo-catering/gallery/img2.jpg" }
 *   ]
 *
 * - Option B: Inline the mappings array below (const mappings = [...]).
 *
 * Environment variables required:
 *   MONGODB_URI   = your Atlas connection string (e.g. mongodb+srv://user:pass@cluster/dbname)
 *   MAPPINGS_FILE = absolute or relative path to your JSON file with mappings (optional if inlining)
 *
 * Safety:
 * - Skips entirely if NODE_ENV === 'production' (run this locally).
 * - No filesystem scanning. No process.exit() calls.
 * - Idempotent: existing cloudinaryUrl is left untouched.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Gallery = require('../../server/models/Gallery');

// -----------------------
// Config / Inputs
// -----------------------
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering';
const MAPPINGS_FILE = process.env.MAPPINGS_FILE || ''; // e.g. "./data/gallery-cloudinary-mappings.json"

// Option B: inline mappings here if you prefer not to use a file.
// const inlineMappings = [
//   { _id: '...', cloudinaryUrl: 'https://res.cloudinary.com/..../file1.jpg' },
//   { filename: 'file2.jpg', cloudinaryUrl: 'https://res.cloudinary.com/..../file2.jpg' }
// ];
const inlineMappings = [];

if (process.env.NODE_ENV === 'production') {
  console.log('🚫 Skipping backfill in production (run locally).');
  return;
}

function loadMappings() {
  if (MAPPINGS_FILE) {
    const fullPath = path.resolve(MAPPINGS_FILE);
    if (!fs.existsSync(fullPath)) {
      console.error('❌ MAPPINGS_FILE not found:', fullPath);
      return [];
    }
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        console.error('❌ MAPPINGS_FILE must contain a JSON array');
        return [];
      }
      return parsed;
    } catch (err) {
      console.error('❌ Failed to read/parse MAPPINGS_FILE:', err.message);
      return [];
    }
  }
  return inlineMappings;
}

async function run() {
  const mappings = loadMappings();
  console.log(`🔄 Starting gallery Cloudinary URL backfill`);
  console.log(`   MongoDB: ${MONGODB_URI}`);
  console.log(`   Mappings count: ${mappings.length}`);

  if (!mappings.length) {
    console.warn('⚠️  No mappings provided. Populate inlineMappings or set MAPPINGS_FILE.');
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    return;
  }

  try {
    for (const entry of mappings) {
      const { _id, filename, cloudinaryUrl } = entry || {};

      if (!cloudinaryUrl || typeof cloudinaryUrl !== 'string' || cloudinaryUrl.trim() === '') {
        console.warn('⚠️  Missing cloudinaryUrl in mapping entry, skipping:', entry);
        continue;
      }

      // Build query by _id or filename
      const query = _id ? { _id } : filename ? { filename } : null;
      if (!query) {
        console.warn('⚠️  Mapping entry missing _id and filename, skipping:', entry);
        continue;
      }

      const doc = await Gallery.findOne(query);
      if (!doc) {
        console.warn('⚠️  No gallery document found for mapping:', entry);
        continue;
      }

      if (doc.cloudinaryUrl && doc.cloudinaryUrl.trim() !== '') {
        console.log(`⏭️  Already has Cloudinary URL, skipping: id=${doc._id} filename=${doc.filename || ''}`);
        continue;
      }

      doc.cloudinaryUrl = cloudinaryUrl;
      doc.hasCloudinaryUrl = true;
      await doc.save();
      console.log(`✅ Updated gallery item _id=${doc._id} with Cloudinary URL: ${cloudinaryUrl}`);
    }
  } catch (err) {
    console.error('❌ Unexpected error during backfill:', err.message);
  } finally {
    try {
      await mongoose.connection.close();
      console.log('🔌 MongoDB connection closed');
    } catch (err) {
      console.warn('⚠️  Error closing MongoDB connection:', err.message);
    }
  }

  console.log('✅ Backfill complete (best effort)');
}

run().catch(err => {
  console.error('❌ Fatal error:', err);
});

