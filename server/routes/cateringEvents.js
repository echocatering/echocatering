const express = require('express');
const router = express.Router();
const CateringEvent = require('../models/CateringEvent');
const { authenticateToken } = require('../middleware/auth');

/**
 * GET /api/catering-events
 * List all catering events, sorted by date desc
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;
    const query = {};
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [events, total] = await Promise.all([
      CateringEvent.find(query).sort({ date: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      CateringEvent.countDocuments(query)
    ]);

    res.json({ events, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error('[CateringEvents] GET / error:', err);
    res.status(500).json({ error: 'Failed to fetch events', message: err.message });
  }
});

/**
 * GET /api/catering-events/:id
 * Get a single event by ID
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const event = await CateringEvent.findById(req.params.id).lean();
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json({ event });
  } catch (err) {
    console.error('[CateringEvents] GET /:id error:', err);
    res.status(500).json({ error: 'Failed to fetch event', message: err.message });
  }
});

/**
 * POST /api/catering-events
 * Create a new catering event
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const event = new CateringEvent(req.body);
    event.recalculate();
    await event.save();
    res.status(201).json({ event });
  } catch (err) {
    console.error('[CateringEvents] POST / error:', err);
    res.status(400).json({ error: 'Failed to create event', message: err.message });
  }
});

/**
 * PUT /api/catering-events/:id
 * Update a catering event (full replace of provided fields)
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const event = await CateringEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    Object.assign(event, req.body);
    event.recalculate();
    await event.save();
    res.json({ event });
  } catch (err) {
    console.error('[CateringEvents] PUT /:id error:', err);
    res.status(400).json({ error: 'Failed to update event', message: err.message });
  }
});

/**
 * DELETE /api/catering-events/:id
 * Delete a catering event
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const event = await CateringEvent.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    console.error('[CateringEvents] DELETE /:id error:', err);
    res.status(500).json({ error: 'Failed to delete event', message: err.message });
  }
});

/**
 * POST /api/catering-events/:id/recalculate
 * Trigger a recalculation of financials for an event
 */
router.post('/:id/recalculate', authenticateToken, async (req, res) => {
  try {
    const event = await CateringEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    event.recalculate();
    await event.save();
    res.json({ event });
  } catch (err) {
    console.error('[CateringEvents] POST /:id/recalculate error:', err);
    res.status(500).json({ error: 'Failed to recalculate', message: err.message });
  }
});

/**
 * POST /api/catering-events/finalize
 * Finalize an event with setup data and summary from POS
 */
