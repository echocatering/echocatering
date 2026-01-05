const mongoose = require('mongoose');
const Cocktail = require('../../server/models/Cocktail');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

async function migrateCategories() {
  try {
    console.log('🔄 Starting category migration...\n');

    // Migrate "classics" to "cocktails"
    const classicsResult = await Cocktail.updateMany(
      { category: 'classics' },
      { $set: { category: 'cocktails' } }
    );
    console.log(`✅ Updated ${classicsResult.modifiedCount} cocktail(s) from "classics" to "cocktails"`);

    // Migrate "originals" to "mocktails"
    const originalsResult = await Cocktail.updateMany(
      { category: 'originals' },
      { $set: { category: 'mocktails' } }
    );
    console.log(`✅ Updated ${originalsResult.modifiedCount} cocktail(s) from "originals" to "mocktails"`);

    // Show summary
    const summary = await Cocktail.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    console.log('\n📊 Category Summary:');
    summary.forEach(item => {
      console.log(`   ${item._id}: ${item.count} cocktail(s)`);
    });

    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

// Run migration
migrateCategories();

