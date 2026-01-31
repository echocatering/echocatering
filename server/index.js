const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { readOnlyMiddleware, isReadOnlyEnabled } = require('./middleware/readOnly');
const { initSquareClient } = require('./squareClient');

// Only load dotenv if not in production (Render provides env vars directly)
if (process.env.NODE_ENV !== 'production') {
  // Load from project root so running from /server or repo root behaves the same.
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
}

// Fail fast on missing critical env vars
const requiredEnv = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'MONGODB_URI'
];
const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length) {
  const isRender = !!process.env.RENDER;
  const envHint = isRender 
    ? '\n💡 On Render: Check your service dashboard → Environment tab → Ensure vars are set in the BACKEND service (not frontend)'
    : '\n💡 Locally: Check your .env file in the project root';
  const message = `Missing required environment variables: ${missing.join(', ')}${envHint}`;
  console.error('❌', message);
  throw new Error(message);
}

const app = express();
// Behind Render's proxy; needed for express-rate-limit to honor X-Forwarded-For
app.set('trust proxy', 1);
// Frontend dev server runs on 3000; backend default must match CRA proxy (see package.json).
const PORT = Number(process.env.PORT || 5002);
if (!Number.isFinite(PORT) || PORT <= 0) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}

// Get allowed origins from environment.
// In production, this MUST include your custom domain(s), e.g.:
// ALLOWED_ORIGINS=https://echocatering.com,https://www.echocatering.com
function normalizeOrigin(o) {
  return String(o || '')
    .trim()
    .replace(/\/+$/, ''); // strip trailing slash
}

function expandAllowedOriginEntry(entry) {
  const raw = normalizeOrigin(entry);
  if (!raw) return [];

  // If user provided a bare hostname (e.g. echocatering.com), accept https/http forms.
  if (!/^https?:\/\//i.test(raw)) {
    return [`https://${raw}`, `http://${raw}`];
  }

  // If user provided a full URL, keep only its origin for matching.
  try {
    const u = new URL(raw);
    return [u.origin];
  } catch {
    // If it's not a valid URL, keep as-is (best effort).
    return [raw];
  }
}

const allowedProdOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
    .flatMap(expandAllowedOriginEntry)
    .map(normalizeOrigin)
    .filter(Boolean)
);

// Auto-allow Render domain if running on Render
if (process.env.RENDER_EXTERNAL_URL) {
  try {
    allowedProdOrigins.add(new URL(process.env.RENDER_EXTERNAL_URL).origin);
  } catch {
    allowedProdOrigins.add(normalizeOrigin(process.env.RENDER_EXTERNAL_URL));
  }
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no Origin header (server-side tools, health checks)
    // Some clients send the literal string "null" as Origin; treat it as no-origin.
    if (!origin || origin === 'null') {
      return callback(null, true);
    }
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    const normalized = normalizeOrigin(origin);
    if (allowedProdOrigins.has(normalized)) {
      return callback(null, true);
    }
    const err = new Error('Not allowed by CORS');
    err.status = 403;
    return callback(err);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  // Allow Cloudinary-hosted assets (images/videos) while keeping Helmet defaults.
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      // Helmet's default img-src is "'self' data:"; extend to Cloudinary and blob: URLs (for SVG-to-PNG conversion)
      'img-src': ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
      // Allow Cloudinary video/image media loads
      'media-src': ["'self'", 'https://res.cloudinary.com'],
      // Allow the admin UI to POST large uploads directly to the local worker via Cloudflare Tunnel.
      // Without this, the browser can block the request before it shows up in DevTools → Network.
      'connect-src': [
        "'self'",
        // Temporary Cloudflare Tunnel hostnames
        'https://*.trycloudflare.com',
        // Also allow the specifically configured worker URL (future custom domain)
        ...(process.env.VIDEO_WORKER_URL ? [new URL(process.env.VIDEO_WORKER_URL).origin] : []),
      ],
    }
  }
}));
app.use(cors(corsOptions));