router.post('/finalize', async (req, res) => {
  try {
    const { eventId, setupData, summary, tabs, spillageData, cogsData } = req.body;
    
    // Calculate duration in hours from start/end time
    let durationHours = 0;
    if (setupData.startTime && setupData.endTime) {
      const [startH, startM] = setupData.startTime.split(':').map(Number);
      const [endH, endM] = setupData.endTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      durationHours = Math.max(0, (endMinutes - startMinutes) / 60);
    }
    
    // Calculate labor cost from labor array
    const laborDetails = (setupData.labor || []).map(l => ({
      title: l.title || '',
      rate: parseFloat(l.rate) || 0,
      hours: parseFloat(l.hours) || 0,
      total: (parseFloat(l.rate) || 0) * (parseFloat(l.hours) || 0)
    }));
    const laborCost = laborDetails.reduce((sum, l) => sum + l.total, 0);
    
    // Build the event data from setup and summary
    const eventData = {
      name: setupData.eventName || 'Unnamed Event',
      date: setupData.eventDate ? new Date(setupData.eventDate) : new Date(),
      startTime: setupData.startTime || '',
      endTime: setupData.endTime || '',
      durationHours,
      guestCount: parseInt(setupData.patronCount) || 0,
      accommodationCost: parseFloat(setupData.accommodationCost) || 0,
      travelCost: parseFloat(setupData.transportationCosts) || 0,
      permitCost: parseFloat(setupData.permitCost) || 0,
      insuranceCost: parseFloat(setupData.liabilityInsuranceCost) || 0,
      laborCost,
      laborDetails,
      spillageCost: parseFloat(spillageData?.total) || 0,
      spillageItems: spillageData?.items || [],
      taxesCost: parseFloat(summary?.taxes) || 0,
      cogsCost: parseFloat(cogsData?.total) || 0,
      status: summary ? 'completed' : 'draft',
    };
    
    // Add glassware data
    if (setupData.glasswareSent || setupData.glasswareReturned) {
      eventData.glassware = [];
      const roxSent = parseInt(setupData.glasswareSent?.rox) || 0;
      const roxReturned = parseInt(setupData.glasswareReturned?.rox) || 0;
      if (roxSent > 0 || roxReturned > 0) {
        eventData.glassware.push({
          type: 'ROX',
          sent: roxSent,
          returnedClean: roxReturned,
          returnedDirty: 0,
          broken: Math.max(0, roxSent - roxReturned),
        });
      }
      const tmblSent = parseInt(setupData.glasswareSent?.tmbl) || 0;
      const tmblReturned = parseInt(setupData.glasswareReturned?.tmbl) || 0;
      if (tmblSent > 0 || tmblReturned > 0) {
        eventData.glassware.push({
          type: 'TMBL',
          sent: tmblSent,
          returnedClean: tmblReturned,
          returnedDirty: 0,
          broken: Math.max(0, tmblSent - tmblReturned),
        });
      }
    }
    
    // Add ice data
    const iceSent = parseInt(setupData.iceSent) || 0;
    const iceReturned = parseInt(setupData.iceReturned) || 0;
    if (iceSent > 0 || iceReturned > 0) {
      eventData.iceBlocksBrought = iceSent;
      eventData.iceBlocksReturned = iceReturned;
    }
    
    // Add beverage inventory as bottlesPrepped
    const bottlesPrepped = [];
    const categories = ['cocktails', 'mocktails', 'beer', 'wine'];
    for (const cat of categories) {
      if (setupData.inventory?.[cat]) {
        for (const item of setupData.inventory[cat]) {
          if (item.name) {
            bottlesPrepped.push({
              name: item.name,
              category: cat,
              unitsPrepared: item.sent || 0,
              unitsReturned: item.returned || 0,
              unitsUsed: Math.max(0, (item.sent || 0) - (item.returned || 0)),
            });
          }
        }
      }
    }
    eventData.bottlesPrepped = bottlesPrepped;
    
    // Add summary data if available (post-event finalization)
    if (summary) {
      eventData.totalSales = summary.totalRevenue || 0;
      eventData.totalTips = summary.totalTips || 0;
      eventData.totalRevenue = (summary.totalRevenue || 0) + (summary.totalTips || 0);
      
      // Add drink sales from category breakdown
      if (summary.categoryBreakdown) {
        const breakdown = summary.categoryBreakdown instanceof Map 
          ? Object.fromEntries(summary.categoryBreakdown)
          : summary.categoryBreakdown;
        eventData.drinkSales = Object.entries(breakdown).map(([cat, data]) => ({
          name: cat,
          category: cat.toLowerCase(),
          quantity: data.count || 0,
          unitPrice: data.count > 0 ? (data.revenue || 0) / data.count : 0,
          revenue: data.revenue || 0,
        }));
      }
      
      // Add timeline data
      if (summary.timelineBreakdown) {
        eventData.timeline = summary.timelineBreakdown.map(interval => ({
          intervalStart: new Date(interval.intervalStart),
          intervalEnd: new Date(interval.intervalEnd || interval.intervalStart),
          items: interval.items || [],
        }));
      }
    }
    
    // Link to POS event if we have an eventId
    if (eventId) {
      eventData.posEventId = eventId;
    }
    
    // Check if we're updating an existing event or creating new
    let event;
    if (eventId) {
      // Try to find existing event linked to this POS event
      event = await CateringEvent.findOne({ posEventId: eventId });
    }
    
    if (event) {
      // Update existing
      Object.assign(event, eventData);
      event.recalculate();
      await event.save();
      console.log('[CateringEvents] Updated event:', event._id);
    } else {
      // Create new
      event = new CateringEvent(eventData);
      event.recalculate();
      await event.save();
      console.log('[CateringEvents] Created new event:', event._id);
    }
    
    res.json({ success: true, event });
  } catch (err) {
    console.error('[CateringEvents] POST /finalize error:', err);
    res.status(500).json({ error: 'Failed to finalize event', message: err.message });
  }
});

module.exports = router;
