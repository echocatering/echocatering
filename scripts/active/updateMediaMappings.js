/**
 * Backfill non-gallery assets (map, videos, logo, about) with Cloudinary URLs.
 *
 * Runs only outside production. Idempotent: skips fields already set.
 *
 * Mappings below use known identifiers:
 * - Cocktail itemNumber: 1 (map, full video, icon video)
 * - Content (logo): page 'global', section 'header', type 'logo'
 * - Content (about): sections 1 and 3
 *
 * Env:
 *   MONGODB_URI="your atlas uri"
 *   NODE_ENV=development
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Cocktail = require('../../server/models/Cocktail');
const Content = require('../../server/models/Content');

if (process.env.NODE_ENV === 'production') {
  console.log('🚫 Skipping backfill in production (run locally).');
  return;
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering';

// Inline mappings
const cocktailMap = {
  1: {
    cloudinaryMapSnapshotUrl: 'https://res.cloudinary.com/duysruzct/image/upload/v1767760624/echo-catering/maps/1_map.png',
    cloudinaryVideoUrl: 'https://res.cloudinary.com/duysruzct/video/upload/v1767763782/echo-catering/videos/1_full.mp4',
    cloudinaryIconUrl: 'https://res.cloudinary.com/duysruzct/video/upload/v1767763784/echo-catering/videos/1_icon.mp4'
  }
};

const contentLogo = {
  page: 'global',
  section: 'header',
  type: 'logo',
  cloudinaryUrl: 'https://res.cloudinary.com/duysruzct/image/upload/v1767742017/echo-catering/logo/Echo5_-1766425330231-238813107_cfah7l.png'
};

const contentAbout = [
  {
    sectionNumber: 1,
    cloudinaryUrl: 'https://res.cloudinary.com/duysruzct/image/upload/v1767768754/echo-catering/about/1_about.jpg'
  },
  {
    sectionNumber: 3,
    cloudinaryUrl: 'https://res.cloudinary.com/duysruzct/image/upload/v1767768764/echo-catering/about/3_about.jpg'
  }
];

async function updateCocktails() {
  for (const [itemNumberStr, payload] of Object.entries(cocktailMap)) {
    const itemNumber = Number(itemNumberStr);
    let doc = await Cocktail.findOne({ itemNumber });
    if (!doc) {
      console.warn(`⚠️  Cocktail itemNumber ${itemNumber} not found, creating placeholder`);
      doc = new Cocktail({
        itemNumber,
        name: `Item ${itemNumber}`,
        concept: '',
        ingredients: '',
        garnish: '',
        category: 'cocktails',
        page: 'cocktails',
        order: 0,
        regions: []
      });
    }
    let updated = false;
    if (!doc.cloudinaryMapSnapshotUrl) {
      doc.cloudinaryMapSnapshotUrl = payload.cloudinaryMapSnapshotUrl;
      updated = true;
      console.log(`✅ Set map URL for item ${itemNumber}`);
    }
    if (!doc.cloudinaryVideoUrl) {
      doc.cloudinaryVideoUrl = payload.cloudinaryVideoUrl;
      updated = true;
      console.log(`✅ Set full video URL for item ${itemNumber}`);
    }
    if (!doc.cloudinaryIconUrl) {
      doc.cloudinaryIconUrl = payload.cloudinaryIconUrl;
      updated = true;
      console.log(`✅ Set icon video URL for item ${itemNumber}`);
    }
    if (updated) {
      await doc.save();
      console.log(`💾 Saved cocktail item ${itemNumber}`);
    } else {
      console.log(`⏭️  Cocktail item ${itemNumber} already has URLs, skipping`);
    }
  }
}

async function updateLogo() {
  let doc = await Content.findOne({
    page: contentLogo.page,
    section: contentLogo.section,
    type: contentLogo.type
  });
  if (!doc) {
    doc = new Content({
      page: contentLogo.page,
      section: contentLogo.section,
      type: contentLogo.type,
      title: 'Logo',
      content: '',
      isActive: true
    });
  }
  if (!doc.cloudinaryUrl) {
    doc.cloudinaryUrl = contentLogo.cloudinaryUrl;
    await doc.save();
    console.log('✅ Set logo cloudinaryUrl');
  } else {
    console.log('⏭️  Logo already has cloudinaryUrl, skipping');
  }
}

async function updateAbout() {
  for (const entry of contentAbout) {
    const sectionNumber = Number(entry.sectionNumber);
    const sectionKey = `section${sectionNumber}`;
    let doc = await Content.findOne({
      page: 'about',
      section: sectionKey,
      type: 'image'
    });
    if (!doc) {
      doc = new Content({
        page: 'about',
        section: sectionKey,
        type: 'image',
        title: `About ${sectionKey}`,
        content: '',
        isActive: true
      });
    }
    if (!doc.cloudinaryUrl) {
      doc.cloudinaryUrl = entry.cloudinaryUrl;
      await doc.save();
      console.log(`✅ Set about image for ${sectionKey}`);
    } else {
      console.log(`⏭️  About ${sectionKey} already has cloudinaryUrl, skipping`);
    }
  }
}

async function run() {
  console.log('🔄 Starting non-gallery backfill');
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    await updateCocktails();
    await updateLogo();
    await updateAbout();
  } catch (err) {
    console.error('❌ Error during backfill:', err.message);
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