// Rate limiting - exclude auth endpoints from strict rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // relaxed limit in development
  // Never rate limit health/logo endpoints (Render may poll these during deploy)
  // NOTE: req.path here is the path AFTER the `/api/` mount (because limiter is applied on `/api/`).
  // We also skip worker heartbeat/status so a 3s heartbeat doesn't trip the limiter.
  skip: (req) =>
    req.path === '/health' ||
    req.path === '/logo' ||
    req.path.startsWith('/video-worker/') ||
    req.path.startsWith('/video-jobs/')
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

// Optional safety rail for local layout work: block all mutating requests.
// Enable with READ_ONLY_MODE=true in your local env.
if (isReadOnlyEnabled()) {
  console.log('🔒 READ_ONLY_MODE enabled: blocking POST/PUT/PATCH/DELETE requests');
}
app.use(readOnlyMiddleware);

// Static file serving with CORS headers for WebGL compatibility
const staticOptions = {
  setHeaders: (res, path) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  }
};
// Gallery/media are Cloudinary-only; no /uploads or /gallery static serving
// Serve cocktails and preview directories
const itemsStatic = express.static(path.join(__dirname, 'uploads/items'), staticOptions);
app.use('/menu-items', itemsStatic);
// Keep /cocktails as alias for backward compatibility (same underlying middleware)
app.use('/cocktails', itemsStatic);
app.use('/maps', express.static(path.join(__dirname, 'uploads/maps'), staticOptions));
// Serve static files from public folder (for proxy compatibility)
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));
// Legacy routes for backwards compatibility
app.use('/resources', express.static(path.join(__dirname, '../public/assets/images')));
app.use('/socials', express.static(path.join(__dirname, '../public/assets/socials')));

// Database connection with retry logic for paused Atlas clusters
let dbConnected = false;
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // 5 seconds between retries

