require('dotenv').config();
const mongoose = require('mongoose');
const Recipe = require('../server/models/Recipe');
const Cocktail = require('../server/models/Cocktail');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering');
    console.log('✅ Connected to MongoDB');

    // Find all recipes without itemNumber
    const recipes = await Recipe.find({ 
      $or: [
        { itemNumber: { $exists: false } },
        { itemNumber: null }
      ]
    });

    console.log(`\n📋 Found ${recipes.length} recipe(s) without itemNumber\n`);

    if (recipes.length === 0) {
      console.log('✅ All recipes already have itemNumber!');
      await mongoose.disconnect();
      return;
    }

    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const recipe of recipes) {
      try {
        // Map recipe type to category
        const category = recipe.type === 'cocktail' ? 'cocktails' : 
                        recipe.type === 'mocktail' ? 'mocktails' : 
                        recipe.type === 'premix' ? 'premix' : null;
        
        if (!category) {
          console.log(`⚠️  Skipping ${recipe.type} recipe "${recipe.title}" (no category mapping)`);
          skipped++;
          continue;
        }

        // Try to find matching cocktail by name (case-insensitive)
        const cocktail = await Cocktail.findOne({
          name: { $regex: new RegExp(`^${recipe.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          category: category,
          status: { $ne: 'archived' }
        });

        if (cocktail && cocktail.itemNumber) {
          recipe.itemNumber = cocktail.itemNumber;
          await recipe.save();
          console.log(`✅ Updated recipe "${recipe.title}" (${recipe.type}) with itemNumber: ${cocktail.itemNumber}`);
          updated++;
        } else {
          console.log(`⚠️  No matching cocktail found for recipe "${recipe.title}" (${recipe.type})`);
          skipped++;
        }
      } catch (error) {
        console.error(`❌ Error processing recipe "${recipe.title}":`, error.message);
        errors.push({ recipe: recipe.title, error: error.message });
      }
    }

    console.log(`\n✅ Migration complete:`);
    console.log(`   - Updated: ${updated}`);
    console.log(`   - Skipped: ${skipped}`);
    if (errors.length > 0) {
      console.log(`   - Errors: ${errors.length}`);
      errors.forEach(({ recipe, error }) => {
        console.log(`     - "${recipe}": ${error}`);
      });
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
})();

