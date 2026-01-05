const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Cocktail = require('./models/Cocktail');
const Gallery = require('./models/Gallery');
const Content = require('./models/Content');
const fs = require('fs');
const path = require('path');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/echo-catering', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Create default admin user
const createDefaultAdmin = async () => {
  try {
    const existingAdmin = await User.findOne({ email: 'admin@echo-catering.com' });
    
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 12);
      
      const adminUser = new User({
        username: 'admin',
        email: 'admin@echo-catering.com',
        password: hashedPassword,
        role: 'admin',
        isActive: true
      });

      await adminUser.save();
      console.log('✅ Default admin user created');
      console.log('📧 Email: admin@echo-catering.com');
      console.log('🔑 Password: admin123');
    } else {
      console.log('ℹ️  Admin user already exists');
    }
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  }
};

// Migrate existing cocktail data
const migrateCocktails = async () => {
  try {
    const existingCocktails = await Cocktail.find();
    
    if (existingCocktails.length === 0) {
      // Import existing cocktail data (legacy hardcoded data for initial migration)
      const originalsData = {
        title: 'Echo Originals',
        videoFiles: ['cocktail2.mp4', 'cocktail3.mp4', 'cocktail4.mp4'],
        cocktailInfo: {
          'cocktail3.mp4': {
            name: 'AMBER THEORY',
            concept: 'A cooling, ethereal summer cocktail that balances crisp vegetal notes with juicy melon and a hint of floral citrus. Think midsummer dusk in a glass—subtle, graceful, and endlessly refreshing.',
            ingredients: "Gin (e.g., Hendrick's), fresh watermelon juice, yuzu or Meyer lemon juice, elderflower liqueur or cucumber liqueur, celery or white pepper bitters, agave nectar or white tea syrup",
            globalIngredients: 'Gin – UK/Scotland\nWatermelon – Africa\nYuzu – Japan\nCucumber – India/Global',
            narrative: 'This cocktail dances across continents—floral from the French Alps, crisp from a Highland gin, and sun-kissed from African melons. Japanese yuzu lends a refined tang, while cucumber and white tea bring a cooling harmony steeped in ancient cultivation.',
          },
          'cocktail2.mp4': {
            name: 'GREEN SILENCE',
            concept: 'A sleek, vegetal-forward cocktail inspired by garden freshness and silence before a summer storm. Balanced and clean, yet deeply expressive.',
            ingredients: 'Mezcal or Aquavit, cilantro juice or oil wash, lime juice or makrut lime, cane syrup or verjus, green Chartreuse or shiso tincture, optional green chili infusion or jalapeño brine',
            globalIngredients: 'Mezcal – Mexico\nCilantro – Mediterranean/South Asia\nMakrut lime – Southeast Asia\nChartreuse – France',
            narrative: 'An aromatic journey from Oaxacan earth to Southeast Asian spice markets, this cocktail layers bold botanicals over ancient stone-ground spirit. With alpine mystique and tropical lift, Velour Bloom is primal, perfumed, and gracefully wild.',
          },
          'cocktail4.mp4': {
            name: 'GOLDEN BASILISK',
            concept: 'A bold yet clean summer sipper—zesty citrus and rich herbal layers slither into harmony, it\'s seductive and aromatic, like a Mediterranean garden in golden hour.',
            ingredients: 'Basil-washed bourbon or reposado tequila, lemon juice, honey syrup or white balsamic reduction, basil tincture or shrub; optional ginger liqueur or olive oil',
            globalIngredients: 'Bourbon – USA\nBasil – Mediterranean\nLemon – Middle East\nOlive oil – Greece',
            narrative: 'Rooted in American distilling heritage and stretched across the ancient Mediterranean, Amber Theory is both rustic and cerebral. Basil and lemon add vibrant contrast, while balsamic, olive oil, and ginger weave depth into this golden-hour elixir.',
          },
        }
      };

      const cocktails = [];
      let order = 0;

      for (const [videoFile, info] of Object.entries(originalsData.cocktailInfo)) {
        const cocktail = new Cocktail({
          name: info.name,
          videoFile: videoFile,
          concept: info.concept,
          ingredients: info.ingredients,
          globalIngredients: info.globalIngredients,
          narrative: info.narrative,
          category: 'originals',
          order: order++,
          isActive: true
        });
        cocktails.push(cocktail);
      }

      await Cocktail.insertMany(cocktails);
      console.log('✅ Existing cocktail data migrated');
    } else {
      console.log('ℹ️  Cocktail data already exists');
    }
  } catch (error) {
    console.error('❌ Error migrating cocktails:', error);
  }
};

// Migrate existing gallery data
const migrateGallery = async () => {
  try {
    const existingImages = await Gallery.find();
    
    if (existingImages.length === 0) {
      // Check if gallery folder exists and import existing images
      const galleryPath = path.join(__dirname, '..', 'server', 'uploads', 'gallery');
      
      if (fs.existsSync(galleryPath)) {
        const files = fs.readdirSync(galleryPath)
          .filter(file => /\.(jpeg|jpg|png|gif|webp)$/i.test(file));

        const images = files.map((file, index) => {
          const stats = fs.statSync(path.join(galleryPath, file));
          return new Gallery({
            filename: file,
            originalName: file,
            title: file.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
            category: 'gallery',
            order: index,
            isActive: true,
            fileSize: stats.size,
            mimeType: `image/${path.extname(file).slice(1)}`
          });
        });

        if (images.length > 0) {
          await Gallery.insertMany(images);
          console.log(`✅ Migrated ${images.length} gallery images`);
        }
      }
    } else {
      console.log('ℹ️  Gallery data already exists');
    }
  } catch (error) {
    console.error('❌ Error migrating gallery:', error);
  }
};

// Run setup
const runSetup = async () => {
  console.log('🚀 Starting Echo Catering Admin Panel Setup...\n');
  
  await createDefaultAdmin();
  await migrateCocktails();
  await migrateGallery();
  
  console.log('\n✅ Setup completed successfully!');
  console.log('\n📋 Next steps:');
  console.log('1. Start the server: npm run server');
  console.log('2. Start the frontend: npm start');
  console.log('3. Access admin panel at: http://localhost:3000/admin');
  console.log('4. Login with: admin@echo-catering.com / admin123');
  
  process.exit(0);
};

runSetup().catch(console.error);


