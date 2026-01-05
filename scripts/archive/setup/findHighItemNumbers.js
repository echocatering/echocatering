const mongoose = require('mongoose');
const InventorySheet = require('../../server/models/InventorySheet');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB');
  findHighItemNumbers();
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Helper function to ensure row values is a Map
const ensureRowValuesMap = (row) => {
  if (!row.values) {
    row.values = new Map();
    return row.values;
  }
  if (row.values instanceof Map) {
    return row.values;
  }
  const cloned = new Map(Object.entries(row.values));
  row.values = cloned;
  return cloned;
};

async function findHighItemNumbers() {
  try {
    console.log('🔍 Finding items with high item numbers (> 35)...\n');

    const sheetKeys = ['cocktails', 'mocktails', 'wine', 'spirits', 'beer', 'preMix', 'dryStock'];
    let foundHigh = false;

    for (const sheetKey of sheetKeys) {
      const sheet = await InventorySheet.findOne({ sheetKey });
      if (!sheet || !sheet.rows) continue;

      sheet.rows.forEach((row) => {
        const valuesMap = ensureRowValuesMap(row);
        const itemNumber = valuesMap.get('itemNumber');
        const num = Number(itemNumber);
        const name = valuesMap.get('name') || 'Unnamed';
        
        if (Number.isFinite(num) && num > 35) {
          foundHigh = true;
          console.log(`⚠️  ${sheetKey}: "${name}" has itemNumber = ${num}`);
        }
      });
    }

    if (!foundHigh) {
      console.log('✅ No items found with item numbers > 35');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error finding high item numbers:', error);
    process.exit(1);
  }
}

