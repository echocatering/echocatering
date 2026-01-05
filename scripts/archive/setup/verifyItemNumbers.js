const mongoose = require('mongoose');
const InventorySheet = require('../../server/models/InventorySheet');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB');
  verifyItemNumbers();
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

async function verifyItemNumbers() {
  try {
    console.log('🔍 Verifying key item numbers...\n');

    // Check Lavender G&T
    const cocktailsSheet = await InventorySheet.findOne({ sheetKey: 'cocktails' });
    if (cocktailsSheet) {
      const lavenderRow = cocktailsSheet.rows.find(row => {
        const valuesMap = ensureRowValuesMap(row);
        const name = valuesMap.get('name');
        return name && name.toLowerCase().includes('lavender');
      });
      if (lavenderRow) {
        const valuesMap = ensureRowValuesMap(lavenderRow);
        const itemNum = valuesMap.get('itemNumber');
        console.log(`Lavender G&T: itemNumber = ${itemNum} (expected: 1)`);
      }
    }

    // Check Lime Acid
    const preMixSheet = await InventorySheet.findOne({ sheetKey: 'preMix' });
    if (preMixSheet) {
      const limeRow = preMixSheet.rows.find(row => {
        const valuesMap = ensureRowValuesMap(row);
        const name = valuesMap.get('name');
        return name && name.toLowerCase().includes('lime');
      });
      if (limeRow) {
        const valuesMap = ensureRowValuesMap(limeRow);
        const itemNum = valuesMap.get('itemNumber');
        console.log(`Lime Acid: itemNumber = ${itemNum} (expected: 18)`);
      } else {
        console.log('⚠️  Lime Acid not found in preMix sheet');
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error verifying item numbers:', error);
    process.exit(1);
  }
}

