const express = require('express');
const router = express.Router();
const Sale = require('../models/Sale');
const { authenticateToken } = require('../middleware/auth');

// All sales routes require authentication
router.use(authenticateToken);

/**
 * @route   GET /api/sales
 * @desc    Get sales with pagination and filters
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      eventId,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    if (eventId) {
      query.eventId = eventId;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [sales, total] = await Promise.all([
      Sale.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Sale.countDocuments(query)
    ]);

    res.json({
      sales,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[Sales API] Error fetching sales:', error);
    res.status(500).json({ error: 'Failed to fetch sales', message: error.message });
  }
});

/**
 * @route   GET /api/sales/summary
 * @desc    Get sales summary for a date range
 * @access  Private
 */
router.get('/summary', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      eventId
    } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const summary = await Sale.getSummary(start, end, eventId || null);

    res.json({
      ...summary,
      startDate: start.toISOString(),
      endDate: end.toISOString()
    });
  } catch (error) {
    console.error('[Sales API] Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary', message: error.message });
  }
});

/**
 * @route   GET /api/sales/by-category
 * @desc    Get sales breakdown by category
 * @access  Private
 */
router.get('/by-category', async (req, res) => {
  try {
    const { startDate, endDate, eventId } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const categories = await Sale.getSalesByCategory(start, end, eventId || null);

    res.json({
      categories: categories.map(cat => ({
        category: cat._id,
        quantity: cat.quantity,
        revenue: cat.revenue / 100 // Convert cents to dollars
      })),
      startDate: start.toISOString(),
      endDate: end.toISOString()
    });
  } catch (error) {
    console.error('[Sales API] Error fetching category breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch category breakdown', message: error.message });
  }
});

/**
 * @route   GET /api/sales/top-items
 * @desc    Get top selling items
 * @access  Private
 */
router.get('/top-items', async (req, res) => {
  try {
    const { startDate, endDate, limit = 10, eventId } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const items = await Sale.getTopItems(start, end, parseInt(limit), eventId || null);

    res.json({
      items: items.map(item => ({
        name: item._id,
        category: item.category,
        quantity: item.quantity,
        revenue: item.revenue / 100 // Convert cents to dollars
      })),
      startDate: start.toISOString(),
      endDate: end.toISOString()
    });
  } catch (error) {
    console.error('[Sales API] Error fetching top items:', error);
    res.status(500).json({ error: 'Failed to fetch top items', message: error.message });
  }
});

/**
 * @route   GET /api/sales/hourly
 * @desc    Get hourly sales breakdown for a specific date
 * @access  Private
 */
router.get('/hourly', async (req, res) => {
  try {
    const { date, eventId } = req.query;

    const targetDate = date ? new Date(date) : new Date();

    const hourlyData = await Sale.getHourlySales(targetDate, eventId || null);

    // Fill in missing hours with zeros
    const fullHourlyData = [];
    for (let hour = 0; hour < 24; hour++) {
      const existing = hourlyData.find(h => h._id === hour);
      fullHourlyData.push({
        hour,
        sales: existing ? existing.sales / 100 : 0, // Convert cents to dollars
        transactions: existing ? existing.transactions : 0
      });
    }

    res.json({
      date: targetDate.toISOString().split('T')[0],
      hourly: fullHourlyData
    });
  } catch (error) {
    console.error('[Sales API] Error fetching hourly breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch hourly breakdown', message: error.message });
  }
});

/**
 * @route   GET /api/sales/daily
 * @desc    Get daily sales for a date range
 * @access  Private
 */
router.get('/daily', async (req, res) => {
  try {
    const { startDate, endDate, eventId } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const match = {
      status: 'succeeded',
      createdAt: { $gte: start, $lte: end }
    };

    if (eventId) {
      const mongoose = require('mongoose');
      match.eventId = new mongoose.Types.ObjectId(eventId);
    }

    const dailyData = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          sales: { $sum: '$totalCents' },
          tips: { $sum: '$tipCents' },
          transactions: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    res.json({
      daily: dailyData.map(d => ({
        date: `${d._id.year}-${String(d._id.month).padStart(2, '0')}-${String(d._id.day).padStart(2, '0')}`,
        sales: d.sales / 100,
        tips: d.tips / 100,
        transactions: d.transactions
      })),
      startDate: start.toISOString(),
      endDate: end.toISOString()
    });
  } catch (error) {
    console.error('[Sales API] Error fetching daily breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch daily breakdown', message: error.message });
  }
});

/**
 * @route   GET /api/sales/events
 * @desc    Get sales grouped by event
 * @access  Private
 */
router.get('/events', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const eventData = await Sale.aggregate([
      {
        $match: {
          status: 'succeeded',
          createdAt: { $gte: start, $lte: end },
          eventId: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$eventId',
          eventName: { $first: '$eventName' },
          sales: { $sum: '$totalCents' },
          tips: { $sum: '$tipCents' },
          transactions: { $sum: 1 },
          firstSale: { $min: '$createdAt' },
          lastSale: { $max: '$createdAt' }
        }
      },
      { $sort: { firstSale: -1 } }
    ]);

    res.json({
      events: eventData.map(e => ({
        eventId: e._id,
        eventName: e.eventName,
        sales: e.sales / 100,
        tips: e.tips / 100,
        transactions: e.transactions,
        firstSale: e.firstSale,
        lastSale: e.lastSale
      })),
      startDate: start.toISOString(),
      endDate: end.toISOString()
    });
  } catch (error) {
    console.error('[Sales API] Error fetching event breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch event breakdown', message: error.message });
  }
});

/**
 * @route   GET /api/sales/:id
 * @desc    Get a single sale by ID
 * @access  Private
 */
router.get('/:id', async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id).lean();

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    res.json({ sale });
  } catch (error) {
    console.error('[Sales API] Error fetching sale:', error);
    res.status(500).json({ error: 'Failed to fetch sale', message: error.message });
  }
});

module.exports = router;
