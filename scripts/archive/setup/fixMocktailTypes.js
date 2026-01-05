const mongoose = require('mongoose');
require('dotenv').config();

const Recipe = require('../../server/models/Recipe');

async function fixMocktailTypes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Find all recipes
    const allRecipes = await Recipe.find({}).lean();
    console.log(`📋 Found ${allRecipes.length} total recipes`);

    // Find recipes that might be mocktails but have wrong type
    // Look for recipes with title containing "mocktail" (case insensitive) but type is 'cocktail'
    const potentialMocktails = allRecipes.filter(
      (recipe) =>
        recipe.title &&
        recipe.title.toLowerCase().includes('mocktail') &&
        recipe.type === 'cocktail'
    );

    console.log(`\n🔍 Found ${potentialMocktails.length} potential mocktails with wrong type:`);
    potentialMocktails.forEach((recipe) => {
      console.log(`   - "${recipe.title}" (ID: ${recipe._id}, current type: ${recipe.type})`);
    });

    if (potentialMocktails.length === 0) {
      console.log('\n✅ No mocktails with incorrect types found!');
      await mongoose.connection.close();
      process.exit(0);
    }

    // Ask for confirmation (in a real scenario, you might want to add a prompt)
    console.log('\n⚠️  This will update the type of these recipes to "mocktail"');
    console.log('   Proceeding with fix...\n');

    // Update them
    let fixed = 0;
    for (const recipe of potentialMocktails) {
      await Recipe.findByIdAndUpdate(recipe._id, { type: 'mocktail' });
      console.log(`✅ Fixed: "${recipe.title}" -> type: mocktail`);
      fixed++;
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Fixed: ${fixed} recipes`);
    console.log(`   Total recipes: ${allRecipes.length}`);

    // Also show current distribution
    const cocktails = await Recipe.countDocuments({ type: 'cocktail' });
    const mocktails = await Recipe.countDocuments({ type: 'mocktail' });
    const premix = await Recipe.countDocuments({ type: 'premix' });
    console.log(`\n📊 Current recipe distribution:`);
    console.log(`   Cocktails: ${cocktails}`);
    console.log(`   Mocktails: ${mocktails}`);
    console.log(`   Premix: ${premix}`);

    await mongoose.connection.close();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixMocktailTypes();






