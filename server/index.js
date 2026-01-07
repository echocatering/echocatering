const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5002;

// Get allowed origins from environment or use default
// In production, allow Render domain and any custom domains
const allowedProdOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [];
  
// Auto-allow Render domain if running on Render
if (process.env.RENDER_EXTERNAL_URL) {
  allowedProdOrigins.push(process.env.RENDER_EXTERNAL_URL);
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    if (allowedProdOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors(corsOptions));

// Rate limiting - exclude auth endpoints from strict rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000 // relaxed limit in development
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit login attempts to 50 per 15 minutes (more lenient)
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
if (process.env.NODE_ENV === 'production') {
  app.use('/api/', generalLimiter);
} else {
  console.warn('⚠️  General API rate limiting disabled in development mode.');
}

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file serving with CORS headers for WebGL compatibility
const staticOptions = {
  setHeaders: (res, path) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  }
};
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), staticOptions));
app.use('/gallery', express.static(path.join(__dirname, 'uploads/gallery'), staticOptions));
// Serve cocktails and preview directories
app.use('/menu-items', express.static(path.join(__dirname, 'uploads/items'), staticOptions));
// Keep /cocktails as alias for backward compatibility
app.use('/cocktails', express.static(path.join(__dirname, 'uploads/items'), staticOptions));
app.use('/maps', express.static(path.join(__dirname, 'uploads/maps'), staticOptions));
// Serve static files from public folder (for proxy compatibility)
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));
// Legacy routes for backwards compatibility
app.use('/resources', express.static(path.join(__dirname, '../public/assets/images')));
app.use('/socials', express.static(path.join(__dirname, '../public/assets/socials')));

// Database connection - make it optional for development
let dbConnected = false;
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Connected to MongoDB');
  dbConnected = true;
  // Make database status available to routes AFTER connection is established
  app.locals.dbConnected = dbConnected;
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  console.log('⚠️  Server will run without database connection');
  dbConnected = false;
  // Make database status available to routes even if connection fails
  app.locals.dbConnected = dbConnected;
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/menu-items', require('./routes/menuItems'));
app.use('/api/gallery', require('./routes/gallery'));
app.use('/api/content', require('./routes/content'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/countries', require('./routes/countries'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/recipes', require('./routes/recipes'));
app.use('/api/pos', require('./routes/pos'));
app.use('/api/video-processing', require('./routes/videoProcessing'));

// Simple logo endpoint that doesn't require database
app.get('/api/logo', (req, res) => {
  res.json({
    content: '',
    title: 'ECHO Catering Logo',
    altText: 'ECHO Catering Logo',
    page: 'global',
    section: 'header',
    type: 'logo'
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  // Serve static files from React build
  app.use(express.static(path.join(__dirname, '../build')));
  
  // Handle React routing - return index.html for all non-API routes
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ message: 'Route not found' });
    }
    res.sendFile(path.join(__dirname, '../build/index.html'));
  });
} else {
  // Development: 404 handler for API routes only
  app.use('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ message: 'Route not found' });
    } else {
      // In development, React dev server handles frontend routes
      res.status(404).json({ message: 'Route not found. Make sure React dev server is running.' });
    }
  });
}

// Error handling middleware (must be after routes)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// CRITICAL: Only start server if this file is run directly (not required)
// This prevents the server from starting multiple times if index.js is imported elsewhere
if (require.main === module) {
  // Start server with error handling
  const server = app.listen(PORT, () => {
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✅ SERVER SUCCESSFULLY STARTED`);
    console.log(`   Port: ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health`);
    console.log(`   Database: ${dbConnected ? '✅ Connected' : '⚠️  Not connected'}`);
    console.log('═══════════════════════════════════════════════════════════');
  });

  // Handle EADDRINUSE errors explicitly
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('═══════════════════════════════════════════════════════════');
      console.error(`❌ PORT ${PORT} IS ALREADY IN USE`);
      console.error(`   Another process is already running on port ${PORT}`);
      console.error(`   Please stop the existing server or use a different port`);
      console.error(`   To find and kill the process: lsof -ti:${PORT} | xargs kill -9`);
      console.error('═══════════════════════════════════════════════════════════');
      process.exit(1);
    } else {
      console.error('❌ Server error:', err);
      process.exit(1);
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      mongoose.connection.close(false, () => {
        console.log('MongoDB connection closed');
        process.exit(0);
      });
    });
  });

  process.on('SIGINT', () => {
    console.log('\nSIGINT received, shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      mongoose.connection.close(false, () => {
        console.log('MongoDB connection closed');
        process.exit(0);
      });
    });
  });
} else {
  // If this file is required (not run directly), export the app for testing or other uses
  module.exports = app;
}
