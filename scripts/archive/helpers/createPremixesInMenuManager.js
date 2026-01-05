const mongoose = require('mongoose');
const Cocktail = require('../../server/models/Cocktail');
const Recipe = require('../../server/models/Recipe');
require('dotenv').config();

const createPremixesInMenuManager = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Fetch premix recipes
    const premixRecipes = await Recipe.find({ type: 'premix' })
      .sort({ title: 1 })
      .lean();

    console.log(`\n📋 Found ${premixRecipes.length} premix recipe(s)\n`);

    for (const recipe of premixRecipes) {
      // Check if cocktail already exists
      const existingCocktail = await Cocktail.findOne({ 
        name: recipe.title,
        category: 'premix'
      });

      if (existingCocktail) {
        console.log(`⚠️  "${recipe.title}" already exists in MenuManager (ID: ${existingCocktail._id})`);
        continue;
      }

      // Get the highest order number for premix category
      const maxOrder = await Cocktail.findOne({ category: 'premix' })
        .sort({ order: -1 })
        .select('order')
        .lean();
      
      const nextOrder = maxOrder ? (maxOrder.order || 0) + 1 : 0;

      // Create new cocktail entry
      const concept = recipe.metadata?.style || recipe.metadata?.type || 'Pre-mix';
      const ingredients = recipe.items?.map(item => 
        `${item.amount?.display || ''} ${item.amount?.unit || 'oz'} ${item.ingredient?.name || ''}`
      ).join(', ') || '';

      const newCocktail = new Cocktail({
        name: recipe.title,
        concept: concept || 'Pre-mix',
        ingredients: ingredients || 'No ingredients specified',
        globalIngredients: '',
        garnish: recipe.metadata?.garnish || '',
        category: 'premix',
        order: nextOrder,
        status: 'active',
        isActive: true,
        regions: [],
        videoFile: 'placeholder.mp4', // Required field, will be updated when video is uploaded
        itemId: `premix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      });

      await newCocktail.save();
      console.log(`✅ Created "${recipe.title}" in MenuManager (ID: ${newCocktail._id})`);
      console.log(`   Order: ${nextOrder}`);
      console.log(`   Recipe ID: ${recipe._id}`);
      console.log(`   Recipe will be linked by title: "${recipe.title}"\n`);
    }

    console.log('\n✅ Premix creation completed!');
    console.log('\n📊 Summary:');
    const premixCount = await Cocktail.countDocuments({ category: 'premix' });
    console.log(`   Total premixes in MenuManager: ${premixCount}`);

  } catch (error) {
    console.error('❌ Error creating premixes:', error);
  } finally {
    await mongoose.disconnect();
  }
};

createPremixesInMenuManager();

