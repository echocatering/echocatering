const mongoose = require('mongoose');
const InventorySheet = require('../../server/models/InventorySheet');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB');
  restoreTestItems();
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

async function restoreTestItems() {
  try {
    console.log('🔄 Restoring Beer Test and Wine Test...\n');

    // Restore Wine Test
    const wineSheet = await InventorySheet.findOne({ sheetKey: 'wine' });
    if (wineSheet) {
      const wineTestRow = wineSheet.rows.find(row => {
        const valuesMap = row.values instanceof Map ? row.values : new Map(Object.entries(row.values || {}));
        const name = valuesMap.get('name');
        return name && name.toLowerCase() === 'wine test';
      });
      
      if (wineTestRow && wineTestRow.isDeleted) {
        wineTestRow.isDeleted = false;
        console.log('✅ Restored Wine Test');
        wineSheet.markModified('rows');
        await wineSheet.save();
      } else if (!wineTestRow) {
        console.log('⚠️  Wine Test not found (may have been permanently deleted)');
      } else {
        console.log('ℹ️  Wine Test is already active');
      }
    }

    // Restore Beer Test
    const beerSheet = await InventorySheet.findOne({ sheetKey: 'beer' });
    if (beerSheet) {
      const beerTestRow = beerSheet.rows.find(row => {
        const valuesMap = row.values instanceof Map ? row.values : new Map(Object.entries(row.values || {}));
        const name = valuesMap.get('name');
        return name && name.toLowerCase() === 'beer test';
      });
      
      if (beerTestRow && beerTestRow.isDeleted) {
        beerTestRow.isDeleted = false;
        console.log('✅ Restored Beer Test');
        beerSheet.markModified('rows');
        await beerSheet.save();
      } else if (!beerTestRow) {
        console.log('⚠️  Beer Test not found (may have been permanently deleted)');
      } else {
        console.log('ℹ️  Beer Test is already active');
      }
    }

    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error restoring test items:', error);
    process.exit(1);
  }
}

