const mongoose = require('mongoose');
const InventorySheet = require('../../server/models/InventorySheet');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB');
  setInitialItemNumbers();
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

async function setInitialItemNumbers() {
  try {
    console.log('🔄 Setting initial item numbers...\n');

    // 1. Set Lavender G&T to 1
    const cocktailsSheet = await InventorySheet.findOne({ sheetKey: 'cocktails' });
    if (cocktailsSheet) {
      const lavenderRow = cocktailsSheet.rows.find(row => {
        const valuesMap = ensureRowValuesMap(row);
        const name = valuesMap.get('name');
        return name && name.toLowerCase().includes('lavender');
      });
      
      if (lavenderRow) {
        const valuesMap = ensureRowValuesMap(lavenderRow);
        valuesMap.set('itemNumber', 1);
        lavenderRow.values = valuesMap; // Ensure the Map is assigned back
        console.log(`✅ Set Lavender G&T to item number 1`);
      } else {
        console.log('⚠️  Lavender G&T not found in cocktails sheet');
      }
      cocktailsSheet.markModified('rows');
      await cocktailsSheet.save();
      // Verify it was saved
      const verifySheet = await InventorySheet.findOne({ sheetKey: 'cocktails' });
      const verifyRow = verifySheet.rows.find(row => {
        const vm = ensureRowValuesMap(row);
        return vm.get('name') && vm.get('name').toLowerCase().includes('lavender');
      });
      if (verifyRow) {
        const vm = ensureRowValuesMap(verifyRow);
        console.log(`   Verified: Lavender G&T itemNumber = ${vm.get('itemNumber')}`);
      }
    }

    // 2. Set mocktails (top to bottom) to 2, 3, 4
    const mocktailsSheet = await InventorySheet.findOne({ sheetKey: 'mocktails' });
    if (mocktailsSheet) {
      // Get all mocktail rows, sorted by order
      const mocktailRows = mocktailsSheet.rows
        .filter(row => !row.isDeleted)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      
      // Set first 3 mocktails to 2, 3, 4
      for (let i = 0; i < Math.min(3, mocktailRows.length); i++) {
        const valuesMap = ensureRowValuesMap(mocktailRows[i]);
        valuesMap.set('itemNumber', i + 2);
        mocktailRows[i].values = valuesMap; // Ensure the Map is assigned back
        const name = valuesMap.get('name') || 'Unnamed';
        console.log(`✅ Set mocktail "${name}" to item number ${i + 2}`);
      }
      mocktailsSheet.markModified('rows');
      await mocktailsSheet.save();
    }

    // 3. Set wine to 5
    const wineSheet = await InventorySheet.findOne({ sheetKey: 'wine' });
    if (wineSheet) {
      const wineRows = wineSheet.rows
        .filter(row => !row.isDeleted)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      
      if (wineRows.length > 0) {
        const valuesMap = ensureRowValuesMap(wineRows[0]);
        valuesMap.set('itemNumber', 5);
        wineRows[0].values = valuesMap; // Ensure the Map is assigned back
        const name = valuesMap.get('name') || 'Unnamed';
        console.log(`✅ Set wine "${name}" to item number 5`);
        wineSheet.markModified('rows');
        await wineSheet.save();
      }
    }

    // 4. Set beer to 6
    const beerSheet = await InventorySheet.findOne({ sheetKey: 'beer' });
    if (beerSheet) {
      const beerRows = beerSheet.rows
        .filter(row => !row.isDeleted)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      
      if (beerRows.length > 0) {
        const valuesMap = ensureRowValuesMap(beerRows[0]);
        valuesMap.set('itemNumber', 6);
        beerRows[0].values = valuesMap; // Ensure the Map is assigned back
        const name = valuesMap.get('name') || 'Unnamed';
        console.log(`✅ Set beer "${name}" to item number 6`);
        beerSheet.markModified('rows');
        await beerSheet.save();
      }
    }

    // 5. Set spirits (top to bottom) to 7-16
    const spiritsSheet = await InventorySheet.findOne({ sheetKey: 'spirits' });
    if (spiritsSheet) {
      const spiritRows = spiritsSheet.rows
        .filter(row => !row.isDeleted)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      
      // Set first 10 spirits to 7-16
      for (let i = 0; i < Math.min(10, spiritRows.length); i++) {
        const valuesMap = ensureRowValuesMap(spiritRows[i]);
        valuesMap.set('itemNumber', i + 7);
        spiritRows[i].values = valuesMap; // Ensure the Map is assigned back
        const name = valuesMap.get('name') || 'Unnamed';
        console.log(`✅ Set spirit "${name}" to item number ${i + 7}`);
      }
      spiritsSheet.markModified('rows');
      await spiritsSheet.save();
    }

    // 6. Set pre-mix (top to bottom) to 17-18
    const preMixSheet = await InventorySheet.findOne({ sheetKey: 'preMix' });
    if (preMixSheet) {
      const preMixRows = preMixSheet.rows
        .filter(row => !row.isDeleted)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      
      // Set first 2 pre-mix items to 17-18
      for (let i = 0; i < Math.min(2, preMixRows.length); i++) {
        const valuesMap = ensureRowValuesMap(preMixRows[i]);
        valuesMap.set('itemNumber', i + 17);
        preMixRows[i].values = valuesMap; // Ensure the Map is assigned back
        const name = valuesMap.get('name') || 'Unnamed';
        console.log(`✅ Set pre-mix "${name}" to item number ${i + 17}`);
      }
      preMixSheet.markModified('rows');
      await preMixSheet.save();
    }

    // Note: dryStock (19-35) should already be correct, but we'll verify it's not being overwritten

    console.log('\n✅ Item numbers set successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting item numbers:', error);
    process.exit(1);
  }
}