const connectToMongoDB = async (retryCount = 0) => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering';
  
  // Skip retries for local MongoDB
  if (mongoUri.includes('localhost') || mongoUri.includes('127.0.0.1')) {
    try {
      await mongoose.connect(mongoUri);
      console.log('✅ Connected to MongoDB (local)');
      dbConnected = true;
      app.locals.dbConnected = dbConnected;
      return;
    } catch (err) {
      console.error('❌ MongoDB connection error:', err.message);
      console.log('⚠️  Server will run without database connection');
      dbConnected = false;
      app.locals.dbConnected = dbConnected;
      return;
    }
  }

  // Retry logic for Atlas clusters (may be paused)
  try {
    if (retryCount > 0) {
      console.log(`🔄 Attempting to connect to MongoDB Atlas... retry #${retryCount}/${MAX_RETRIES}`);
      console.log('   (This may take a moment if the cluster is paused and waking up)');
    } else {
      console.log('🔄 Connecting to MongoDB Atlas...');
    }

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000, // 10 second timeout per attempt
      socketTimeoutMS: 45000, // 45 second socket timeout
    });

    console.log('✅ Connected to MongoDB Atlas');
    dbConnected = true;
    app.locals.dbConnected = dbConnected;

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
      dbConnected = false;
      app.locals.dbConnected = dbConnected;
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
      dbConnected = false;
      app.locals.dbConnected = dbConnected;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
      dbConnected = true;
      app.locals.dbConnected = dbConnected;
    });

  } catch (err) {
    const isPausedCluster = err.message.includes('ReplicaSetNoPrimary') || 
                           err.message.includes('buffering') ||
                           err.message.includes('timeout') ||
                           err.name === 'MongoServerSelectionError';

    if (isPausedCluster && retryCount < MAX_RETRIES) {
      console.warn(`⚠️  MongoDB cluster appears to be paused or waking up (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      console.log(`   Waiting ${RETRY_DELAY / 1000} seconds before retry...`);
      console.log(`   Error: ${err.message}`);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      
      // Retry connection
      return connectToMongoDB(retryCount + 1);
    } else {
      // Max retries reached or non-retryable error
      console.error('❌ MongoDB connection failed after', retryCount + 1, 'attempt(s)');
      console.error('   Error:', err.message);
      if (retryCount >= MAX_RETRIES) {
        console.error('   ⚠️  Maximum retries reached. The cluster may still be waking up.');
        console.error('   💡 Tip: Free Atlas clusters can take 1-2 minutes to fully wake up.');
        console.error('   💡 The server will continue running and retry on the next request.');
      }
      console.log('⚠️  Server will run without database connection');
      dbConnected = false;
      app.locals.dbConnected = dbConnected;
    }
  }
};

// Start connection (non-blocking - server starts even if DB connection fails)
connectToMongoDB().catch(err => {
  console.error('❌ Fatal MongoDB connection error:', err);
  dbConnected = false;
  app.locals.dbConnected = dbConnected;
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/menu-items', require('./routes/menuItems'));
app.use('/api/gallery', require('./routes/gallery'));
app.use('/api/media', require('./routes/media'));
app.use('/api/content', require('./routes/content'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/countries', require('./routes/countries'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/recipes', require('./routes/recipes'));
app.use('/api/pos', require('./routes/pos'));
app.use('/api/pos-events', require('./routes/posEvents'));
app.use('/api/video-processing', require('./routes/videoProcessing'));
app.use('/api/video-worker', require('./routes/videoWorker'));
app.use('/api/video-jobs', require('./routes/videoJobs'));

// Square Sandbox test route
app.get('/api/square/test', async (req, res) => {
  try {
    const squareClient = await initSquareClient();
    // Square SDK v44+ uses squareClient.locations.list() instead of locationsApi.listLocations()
    const result = await squareClient.locations.list();
    res.json(result);
  } catch (error) {
    console.error('Square API error:', error);
    res.status(500).json({ 
      error: 'Square API request failed', 
      message: error.message 
    });
  }
});

// Square Checkout endpoint for POS tab payments
// Creates a Square Order and Payment from tab data
app.post('/api/square/checkout', async (req, res) => {
  try {
    const { tabId, tabName, items, total } = req.body;
    
    // Validate required fields
    if (!tabId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        message: 'tabId and items array are required' 
      });
    }

    console.log(`[Square Checkout] Processing tab ${tabId} (${tabName}) with ${items.length} items, total: $${(total / 100).toFixed(2)}`);

    // Initialize Square client
    const squareClient = await initSquareClient();
    
    // Get location ID
    const locationsResult = await squareClient.locations.list();
    const locations = locationsResult.locations || [];
    if (locations.length === 0) {
      return res.status(404).json({ error: 'No Square locations found' });
    }
    const locationId = locations[0].id;
    const currency = locations[0].currency || 'USD';

    // Build line items for the order
    // Each item includes name, quantity, price, and modifiers
    const lineItems = items.map((item, index) => {
      // Build item name with modifiers
      let itemName = item.name;
      if (item.modifier) {
        itemName += ` (${item.modifier})`;
      }
      
      // Price in cents (Square uses smallest currency unit)
      const priceInCents = Math.round((item.price || 0) * 100);
      
      return {
        name: itemName,
        quantity: String(item.quantity || 1),
        basePriceMoney: {
          amount: BigInt(priceInCents),
          currency: currency
        },
        note: item.modifier || undefined
      };
    });

    // Calculate total in cents
    const totalInCents = Math.round((total || 0) * 100);
    
    // Generate idempotency keys
    const timestamp = Date.now();
    const orderIdempotencyKey = `order-${tabId}-${timestamp}`;
    const paymentIdempotencyKey = `payment-${tabId}-${timestamp}`;

    // Create the order
    console.log(`[Square Checkout] Creating order with ${lineItems.length} line items...`);
    const orderResult = await squareClient.orders.create({
      idempotencyKey: orderIdempotencyKey,
      order: {
        locationId: locationId,
        lineItems: lineItems,
        state: 'OPEN',
        referenceId: `POS-${tabId}`,
        metadata: {
          tabId: tabId,
          tabName: tabName || '',
          source: 'echo-pos'
        }
      }
    });

    const order = orderResult.order;
    console.log(`[Square Checkout] Order created: ${order.id}`);

    // Create the payment
    // In sandbox, use the test nonce; in production, this would come from Square Web Payments SDK
    const isSandbox = process.env.SQUARE_ENV !== 'production';
    const sourceId = isSandbox ? 'cnon:card-nonce-ok' : req.body.sourceId;
    
    if (!sourceId) {
      return res.status(400).json({ 
        error: 'Payment source required', 
        message: 'sourceId is required for production payments' 
      });
    }

    console.log(`[Square Checkout] Creating payment for order ${order.id}...`);
    const paymentResult = await squareClient.payments.create({
      idempotencyKey: paymentIdempotencyKey,
      sourceId: sourceId,
      amountMoney: {
        amount: BigInt(totalInCents),
        currency: currency
      },
      orderId: order.id,
      locationId: locationId,
      referenceId: `POS-${tabId}`,
      note: `Tab: ${tabName || tabId}`
    });

    const payment = paymentResult.payment;
    console.log(`[Square Checkout] Payment created: ${payment.id}, status: ${payment.status}`);

    // Return success response
    res.json({
      success: true,
      orderId: order.id,
      paymentId: payment.id,
      paymentStatus: payment.status,
      receiptUrl: payment.receiptUrl,
      totalCharged: {
        amount: Number(payment.amountMoney.amount),
        currency: payment.amountMoney.currency
      }
    });

  } catch (error) {
    console.error('[Square Checkout] Error:', error);
    
    // Extract meaningful error message from Square API errors
    let errorMessage = error.message || 'Payment processing failed';
    if (error.errors && Array.isArray(error.errors)) {
      errorMessage = error.errors.map(e => e.detail || e.code).join(', ');
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Payment failed', 
      message: errorMessage,
      details: error.errors || null
    });
  }
});

// Square Orders Aggregated route
// Fetches orders and groups them into 15-minute intervals with item quantities, costs, and categories
app.get('/api/square/orders-aggregated', async (req, res) => {
  try {
    // Step 1: Initialize Square client
    const squareClient = await initSquareClient();
    
    // Step 2: Get the first location ID (or use query param if provided)
    const locationId = req.query.locationId;
    let targetLocationId = locationId;
    
    if (!targetLocationId) {
      // Fetch locations to get the default location ID
      const locationsResult = await squareClient.locations.list();
      const locations = locationsResult.locations || [];
      if (locations.length === 0) {
        return res.status(404).json({ error: 'No locations found' });
      }
      targetLocationId = locations[0].id;
    }
    
    // Step 3: Search for orders at this location
    // Square SDK v44 uses squareClient.orders.search()
    const searchResult = await squareClient.orders.search({
      locationIds: [targetLocationId],
      // Optionally filter by date range (default: last 30 days)
      query: {
        filter: {
          dateTimeFilter: {
            createdAt: {
              startAt: req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              endAt: req.query.endDate || new Date().toISOString()
            }
          }
        },
        sort: {
          sortField: 'CREATED_AT',
          sortOrder: 'ASC'
        }
      }
    });
    
    const orders = searchResult.orders || [];
    
    // Step 4: Group orders into 15-minute intervals
    const intervalMs = 15 * 60 * 1000; // 15 minutes in milliseconds
    const intervalMap = new Map();
    
    for (const order of orders) {
      // Parse the order creation timestamp
      // For fake orders, use the simulated timestamp from referenceId (format: FAKE|<timestamp>|...)
      let createdAt;
      const refId = order.referenceId || '';
      if (refId.startsWith('FAKE|')) {
        const parts = refId.split('|');
        createdAt = new Date(parts[1]);
      } else {
        createdAt = new Date(order.createdAt);
      }
      
      // Calculate the interval start (floor to nearest 15 minutes)
      const intervalStartMs = Math.floor(createdAt.getTime() / intervalMs) * intervalMs;
      const intervalStart = new Date(intervalStartMs).toISOString();
      const intervalEnd = new Date(intervalStartMs + intervalMs).toISOString();
      
      // Get or create the interval entry
      if (!intervalMap.has(intervalStart)) {
        intervalMap.set(intervalStart, {
          intervalStart,
          intervalEnd,
          // items: { itemName: { quantity, cost, category } }
          items: new Map(),
          // categories: { categoryName: { quantity, cost } }
          categories: new Map(),
          // Totals for this interval
          totalQuantity: 0,
          totalCost: 0
        });
      }
      const interval = intervalMap.get(intervalStart);
      
      // Step 5: Aggregate item quantities, costs, and categories for this order
      const lineItems = order.lineItems || [];
      for (const item of lineItems) {
        const itemName = item.name || 'Unknown Item';
        const quantity = parseInt(item.quantity, 10) || 1;
        // Get price in cents (Square uses BigInt for money amounts)
        const pricePerItem = item.basePriceMoney?.amount 
          ? Number(item.basePriceMoney.amount) 
          : 0;
        const itemTotalCost = pricePerItem * quantity;
        // Extract category from note (format: "Category: CategoryName")
        const noteMatch = (item.note || '').match(/Category:\s*(.+)/i);
        const category = noteMatch ? noteMatch[1].trim() : 'Uncategorized';
        
        // Update item aggregation
        if (!interval.items.has(itemName)) {
          interval.items.set(itemName, { quantity: 0, cost: 0, category });
        }
        const itemData = interval.items.get(itemName);
        itemData.quantity += quantity;
        itemData.cost += itemTotalCost;
        
        // Update category aggregation
        if (!interval.categories.has(category)) {
          interval.categories.set(category, { quantity: 0, cost: 0 });
        }
        const catData = interval.categories.get(category);
        catData.quantity += quantity;
        catData.cost += itemTotalCost;
        
        // Update interval totals
        interval.totalQuantity += quantity;
        interval.totalCost += itemTotalCost;
      }
    }
    
    // Step 6: Convert the Map to the desired output format and sort chronologically
    const result = Array.from(intervalMap.values())
      .sort((a, b) => new Date(a.intervalStart) - new Date(b.intervalStart))
      .map(interval => ({
        intervalStart: interval.intervalStart,
        intervalEnd: interval.intervalEnd,
        // Total items and cost for this interval
        totalQuantity: interval.totalQuantity,
        totalCost: interval.totalCost / 100, // Convert cents to dollars
        // Items with quantity, cost, and category
        items: Object.fromEntries(
          Array.from(interval.items.entries()).map(([name, data]) => [
            name,
            {
              quantity: data.quantity,
              cost: data.cost / 100, // Convert cents to dollars
              category: data.category
            }
          ])
        ),
        // Categories with quantity and cost
        categories: Object.fromEntries(
          Array.from(interval.categories.entries()).map(([name, data]) => [
            name,
            {
              quantity: data.quantity,
              cost: data.cost / 100 // Convert cents to dollars
            }
          ])
        )
      }));
    
    // Step 7: Return the aggregated data
    res.json(result);
    
  } catch (error) {
    // Step 8: Handle errors gracefully
    console.error('Square Orders Aggregated API error:', error);
    res.status(500).json({ 
      error: 'Square API request failed', 
      message: error.message 
    });
  }
});

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
  const status = err.status || err.statusCode || 500;
  const isDev = process.env.NODE_ENV !== 'production';
  const message = err.message || 'Internal Server Error';

  // Always log server-side. Avoid noisy full stacks in production unless it's a 5xx.
  if (isDev || status >= 500) {
    console.error(err);
  } else {
    console.warn(`Request error (${status}):`, message);
  }

  return res.status(status).json({
    message,
    ...(isDev ? { stack: err.stack } : {})
  });
});

// Start server (Render expects the process to bind to process.env.PORT)
// Bind explicitly to 0.0.0.0 so Render can detect the open port reliably.
const server = app.listen(PORT, '0.0.0.0', () => {
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
  }
  console.error('❌ Server error:', err);
  process.exit(1);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`${signal} received, shutting down gracefully...`);
  server.close(async () => {
    console.log('Server closed');
    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
      }
    } catch (err) {
      console.error('Error closing MongoDB connection:', err);
    }
    process.exit(0);
  });
};
