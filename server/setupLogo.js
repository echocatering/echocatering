const mongoose = require('mongoose');
const Content = require('./models/Content');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/echo-catering', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Initialize logo content
const initializeLogo = async () => {
  try {
    // Check if logo content already exists
    const existingLogo = await Content.findOne({ 
      page: 'global', 
      section: 'header', 
      type: 'logo' 
    });

    if (existingLogo) {
      console.log('ℹ️  Logo content already exists:', existingLogo);
      return;
    }

    // Create initial logo content
    const logoContent = new Content({
      page: 'global',
      section: 'header',
      type: 'logo',
      content: '', // Logo path (empty if no logo uploaded)
      title: 'ECHO Catering Logo',
      altText: 'ECHO Catering Logo',
      order: 0,
      isActive: true
    });

    await logoContent.save();
    console.log('✅ Logo content initialized successfully');
    console.log('📁 Logo path:', logoContent.content);
    
  } catch (error) {
    console.error('❌ Error initializing logo:', error);
  } finally {
    mongoose.connection.close();
  }
};

// Run the initialization
initializeLogo();
