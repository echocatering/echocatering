const mongoose = require('mongoose');
require('dotenv').config();

const Recipe = require('../../server/models/Recipe');
const InventorySheet = require('../../server/models/InventorySheet');
const { applyRowValues } = require('../../server/utils/inventoryHelpers');

async function fixAllPreMixCosts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering');
    console.log('✅ Connected to MongoDB');

    const sheet = await InventorySheet.findOne({ sheetKey: 'preMix' });
    if (!sheet) {
      console.error('❌ Pre-mix inventory sheet not found');
      process.exit(1);
    }

    const columnsByKey = sheet.columns.reduce((acc, col) => {
      acc[col.key] = col;
      return acc;
    }, {});

    // Get all pre-mix recipes
    const recipes = await Recipe.find({ type: 'premix' });
    console.log(`📋 Found ${recipes.length} pre-mix recipes\n`);

    let updated = 0;
    let errors = 0;

    for (const recipe of recipes) {
      try {
        // Find the corresponding inventory row
        const row = sheet.rows.find(r => {
          const recipeId = r.values instanceof Map ? r.values.get('recipeId') : r.values?.recipeId;
          return recipeId && String(recipeId) === String(recipe._id);
        });

        if (!row) {
          console.log(`⚠️  No inventory row found for recipe "${recipe.title}" (${recipe._id})`);
          continue;
        }

        const valuesMap = row.values instanceof Map ? row.values : new Map(Object.entries(row.values || {}));
        const inventoryOunceCost = valuesMap.get('ounceCost');

        if (inventoryOunceCost === null || inventoryOunceCost === undefined || inventoryOunceCost === 0) {
          console.log(`⚠️  No ounceCost in inventory for "${recipe.title}" - skipping`);
          continue;
        }

        const volumeOz = recipe.totals?.volumeOz || 0;
        if (volumeOz === 0) {
          console.log(`⚠️  No volumeOz for "${recipe.title}" - skipping`);
          continue;
        }

        // Calculate correct costEach: costEach = ounceCost * volumeOz
        const correctCostEach = Number((inventoryOunceCost * volumeOz).toFixed(2));
        const currentCostEach = recipe.totals?.costEach || 0;

        // Update recipe if costEach is different
        if (Math.abs(currentCostEach - correctCostEach) > 0.01) {
          recipe.totals.costEach = correctCostEach;
          recipe.markModified('totals');
          await recipe.save();
          console.log(`✅ Updated "${recipe.title}":`, {
            oldCostEach: currentCostEach,
            newCostEach: correctCostEach,
            ounceCost: inventoryOunceCost,
            volumeOz: volumeOz,
            calculation: `${inventoryOunceCost} × ${volumeOz} = ${correctCostEach}`
          });
          updated++;
        } else {
          console.log(`✓ "${recipe.title}" already has correct costEach: ${correctCostEach}`);
        }

        // Verify inventory ounceCost is correct (recalculate to ensure)
        const calculatedOunceCost = Number((correctCostEach / volumeOz).toFixed(2));
        if (Math.abs(inventoryOunceCost - calculatedOunceCost) > 0.01) {
          applyRowValues(row, { ounceCost: calculatedOunceCost }, columnsByKey);
          valuesMap.set('ounceCost', calculatedOunceCost);
          row.markModified('values');
          console.log(`  → Also updated inventory ounceCost to ${calculatedOunceCost}`);
        }

      } catch (error) {
        console.error(`❌ Error processing recipe "${recipe.title}":`, error.message);
        errors++;
      }
    }

    if (updated > 0) {
      sheet.markModified('rows');
      await sheet.save();
      console.log(`\n✅ Saved ${updated} updated recipes and inventory`);
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Already correct: ${recipes.length - updated - errors}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total: ${recipes.length}`);

    await mongoose.connection.close();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixAllPreMixCosts();

