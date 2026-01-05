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
  cleanupHiddenInventoryItems();
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

async function cleanupHiddenInventoryItems() {
  try {
    console.log('🧹 Cleaning up hidden inventory items...\n');

    const sheetKeys = ['cocktails', 'mocktails', 'wine', 'spirits', 'beer', 'preMix', 'dryStock'];
    
    // Get all valid recipe IDs
    const cocktailRecipes = await Recipe.find({ type: 'cocktail' }).select('_id').lean();
    const mocktailRecipes = await Recipe.find({ type: 'mocktail' }).select('_id').lean();
    const premixRecipes = await Recipe.find({ type: 'premix' }).select('_id').lean();
    
    const validCocktailRecipeIds = new Set(cocktailRecipes.map(r => String(r._id)));
    const validMocktailRecipeIds = new Set(mocktailRecipes.map(r => String(r._id)));
    const validPremixRecipeIds = new Set(premixRecipes.map(r => String(r._id)));

    let totalDeleted = 0;

    for (const sheetKey of sheetKeys) {
      const sheet = await InventorySheet.findOne({ sheetKey });
      if (!sheet || !sheet.rows) continue;

      let deletedInSheet = 0;

      sheet.rows.forEach((row) => {
        if (row.isDeleted) return; // Skip already deleted rows
        
        const valuesMap = ensureRowValuesMap(row);
        const name = valuesMap.get('name') || 'Unnamed';
        const recipeId = valuesMap.get('recipeId');

        let shouldDelete = false;

        // Use the EXACT same visibility logic as the inventory GET route
        if (sheetKey === 'cocktails' || sheetKey === 'mocktails') {
          // For cocktails/mocktails: visible if has valid recipeId OR has a name (synced from MenuManager)
          const hasValidRecipe = recipeId && typeof recipeId === 'string' && recipeId.trim().length > 0 && (
            (sheetKey === 'cocktails' && validCocktailRecipeIds.has(recipeId.trim())) ||
            (sheetKey === 'mocktails' && validMocktailRecipeIds.has(recipeId.trim()))
          );
          
          const hasName = name && typeof name === 'string' && name.trim().length > 0;
          
          // Delete if NOT visible (no valid recipe AND no name)
          if (!hasValidRecipe && !hasName) {
            shouldDelete = true;
          }
        } else if (sheetKey === 'preMix') {
          // For preMix: visible if has valid recipeId OR has a name
          const hasValidRecipe = recipeId && typeof recipeId === 'string' && recipeId.trim().length > 0 && 
                                 validPremixRecipeIds.has(recipeId.trim());
          const hasName = name && typeof name === 'string' && name.trim().length > 0;
          
          // Delete if NOT visible (no valid recipe AND no name)
          if (!hasValidRecipe && !hasName) {
            shouldDelete = true;
          }
        } else {
          // For other sheets (wine, spirits, beer, dryStock): visible if has a name
          const hasName = name && typeof name === 'string' && name.trim().length > 0;
          
          // Delete if NOT visible (no name)
          if (!hasName) {
            shouldDelete = true;
          }
        }

        if (shouldDelete) {
          row.isDeleted = true;
          deletedInSheet++;
          totalDeleted++;
          console.log(`   🗑️  Deleted: ${sheetKey} - "${name}"`);
        }
      });

      if (deletedInSheet > 0) {
        sheet.markModified('rows');
        sheet.version += 1;
        await sheet.save();
        console.log(`   ✅ Deleted ${deletedInSheet} rows from ${sheetKey}`);
      }
    }

    console.log(`\n✅ Cleanup complete! Deleted ${totalDeleted} hidden rows total.`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error cleaning up inventory items:', error);
    process.exit(1);
  }
}

