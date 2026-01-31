/**
 * posEvents.js
 * 
 * API routes for POS event management.
 * 
 * Endpoints:
 * - POST /api/pos-events - Create a new event
 * - GET /api/pos-events - List all events
 * - GET /api/pos-events/:id - Get event by ID
 * - GET /api/pos-events/active - Get active event (if any)
 * - PUT /api/pos-events/:id/sync - Sync tabs/items from local UI
 * - PUT /api/pos-events/:id/end - End event and calculate summary
 * - DELETE /api/pos-events/:id - Delete event
 */

const express = require('express');
const router = express.Router();
const PosEvent = require('../models/PosEvent');
const { authenticateToken } = require('../middleware/auth');

/**
 * @route   POST /api/pos-events
 * @desc    Create a new POS event
 * @access  Private
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, date } = req.body;

    // Check if there's already an active event
    const activeEvent = await PosEvent.findOne({ status: 'active' });
    if (activeEvent) {
      return res.status(400).json({
        message: 'An active event already exists. End it before starting a new one.',
        activeEvent: {
          id: activeEvent._id,
          name: activeEvent.name,
          startedAt: activeEvent.startedAt
        }
      });
    }

    const event = new PosEvent({
      name: name || `Event ${new Date().toLocaleDateString()}`,
      date: date || new Date(),
      status: 'active',
      startedAt: new Date(),
      tabs: []
    });

    await event.save();
    console.log(`[POS] Created new event: ${event.name} (${event._id})`);

    res.status(201).json(event);
  } catch (error) {
    console.error('[POS] Error creating event:', error);
    res.status(500).json({ message: 'Failed to create event', error: error.message });
  }
});

/**
 * @route   GET /api/pos-events
 * @desc    List all events (with optional filters)
 * @access  Private
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, limit = 50, skip = 0 } = req.query;
    
    const query = {};
    if (status) {
      query.status = status;
    }

    const events = await PosEvent.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .lean();

    const total = await PosEvent.countDocuments(query);

    res.json({
      events,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    console.error('[POS] Error listing events:', error);
    res.status(500).json({ message: 'Failed to list events', error: error.message });
  }
});

/**
 * @route   GET /api/pos-events/active
 * @desc    Get the currently active event (if any)
 * @access  Private
 */
router.get('/active', authenticateToken, async (req, res) => {
  try {
    const activeEvent = await PosEvent.findOne({ status: 'active' }).lean();
    
    if (!activeEvent) {
      return res.json({ active: false, event: null });
    }

    res.json({ active: true, event: activeEvent });
  } catch (error) {
    console.error('[POS] Error getting active event:', error);
    res.status(500).json({ message: 'Failed to get active event', error: error.message });
  }
});

/**
 * @route   GET /api/pos-events/:id
 * @desc    Get event by ID
 * @access  Private
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const event = await PosEvent.findById(req.params.id).lean();
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.json(event);
  } catch (error) {
    console.error('[POS] Error getting event:', error);
    res.status(500).json({ message: 'Failed to get event', error: error.message });
  }
});

/**
 * @route   PUT /api/pos-events/:id/sync
 * @desc    Sync tabs/items from local UI to database
 * @access  Private
 * 
 * This endpoint receives the full local state and updates the database.
 * It's designed to be called periodically or on significant changes.
 */
