const mongoose = require('mongoose');
require('dotenv').config();

const Recipe = require('../../server/models/Recipe');
const InventorySheet = require('../../server/models/InventorySheet');

const getRowRecipeId = (row) => {
  if (!row?.values) {
    return null;
  }
  if (row.values instanceof Map) {
    return row.values.get('recipeId');
  }
  return row.values.recipeId;
};

const getRowValue = (row, key) => {
  if (!row?.values) {
    return null;
  }
  if (row.values instanceof Map) {
    return row.values.get(key);
  }
  return row.values[key];
};

async function createRecipesFromInventory() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Get the cocktails inventory sheet
    const sheet = await InventorySheet.findOne({ sheetKey: 'cocktails' });
    if (!sheet) {
      console.error('❌ Cocktails inventory sheet not found');
      process.exit(1);
    }

    const rows = sheet.rows || [];
    console.log(`📋 Found ${rows.length} rows in cocktails inventory sheet`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        // Skip deleted rows
        if (row.isDeleted) {
          continue;
        }

        // Check if this row already has a recipe
        const recipeId = getRowRecipeId(row);
        if (recipeId) {
          // Check if recipe exists
          const existingRecipe = await Recipe.findById(recipeId);
          if (existingRecipe) {
            console.log(`✓ Row "${getRowValue(row, 'name')}" already has recipe: ${recipeId}`);
            skipped++;
            continue;
          } else {
            console.log(`⚠️  Row "${getRowValue(row, 'name')}" has recipeId ${recipeId} but recipe doesn't exist`);
          }
        }

        // Get row values
        const name = getRowValue(row, 'name');
        if (!name || !name.trim()) {
          console.log(`⚠️  Skipping row with no name`);
          skipped++;
          continue;
        }

        // Check if a recipe with this name already exists
        const existingRecipeByName = await Recipe.findOne({ 
          title: name.trim(),
          type: 'cocktail'
        });
        if (existingRecipeByName) {
          console.log(`✓ Recipe "${name}" already exists: ${existingRecipeByName._id}`);
          // Update the inventory row to reference this recipe
          const valuesMap = row.values instanceof Map ? row.values : new Map(Object.entries(row.values || {}));
          valuesMap.set('recipeId', String(existingRecipeByName._id));
          valuesMap.set('recipeType', 'cocktail');
          row.values = valuesMap;
          row.markModified('values');
          skipped++;
          continue;
        }

        // Create a new recipe from the inventory row
        const newRecipe = new Recipe({
          title: name.trim(),
          type: 'cocktail',
          video: { posterUrl: '', videoUrl: '' },
          metadata: {
            style: getRowValue(row, 'style') || '',
            ice: getRowValue(row, 'ice') || '',
            garnish: getRowValue(row, 'garnish') || ''
          },
          notes: '',
          batchNotes: '',
          batch: { size: 0, unit: 'oz', yieldCount: 0 },
          items: [],
          totals: {
            volumeOz: 0,
            costEach: Number(getRowValue(row, 'unitCost')) || 0
          },
          backgroundColor: '#e5e5e5'
        });

        await newRecipe.save();
        console.log(`✅ Created recipe "${name}": ${newRecipe._id}`);

        // Update the inventory row to reference this recipe
        const valuesMap = row.values instanceof Map ? row.values : new Map(Object.entries(row.values || {}));
        valuesMap.set('recipeId', String(newRecipe._id));
        valuesMap.set('recipeType', 'cocktail');
        row.values = valuesMap;
        row.markModified('values');

        created++;
      } catch (error) {
        console.error(`❌ Error processing row:`, error.message);
        errors++;
      }
    }

    if (created > 0 || skipped > 0) {
      sheet.markModified('rows');
      await sheet.save();
      console.log(`\n✅ Saved inventory sheet updates`);
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total rows: ${rows.length}`);

    await mongoose.connection.close();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createRecipesFromInventory();






