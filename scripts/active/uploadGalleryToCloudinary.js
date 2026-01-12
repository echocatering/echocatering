/**
 * Upload missing gallery assets to Cloudinary and backfill MongoDB.
 *
 * Usage (local only; not for Render):
 *   NODE_ENV=development \
 *   MONGODB_URI="mongodb+srv://user:pass@cluster/dbname" \
 *   CLOUDINARY_CLOUD_NAME=... \
 *   CLOUDINARY_API_KEY=... \
 *   CLOUDINARY_API_SECRET=... \
 *   LOCAL_GALLERY_DIR="/absolute/path/to/local/gallery" \
 *   node scripts/active/uploadGalleryToCloudinary.js
 *
 * Notes:
 * - Skips entirely when NODE_ENV === 'production' (safety).
 * - Idempotent: skips documents that already have cloudinaryUrl.
 * - Does NOT call process.exit(); logs errors and finishes best‑effort.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { uploadToCloudinary } = require('../../server/utils/cloudinary');
const Gallery = require('../../server/models/Gallery');

const LOCAL_GALLERY_DIR = process.env.LOCAL_GALLERY_DIR || path.join(__dirname, '../../server/uploads/gallery');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering';

if (process.env.NODE_ENV === 'production') {
  console.log('🚫 Skipping gallery upload script in production.');
  return;
}

async function uploadFileToCloudinary(filePath, publicId) {
  const result = await uploadToCloudinary(filePath, {
    folder: 'echo-catering/gallery',
    resourceType: 'image',
    publicId,
    overwrite: false
  });
  return result.url || result.secure_url || result;
}

async function updateMongoDocument(docId, cloudinaryUrl, cloudinaryPublicId) {
  await Gallery.updateOne(
    { _id: docId },
    {
      $set: {
        cloudinaryUrl,
        cloudinaryPublicId,
        hasCloudinaryUrl: true
      }
    }
  );
}

async function run() {
  console.log('🔄 Starting gallery backfill to Cloudinary');
  console.log(`   MongoDB: ${MONGODB_URI}`);
  console.log(`   Local gallery dir: ${LOCAL_GALLERY_DIR}`);

  // Validate local folder
  if (!fs.existsSync(LOCAL_GALLERY_DIR)) {
    console.error('❌ LOCAL_GALLERY_DIR does not exist:', LOCAL_GALLERY_DIR);
    console.error('   Provide a valid folder containing the gallery images.');
    return;
  }

  // Connect to Mongo
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    return;
  }

  try {
    const docs = await Gallery.find({});
    console.log(`📊 Found ${docs.length} gallery documents`);

    for (const doc of docs) {
      if (doc.cloudinaryUrl && doc.cloudinaryUrl.trim() !== '') {
        console.log(`⏭️  Skipping (already has Cloudinary URL): ${doc.filename || doc.originalName || doc._id}`);
        continue;
      }

      const filename = doc.filename || doc.originalName;
      if (!filename) {
        console.warn(`⚠️  Missing filename for document ${doc._id}, skipping`);
        continue;
      }

      const localPath = path.join(LOCAL_GALLERY_DIR, filename);
      if (!fs.existsSync(localPath)) {
        console.warn(`⚠️  File not found locally, skipping: ${localPath}`);
        continue;
      }

      try {
        console.log(`⬆️  Uploading: ${filename}`);
        // Use a stable publicId so re-runs do not duplicate
        const publicId = `echo-catering/gallery/${path.parse(filename).name}`;
        const url = await uploadFileToCloudinary(localPath, publicId);
        console.log(`✅ Cloudinary URL: ${url}`);

        await updateMongoDocument(doc._id, url, publicId);
        console.log(`✅ MongoDB updated: _id=${doc._id}`);
      } catch (err) {
        console.error(`❌ Failed to upload/update ${filename}:`, err.message);
        // Continue with next file
      }
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


