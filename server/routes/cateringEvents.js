const express = require('express');
const router = express.Router();
const CateringEvent = require('../models/CateringEvent');
const PosEvent = require('../models/PosEvent');
const { authenticateToken } = require('../middleware/auth');

/**
 * GET /api/catering-events
 * List all catering events, sorted by date desc
 * Populates sales data from linked POS events
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

    // Populate sales data from linked POS events
    const eventsWithSales = await Promise.all(events.map(async (event) => {
      // Always look up POS event if linked - needed for cashTotal/creditTotal/invoiceTotal/cogsCost
      if (event.posEventId) {
        try {
          const posEvent = await PosEvent.findById(event.posEventId).lean();
          if (posEvent) {
            // Calculate sales from POS event tabs
            let totalSales = 0;
            let totalTips = 0;
            let cashTotal = 0;
            let creditTotal = 0;
            let invoiceTotal = 0;
            
            if (posEvent.summary && posEvent.summary.totalRevenue) {
              totalSales = posEvent.summary.totalRevenue;
              totalTips = posEvent.summary.totalTips || 0;
            } else if (posEvent.tabs && posEvent.tabs.length > 0) {
              posEvent.tabs.forEach(tab => {
                if ((tab.status === 'paid' || tab.status === 'archived') && !tab.isSpillage) {
                  const tabTotal = (tab.items || []).reduce((sum, item) => {
                    const itemPrice = parseFloat(item.price) || 0;
                    const modifierPrice = (item.modifiers || []).reduce((mSum, m) => mSum + (parseFloat(m.price) || 0), 0);
                    return sum + itemPrice + modifierPrice;
                  }, 0);
                  
                  totalSales += tabTotal;
                  totalTips += tab.tipAmount || 0;
                  
                  // Track by payment method
                  const paymentMethod = tab.paymentMethod || 'credit';
                  if (paymentMethod === 'cash') {
                    cashTotal += tabTotal + (tab.tipAmount || 0);
                  } else if (paymentMethod === 'invoice') {
                    invoiceTotal += tabTotal;
                  } else {
                    creditTotal += tabTotal + (tab.tipAmount || 0);
                  }
                }
              });
            }
            
            // Calculate COGS from spillage tabs
            let cogsCost = 0;
            if (posEvent.tabs && posEvent.tabs.length > 0) {
              posEvent.tabs.forEach(tab => {
                if (tab.isSpillage) {
                  const spillageTotal = (tab.items || []).reduce((sum, item) => {
                    return sum + (parseFloat(item.price) || 0);
                  }, 0);
                  cogsCost += spillageTotal;
                }
              });
            }
            
            // Build drinkSales from POS tabs if event doesn't have it (needed for graph)
            let drinkSales = event.drinkSales || [];
            if ((!drinkSales || drinkSales.length === 0) && posEvent.tabs && posEvent.tabs.length > 0) {
              const itemMap = {};
              posEvent.tabs.forEach(tab => {
                if ((tab.status === 'paid' || tab.status === 'archived') && !tab.isSpillage) {
                  (tab.items || []).forEach(item => {
                    const key = item.name || 'Unknown';
                    if (!itemMap[key]) {
                      itemMap[key] = { name: key, category: item.category || 'other', quantity: 0, revenue: 0 };
                    }
                    itemMap[key].quantity += 1;
                    itemMap[key].revenue += parseFloat(item.price) || 0;
                  });
                }
              });
              drinkSales = Object.values(itemMap);
            }
            
            return {
              ...event,
              totalSales: event.totalSales || totalSales,
              totalTips: event.totalTips || totalTips,
              cashTotal,
              creditTotal,
              invoiceTotal,
              cogsCost: event.cogsCost || cogsCost,
              drinkSales: drinkSales.length > 0 ? drinkSales : event.drinkSales,
            };
          }
        } catch (err) {
          console.error(`[CateringEvents] Error fetching POS event ${event.posEventId}:`, err);
        }
      }
      
      return event;
    }));

    res.json({ events: eventsWithSales, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
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
 * POST /api/catering-events/:id/autosave
 * Auto-save POS state with rolling backup (keeps last 5 saves)
 */
router.post('/:id/autosave', authenticateToken, async (req, res) => {
  try {
    const { tabs, eventSetupData, uiState, reason } = req.body;
    
    const event = await CateringEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    
    // Initialize posSaves array if it doesn't exist
    if (!event.posSaves) {
      event.posSaves = [];
    }
    
    // Create new save entry
    const newSave = {
      saveNumber: event.nextSaveNumber || 1,
      tabs: tabs || [],
      eventSetupData: eventSetupData || {},
      uiState: uiState || {},
      savedAt: new Date(),
      reason: reason || 'auto'
    };
    
    // Add to saves array
    event.posSaves.push(newSave);
    
    // Keep only the last 5 saves (rolling backup)
    if (event.posSaves.length > 5) {
      event.posSaves = event.posSaves.slice(-5);
    }
    
    // Increment save number for next save
    event.nextSaveNumber = (event.nextSaveNumber || 1) + 1;
    
    await event.save();
    
    console.log(`[CateringEvents] Auto-saved POS state #${newSave.saveNumber} for event ${req.params.id} (${reason || 'auto'})`);
    res.json({ 
      success: true, 
      saveNumber: newSave.saveNumber,
      savedAt: newSave.savedAt,
      totalSaves: event.posSaves.length
    });
  } catch (err) {
    console.error('[CateringEvents] POST /:id/autosave error:', err);
    res.status(500).json({ error: 'Failed to auto-save', message: err.message });
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
      guestCount: parseInt(setupData.numberOfPatrons) || 0,
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
    
    // Calculate payment method totals and item data from tabs
    if (tabs && Array.isArray(tabs)) {
      let cashTotal = 0;
      let creditTotal = 0;
      let invoiceTotal = 0;
      const itemDataParts = [];
      
      for (const tab of tabs) {
        if (tab.status === 'archived' || tab.status === 'paid') {
          // Calculate tab total from items
          const tabTotal = (tab.items || []).reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);
          const tipAmount = parseFloat(tab.tipAmount) || 0;
          const totalWithTip = tabTotal + tipAmount;
          
          // Add to appropriate payment method total
          const paymentMethod = tab.paymentMethod || 'credit';
          if (paymentMethod === 'cash') {
            cashTotal += totalWithTip;
          } else if (paymentMethod === 'invoice') {
            invoiceTotal += totalWithTip;
          } else {
            creditTotal += totalWithTip;
          }
          
          // Collect item data with timestamps and payment method
          // Format: "itemName, category, timestamp, paymentMethod, cost"
          for (const item of (tab.items || [])) {
            const itemName = (item.name || 'Unknown').replace(/,/g, ' ').trim();
            const category = (item.category || 'other').toLowerCase();
            const timestamp = item.addedAt || tab.paidAt || new Date().toISOString();
            const timeStr = new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const cost = (parseFloat(item.price) || 0).toFixed(2);
            const txnType = paymentMethod.toUpperCase();
            itemDataParts.push(`${itemName}, ${category}, ${timeStr}, ${txnType}, ${cost}`);
          }
        }
      }
      
      eventData.cashTotal = cashTotal;
      eventData.creditTotal = creditTotal;
      eventData.invoiceTotal = invoiceTotal;
      // Use client-side itemData if provided (includes transaction types), otherwise use server-built data
      eventData.itemData = setupData.itemData || itemDataParts.join('\n');
      
      // Update totalSales to be sum of all payment methods (if not already set from summary)
      if (!summary || !summary.totalRevenue) {
        eventData.totalSales = cashTotal + creditTotal + invoiceTotal;
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
