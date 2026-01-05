const mongoose = require('mongoose');
const Cocktail = require('../server/models/Cocktail');

// Hardcoded cocktail data from the site
const hardcodedCocktails = [
  // Originals
  {
    name: 'GREEN SILENCE',
    concept: 'A sleek, vegetal-forward cocktail inspired by garden freshness and silence before a summer storm. Balanced and clean, yet deeply expressive.',
    ingredients: 'Mezcal or Aquavit, cilantro juice or oil wash, lime juice or makrut lime, cane syrup or verjus, green Chartreuse or shiso tincture, optional green chili infusion or jalapeño brine',
    globalIngredients: 'Mezcal – Mexico\nCilantro – Mediterranean/South Asia\nMakrut lime – Southeast Asia\nChartreuse – France',
    narrative: 'An aromatic journey from Oaxacan earth to Southeast Asian spice markets, this cocktail layers bold botanicals over ancient stone-ground spirit. With alpine mystique and tropical lift, Velour Bloom is primal, perfumed, and gracefully wild.',
    category: 'originals',
    videoFile: 'cocktail2.mp4',
    order: 0,
    isActive: true
  },
  {
    name: 'AMBER THEORY',
    concept: 'A cooling, ethereal summer cocktail that balances crisp vegetal notes with juicy melon and a hint of floral citrus. Think midsummer dusk in a glass—subtle, graceful, and endlessly refreshing.',
    ingredients: "Gin (e.g., Hendrick's), fresh watermelon juice, yuzu or Meyer lemon juice, elderflower liqueur or cucumber liqueur, celery or white pepper bitters, agave nectar or white tea syrup",
    globalIngredients: 'Gin – UK/Scotland\nWatermelon – Africa\nYuzu – Japan\nCucumber – India/Global',
    narrative: 'This cocktail dances across continents—floral from the French Alps, crisp from a Highland gin, and sun-kissed from African melons. Japanese yuzu lends a refined tang, while cucumber and white tea bring a cooling harmony steeped in ancient cultivation.',
    category: 'originals',
    videoFile: 'cocktail3.mp4',
    order: 1,
    isActive: true
  },
  {
    name: 'GOLDEN BASILISK',
    concept: 'A bold yet clean summer sipper—zesty citrus and rich herbal layers slither into harmony, it\'s seductive and aromatic, like a Mediterranean garden in golden hour.',
    ingredients: 'Basil-washed bourbon or reposado tequila, lemon juice, honey syrup or white balsamic reduction, basil tincture or shrub; optional ginger liqueur or olive oil',
    globalIngredients: 'Bourbon – USA\nBasil – Mediterranean\nLemon – Middle East\nOlive oil – Greece',
    narrative: 'Rooted in American distilling heritage and stretched across the ancient Mediterranean, Amber Theory is both rustic and cerebral. Basil and lemon add vibrant contrast, while balsamic, olive oil, and ginger weave depth into this golden-hour elixir.',
    category: 'originals',
    videoFile: 'cocktail4.mp4',
    order: 2,
    isActive: true
  },
  
  // Classics
  {
    name: 'CLASSIC GREEN',
    concept: 'A classic green cocktail.',
    ingredients: 'Gin, lime, mint',
    globalIngredients: 'Gin – UK\nLime – Mexico\nMint – Global',
    narrative: 'A timeless classic with a fresh twist.',
    category: 'classics',
    videoFile: 'cocktail2.mp4',
    order: 0,
    isActive: true
  },
  {
    name: 'CLASSIC AMBER',
    concept: 'A classic amber cocktail.',
    ingredients: 'Whiskey, lemon, honey',
    globalIngredients: 'Whiskey – USA\nLemon – Italy\nHoney – Global',
    narrative: 'Warm and inviting, this classic is perfect for any occasion.',
    category: 'classics',
    videoFile: 'cocktail3.mp4',
    order: 1,
    isActive: true
  },
  {
    name: 'CLASSIC BASIL',
    concept: 'A classic basil cocktail.',
    ingredients: 'Vodka, basil, sugar',
    globalIngredients: 'Vodka – Russia\nBasil – Mediterranean\nSugar – Global',
    narrative: 'Herbal and refreshing, a modern take on a classic.',
    category: 'classics',
    videoFile: 'cocktail4.mp4',
    order: 2,
    isActive: true
  },
  
  // Spirits
  {
    name: 'SINGLE MALT NEAT',
    concept: 'Premium single malt scotch served in its purest form to showcase the spirit\'s character.',
    ingredients: 'Single malt scotch whisky',
    globalIngredients: 'Single Malt Scotch – Scotland',
    narrative: 'Scotland\'s finest export, single malt scotch represents centuries of tradition and craftsmanship, each distillery producing a unique expression of their local terroir.',
    category: 'spirits',
    videoFile: 'cocktail1.mp4',
    order: 0,
    isActive: true
  },
  
  // Hors d'Oeuvres
  {
    name: 'ARTISAN CHEESE BOARD',
    concept: 'A curated selection of artisanal cheeses paired with complementary accompaniments.',
    ingredients: 'Selection of artisanal cheeses, honey, nuts, dried fruits, artisan bread',
    globalIngredients: 'Cheese – Various regions\nHoney – Local apiaries\nNuts – California orchards',
    narrative: 'A celebration of craftsmanship and tradition, featuring cheeses from small-batch producers who honor centuries-old methods and local terroir.',
    category: 'hors',
    videoFile: 'cocktail1.mp4',
    order: 0,
    isActive: true
  }
];

async function importCocktails() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/echo-catering', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Clear existing cocktails
    await Cocktail.deleteMany({});
    console.log('Cleared existing cocktails');

    // Import hardcoded cocktails
    const importedCocktails = await Cocktail.insertMany(hardcodedCocktails);
    console.log(`Successfully imported ${importedCocktails.length} cocktails:`);
    
    importedCocktails.forEach(cocktail => {
      console.log(`- ${cocktail.name} (${cocktail.category})`);
    });

    console.log('\nImport completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

importCocktails();
