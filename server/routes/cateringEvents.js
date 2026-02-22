const express = require('express');
const router = express.Router();
const CateringEvent = require('../models/CateringEvent');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

/**
 * GET /api/catering-events
 * List all catering events, sorted by date desc
 */
router.get('/', async (req, res) => {
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
router.get('/:id', async (req, res) => {
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
router.post('/', async (req, res) => {
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
router.put('/:id', async (req, res) => {
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
router.delete('/:id', async (req, res) => {
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
router.post('/:id/recalculate', async (req, res) => {
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

module.exports = router;
