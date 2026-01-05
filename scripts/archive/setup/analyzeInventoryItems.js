const mongoose = require('mongoose');
const InventorySheet = require('../../server/models/InventorySheet');
const Recipe = require('../../server/models/Recipe');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB');
  analyzeInventoryItems();
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

async function analyzeInventoryItems() {
  try {
    console.log('🔍 Analyzing inventory items...\n');

    const sheetKeys = ['cocktails', 'mocktails', 'wine', 'spirits', 'beer', 'preMix', 'dryStock'];
    
    // Get all valid recipe IDs for cocktails and mocktails
    const cocktailRecipes = await Recipe.find({ type: 'cocktail' }).select('_id').lean();
    const mocktailRecipes = await Recipe.find({ type: 'mocktail' }).select('_id').lean();
    const premixRecipes = await Recipe.find({ type: 'premix' }).select('_id').lean();
    
    const validCocktailRecipeIds = new Set(cocktailRecipes.map(r => String(r._id)));
    const validMocktailRecipeIds = new Set(mocktailRecipes.map(r => String(r._id)));
    const validPremixRecipeIds = new Set(premixRecipes.map(r => String(r._id)));

    let totalRows = 0;
    let visibleRows = 0;
    let hiddenRows = 0;
    let rowsToDelete = [];

    for (const sheetKey of sheetKeys) {
      const sheet = await InventorySheet.findOne({ sheetKey });
      if (!sheet || !sheet.rows) continue;

      console.log(`\n📊 ${sheetKey.toUpperCase()}:`);
      console.log(`   Total rows: ${sheet.rows.length}`);

      const visible = [];
      const hidden = [];

      sheet.rows.forEach((row) => {
        if (row.isDeleted) return; // Skip already deleted rows
        
        totalRows++;
        const valuesMap = ensureRowValuesMap(row);
        const name = valuesMap.get('name') || 'Unnamed';
        const itemNumber = valuesMap.get('itemNumber');
        const recipeId = valuesMap.get('recipeId');
        const menuManagerId = valuesMap.get('menuManagerId');

        let isVisible = false;
        let reason = '';

        if (sheetKey === 'cocktails' || sheetKey === 'mocktails') {
          // For cocktails/mocktails: visible if has valid recipeId OR has name (synced from MenuManager)
          if (recipeId && validCocktailRecipeIds.has(String(recipeId))) {
            isVisible = true;
            reason = 'valid recipe';
          } else if (recipeId && sheetKey === 'mocktails' && validMocktailRecipeIds.has(String(recipeId))) {
            isVisible = true;
            reason = 'valid recipe';
          } else if (name && name !== 'Unnamed' && name.trim().length > 0) {
            isVisible = true;
            reason = 'has name (synced from MenuManager)';
          } else {
            isVisible = false;
            reason = 'no valid recipe or name';
          }
        } else if (sheetKey === 'preMix') {
          // For preMix: visible if has valid recipeId OR has name
          if (recipeId && validPremixRecipeIds.has(String(recipeId))) {
            isVisible = true;
            reason = 'valid recipe';
          } else if (name && name !== 'Unnamed' && name.trim().length > 0) {
            isVisible = true;
            reason = 'has name';
          } else {
            isVisible = false;
            reason = 'no valid recipe or name';
          }
        } else {
          // For other sheets: visible if has name
          if (name && name !== 'Unnamed' && name.trim().length > 0) {
            isVisible = true;
            reason = 'has name';
          } else {
            isVisible = false;
            reason = 'no name';
          }
        }

        if (isVisible) {
          visibleRows++;
          visible.push({ name, itemNumber, reason });
        } else {
          hiddenRows++;
          hidden.push({ name, itemNumber, reason, rowId: row._id });
          rowsToDelete.push({ sheetKey, rowId: row._id, name, itemNumber });
        }
      });

      console.log(`   Visible: ${visible.length}`);
      console.log(`   Hidden (should delete): ${hidden.length}`);
      
      if (hidden.length > 0) {
        console.log(`\n   Hidden items:`);
        hidden.slice(0, 10).forEach(item => {
          console.log(`     - "${item.name}" (itemNumber: ${item.itemNumber}) - ${item.reason}`);
        });
        if (hidden.length > 10) {
          console.log(`     ... and ${hidden.length - 10} more`);
        }
      }
    }

    console.log(`\n\n📈 SUMMARY:`);
    console.log(`   Total rows: ${totalRows}`);
    console.log(`   Visible rows: ${visibleRows}`);
    console.log(`   Hidden rows (should delete): ${hiddenRows}`);
    console.log(`   Rows to delete: ${rowsToDelete.length}`);

    if (rowsToDelete.length > 0) {
      console.log(`\n⚠️  Found ${rowsToDelete.length} rows that should be deleted.`);
      console.log(`   Run the cleanup script to delete them.`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error analyzing inventory items:', error);
    process.exit(1);
  }
}

