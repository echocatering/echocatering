const jwt = require('jsonwebtoken');
const { findUserById } = require('../utils/fileAuth');

// Check if running locally (development on port 5002)
// PORT defaults to 5002 in development (see server/index.js)
const isLocalDev = process.env.NODE_ENV !== 'production' && (process.env.PORT === '5002' || process.env.PORT === undefined);

// Authentication is enabled by default, but bypassed for local development
const DISABLE_AUTH = isLocalDev;

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  // TEMPORARY: Bypass authentication if disabled
  if (DISABLE_AUTH) {
    // Set a mock user for bypass
    req.user = {
      id: 'bypass-user',
      email: 'bypass@example.com',
      role: 'admin',
      _id: 'bypass-user'
    };
    if (isLocalDev) {
      console.log('🔓 Authentication bypassed for local development (port 5002)');
    }
    return next();
  }

  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await findUserById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: 'Invalid user' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    console.error('Auth middleware error:', error);
    res.status(500).json({ message: 'Authentication error' });
  }
};

// Middleware to check admin role
const requireAdmin = (req, res, next) => {
  // TEMPORARY: Bypass if auth is disabled
  if (DISABLE_AUTH) {
    return next();
  }
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// Middleware to check editor or admin role
const requireEditor = (req, res, next) => {
  // TEMPORARY: Bypass if auth is disabled
  if (DISABLE_AUTH) {
    return next();
  }
  if (!req.user || !['admin', 'editor'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Editor access required' });
  }
  next();
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireEditor
};
