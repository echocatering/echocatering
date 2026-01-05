const mongoose = require('mongoose');
const Cocktail = require('./server/models/Cocktail');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/echo');
  let updated = 0;
  const cursor = Cocktail.find({
    $or: [
      { ingredients: { $exists: true, $ne: '' } },
      { garnish: { $exists: true, $ne: '' } },
      { regions: { $exists: true, $ne: [] } },
      { globalIngredients: { $exists: true, $ne: '' } }
    ]
  }).cursor();

  for await (const doc of cursor) {
    doc.ingredients = '';
    doc.garnish = '';
    doc.regions = [];
    doc.globalIngredients = '';
    await doc.save();
    updated++;
  }

  console.log(`Cleared shared fields on ${updated} Cocktail docs.`);
  await mongoose.disconnect();
})();
