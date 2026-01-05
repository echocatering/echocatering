const mongoose = require('mongoose');
const Recipe = require('../../server/models/Recipe');
require('dotenv').config();

const listPremixRecipes = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    const premixRecipes = await Recipe.find({ type: 'premix' })
      .sort({ title: 1 })
      .lean();

    console.log(`\n📋 Found ${premixRecipes.length} premix recipe(s):\n`);

    premixRecipes.forEach((recipe, index) => {
      console.log(`${index + 1}. ${recipe.title}`);
      console.log(`   ID: ${recipe._id}`);
      console.log(`   Items: ${recipe.items?.length || 0}`);
      console.log(`   Total Volume: ${recipe.totals?.volumeOz || 0} oz`);
      console.log(`   Total Cost: $${recipe.totals?.costEach || 0}`);
      if (recipe.metadata) {
        console.log(`   Metadata:`, JSON.stringify(recipe.metadata, null, 2));
      }
      console.log('');
    });

    if (premixRecipes.length === 0) {
      console.log('⚠️  No premix recipes found in the database.');
    }

  } catch (error) {
    console.error('❌ Error listing premix recipes:', error);
  } finally {
    await mongoose.disconnect();
  }
};

listPremixRecipes();

