const mongoose = require('mongoose');
const Cocktail = require('../../server/models/Cocktail');
const Recipe = require('../../server/models/Recipe');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

async function updateLavenderGandTRecipe() {
  try {
    console.log('🔄 Updating Lavender G&T recipe...\n');

    // Find the Lavender G&T cocktail
    const cocktail = await Cocktail.findOne({ name: /lavender/i });
    if (!cocktail) {
      console.log('❌ Lavender G&T cocktail not found');
      process.exit(1);
    }

    console.log(`✅ Found cocktail: "${cocktail.name}" (ID: ${cocktail._id})`);

    // Find the existing recipe from MENU UI
    const sourceRecipe = await Recipe.findOne({ title: 'LAVENDER G&T', type: 'cocktail' });
    if (!sourceRecipe) {
      console.log('❌ LAVENDER G&T recipe not found in recipes collection');
      process.exit(1);
    }

    console.log(`✅ Found source recipe: "${sourceRecipe.title}" (ID: ${sourceRecipe._id})`);

    // Find or create recipe linked to the cocktail
    let targetRecipe = await Recipe.findOne({ title: cocktail.name, type: 'cocktail' });
    
    if (!targetRecipe) {
      // Create new recipe linked to cocktail
      console.log('📝 Creating new recipe for cocktail...');
      targetRecipe = new Recipe({
        title: cocktail.name,
        type: 'cocktail',
        items: [],
        totals: { volumeOz: 0, costEach: 0 },
        metadata: {},
        backgroundColor: '#e5e5e5',
        batch: { size: 0, unit: 'oz', yieldCount: 0 }
      });
    }

    // Update recipe with data from source recipe
    targetRecipe.title = cocktail.name; // Ensure title matches cocktail name
    targetRecipe.type = 'cocktail';
    targetRecipe.items = JSON.parse(JSON.stringify(sourceRecipe.items)); // Deep copy
    targetRecipe.totals = JSON.parse(JSON.stringify(sourceRecipe.totals)); // Deep copy
    targetRecipe.metadata = JSON.parse(JSON.stringify(sourceRecipe.metadata)); // Deep copy
    targetRecipe.backgroundColor = sourceRecipe.backgroundColor || '#e5ccff';
    targetRecipe.batch = JSON.parse(JSON.stringify(sourceRecipe.batch || { size: 0, unit: 'oz', yieldCount: 0 }));
    targetRecipe.notes = sourceRecipe.notes || '';
    targetRecipe.batchNotes = sourceRecipe.batchNotes || '';

    // Mark arrays as modified for Mongoose
    targetRecipe.markModified('items');
    targetRecipe.markModified('totals');
    targetRecipe.markModified('metadata');
    targetRecipe.markModified('batch');

    await targetRecipe.save();

    console.log('\n✅ Recipe updated successfully!');
    console.log(`   Recipe ID: ${targetRecipe._id}`);
    console.log(`   Title: ${targetRecipe.title}`);
    console.log(`   Items: ${targetRecipe.items.length}`);
    console.log(`   Total Volume: ${targetRecipe.totals.volumeOz} oz`);
    console.log(`   Total Cost: $${targetRecipe.totals.costEach.toFixed(2)}`);
    console.log(`   Background Color: ${targetRecipe.backgroundColor}`);
    console.log(`   Ice: ${targetRecipe.metadata.ice || 'N/A'}`);
    console.log(`   Garnish: ${targetRecipe.metadata.garnish || 'N/A'}`);
    console.log(`   Type: ${targetRecipe.metadata.type || 'N/A'}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating recipe:', error);
    process.exit(1);
  }
}

// Run update
updateLavenderGandTRecipe();