router.put('/:id/sync', authenticateToken, async (req, res) => {
  try {
    const { tabs } = req.body;
    
    const event = await PosEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (event.status !== 'active') {
      return res.status(400).json({ message: 'Cannot sync to a non-active event' });
    }

    // Transform tabs from local format to DB format
    const dbTabs = (tabs || []).map(tab => ({
      localId: tab.id,
      name: tab.name,
      status: 'open',
      items: (tab.items || []).map(item => ({
        menuItemId: item._id || null,
        name: item.name,
        category: item.category,
        basePrice: item.basePrice || item.price || 0,
        modifier: item.modifier || null,
        modifierPriceAdjustment: item.modifierPriceAdjustment || 0,
        finalPrice: item.price || 0,
        addedAt: item.addedAt ? new Date(item.addedAt) : new Date(),
        quantity: item.quantity || 1
      })),
      subtotal: (tab.items || []).reduce((sum, item) => sum + (item.price || 0), 0),
      itemCount: (tab.items || []).length,
      createdAt: tab.createdAt ? new Date(tab.createdAt) : new Date()
    }));

    event.tabs = dbTabs;
    await event.save();

    console.log(`[POS] Synced ${dbTabs.length} tabs to event ${event._id}`);

    res.json({
      message: 'Sync successful',
      tabCount: dbTabs.length,
      totalItems: dbTabs.reduce((sum, tab) => sum + tab.itemCount, 0)
    });
  } catch (error) {
    console.error('[POS] Error syncing event:', error);
    res.status(500).json({ message: 'Failed to sync event', error: error.message });
  }
});

/**
 * @route   PUT /api/pos-events/:id/end
 * @desc    End event and calculate summary
 * @access  Private
 * 
 * This endpoint:
 * 1. Syncs final tab state from local UI
 * 2. Calculates summary aggregations
 * 3. Marks event as ended
 */
router.put('/:id/end', authenticateToken, async (req, res) => {
  try {
    const { tabs } = req.body;
    
    const event = await PosEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (event.status !== 'active') {
      return res.status(400).json({ message: 'Event is not active' });
    }

    // Final sync of tabs
    const dbTabs = (tabs || []).map(tab => ({
      localId: tab.id,
      name: tab.name,
      status: 'closed',
      items: (tab.items || []).map(item => ({
        menuItemId: item._id || null,
        name: item.name,
        category: item.category,
        basePrice: item.basePrice || item.price || 0,
        modifier: item.modifier || null,
        modifierPriceAdjustment: item.modifierPriceAdjustment || 0,
        finalPrice: item.price || 0,
        addedAt: item.addedAt ? new Date(item.addedAt) : new Date(),
        quantity: item.quantity || 1
      })),
      subtotal: (tab.items || []).reduce((sum, item) => sum + (item.price || 0), 0),
      itemCount: (tab.items || []).length,
      createdAt: tab.createdAt ? new Date(tab.createdAt) : new Date(),
      closedAt: new Date()
    }));

    event.tabs = dbTabs;
    event.status = 'ended';
    event.endedAt = new Date();

    // Calculate summary
    event.calculateSummary();

    await event.save();

    console.log(`[POS] Ended event ${event._id}: ${event.summary.totalItems} items, $${event.summary.totalRevenue.toFixed(2)} revenue`);

    res.json({
      message: 'Event ended successfully',
      event: event.toObject()
    });
  } catch (error) {
    console.error('[POS] Error ending event:', error);
    res.status(500).json({ message: 'Failed to end event', error: error.message });
  }
});

/**
 * @route   DELETE /api/pos-events/:id
 * @desc    Delete an event
 * @access  Private
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const event = await PosEvent.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    await PosEvent.findByIdAndDelete(req.params.id);
    console.log(`[POS] Deleted event ${req.params.id}`);

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('[POS] Error deleting event:', error);
    res.status(500).json({ message: 'Failed to delete event', error: error.message });
  }
});

/**
 * @route   GET /api/pos-events/:id/summary
 * @desc    Get event summary/analytics
 * @access  Private
 */
router.get('/:id/summary', authenticateToken, async (req, res) => {
  try {
    const event = await PosEvent.findById(req.params.id).lean();
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // If summary not calculated yet, calculate it now
    if (!event.summary || !event.summary.totalItems) {
      const eventDoc = await PosEvent.findById(req.params.id);
      eventDoc.calculateSummary();
      await eventDoc.save();
      return res.json(eventDoc.summary);
    }

    res.json(event.summary);
  } catch (error) {
    console.error('[POS] Error getting event summary:', error);
    res.status(500).json({ message: 'Failed to get event summary', error: error.message });
  }
});

module.exports = router;
