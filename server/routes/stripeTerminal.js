const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Sale = require('../models/Sale');

// Initialize Stripe (you'll need to add your Stripe secret key to .env)
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Get location ID from environment or use default
const getLocationId = () => process.env.STRIPE_LOCATION_ID || null;

/**
 * @route   POST /api/stripe/connection-token
 * @desc    Create a connection token for Stripe Terminal
 * @access  Public
 */
router.post('/connection-token', async (req, res) => {
  try {
    console.log('[Stripe Terminal] Creating connection token');
    
    const locationId = getLocationId();
    const params = locationId ? { location: locationId } : {};
    
    const connectionToken = await stripe.terminal.connectionTokens.create(params);
    
    res.json({ 
      secret: connectionToken.secret,
      location: locationId
    });
    
    console.log('[Stripe Terminal] Connection token created successfully');
  } catch (error) {
    console.error('[Stripe Terminal] Error creating connection token:', error);
    res.status(500).json({ 
      error: 'Failed to create connection token',
      message: error.message 
    });
  }
});

/**
 * @route   POST /api/stripe/payment-intent
 * @desc    Create a payment intent for Stripe Terminal
 * @access  Public
 */
router.post('/payment-intent', async (req, res) => {
  try {
    const { 
      amount, 
      currency = 'usd', 
      metadata = {},
      tabId,
      tabName,
      eventId,
      eventName,
      items = [],
      tipAmount = 0
    } = req.body;
    
    console.log(`[Stripe Terminal] Creating payment intent: ${amount} ${currency}`);
    
    // Build metadata with all relevant info for later retrieval
    const fullMetadata = {
      source: 'echo_catering_pos',
      tabId: tabId || '',
      tabName: tabName || '',
      eventId: eventId || '',
      eventName: eventName || '',
      tipAmount: String(tipAmount || 0),
      itemCount: String(items.length),
      ...metadata
    };
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: currency,
      payment_method_types: ['card_present'],
      capture_method: 'automatic', // Auto-capture for simpler flow
      metadata: fullMetadata
    });
    
    // Create a pending sale record
    try {
      const subtotalCents = amount - (tipAmount || 0);
      await Sale.create({
        stripePaymentIntentId: paymentIntent.id,
        eventId: eventId || null,
        eventName: eventName || null,
        tabId: tabId || null,
        tabName: tabName || null,
        items: items.map(item => ({
          name: item.name,
          category: item.category || 'uncategorized',
          quantity: item.quantity || 1,
          unitPrice: item.price || 0,
          modifier: item.modifier || null,
          modifierPriceAdjustment: item.modifierPriceAdjustment || 0
        })),
        subtotalCents: subtotalCents,
        tipCents: tipAmount || 0,
        totalCents: amount,
        currency: currency,
        status: 'pending'
      });
      console.log(`[Stripe Terminal] Created pending sale for PI: ${paymentIntent.id}`);
    } catch (saleError) {
      console.error('[Stripe Terminal] Error creating sale record:', saleError);
      // Don't fail the payment intent creation if sale recording fails
    }
    
    res.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id
    });
    
    console.log(`[Stripe Terminal] Payment intent created: ${paymentIntent.id}`);
  } catch (error) {
    console.error('[Stripe Terminal] Error creating payment intent:', error);
    res.status(500).json({ 
      error: 'Failed to create payment intent',
      message: error.message 
    });
  }
});

/**
 * @route   POST /api/stripe/capture-payment
 * @desc    Capture a payment after successful authorization (for manual capture mode)
 * @access  Public
 */
router.post('/capture-payment', async (req, res) => {
  try {
    const { payment_intent_id, amount_to_capture } = req.body;
    
    console.log(`[Stripe Terminal] Capturing payment: ${payment_intent_id}`);
    
    const paymentIntent = await stripe.paymentIntents.capture(payment_intent_id, {
      amount_to_capture: amount_to_capture
    });
    
    const charge = paymentIntent.latest_charge 
      ? await stripe.charges.retrieve(paymentIntent.latest_charge)
      : null;
    
    // Update sale record
    try {
      await Sale.findOneAndUpdate(
        { stripePaymentIntentId: payment_intent_id },
        {
          status: 'succeeded',
          stripeChargeId: charge?.id || null,
          receiptUrl: charge?.receipt_url || null,
          cardBrand: charge?.payment_method_details?.card_present?.brand || null,
          cardLast4: charge?.payment_method_details?.card_present?.last4 || null,
          completedAt: new Date()
        }
      );
      console.log(`[Stripe Terminal] Updated sale record for PI: ${payment_intent_id}`);
    } catch (saleError) {
      console.error('[Stripe Terminal] Error updating sale record:', saleError);
    }
    
    res.json({
      status: paymentIntent.status,
      charge_id: charge?.id,
      receipt_url: charge?.receipt_url
    });
    
    console.log(`[Stripe Terminal] Payment captured: ${paymentIntent.id}`);
  } catch (error) {
    console.error('[Stripe Terminal] Error capturing payment:', error);
    res.status(500).json({ 
      error: 'Failed to capture payment',
      message: error.message 
    });
  }
});

/**
 * @route   POST /api/stripe/confirm-payment
 * @desc    Confirm payment succeeded and update sale record (called by Android app)
 * @access  Public
 */
router.post('/confirm-payment', async (req, res) => {
  try {
    const { payment_intent_id } = req.body;
    
    console.log(`[Stripe Terminal] Confirming payment: ${payment_intent_id}`);
    
    // Retrieve the payment intent to get charge details
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id, {
      expand: ['latest_charge']
    });
    
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        error: 'Payment not succeeded',
        status: paymentIntent.status
      });
    }
    
    const charge = paymentIntent.latest_charge;
    
    // Update sale record with payment details
    const sale = await Sale.findOneAndUpdate(
      { stripePaymentIntentId: payment_intent_id },
      {
        status: 'succeeded',
        stripeChargeId: charge?.id || null,
        receiptUrl: charge?.receipt_url || null,
        cardBrand: charge?.payment_method_details?.card_present?.brand || null,
        cardLast4: charge?.payment_method_details?.card_present?.last4 || null,
        readerId: charge?.payment_method_details?.card_present?.reader || null,
        completedAt: new Date()
      },
      { new: true }
    );
    
    res.json({
      success: true,
      status: paymentIntent.status,
      charge_id: charge?.id,
      receipt_url: charge?.receipt_url,
      sale_id: sale?._id
    });
    
    console.log(`[Stripe Terminal] Payment confirmed: ${payment_intent_id}`);
  } catch (error) {
    console.error('[Stripe Terminal] Error confirming payment:', error);
    res.status(500).json({ 
      error: 'Failed to confirm payment',
      message: error.message 
    });
  }
});

/**
 * @route   POST /api/stripe/cancel-payment
 * @desc    Cancel a payment intent
 * @access  Public
 */
router.post('/cancel-payment', async (req, res) => {
  try {
    const { payment_intent_id } = req.body;
    
    console.log(`[Stripe Terminal] Canceling payment: ${payment_intent_id}`);
    
    const paymentIntent = await stripe.paymentIntents.cancel(payment_intent_id);
    
    // Update sale record
    await Sale.findOneAndUpdate(
      { stripePaymentIntentId: payment_intent_id },
      { status: 'failed' }
    );
    
    res.json({
      success: true,
      status: paymentIntent.status
    });
    
    console.log(`[Stripe Terminal] Payment canceled: ${payment_intent_id}`);
  } catch (error) {
    console.error('[Stripe Terminal] Error canceling payment:', error);
    res.status(500).json({ 
      error: 'Failed to cancel payment',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/stripe/readers
 * @desc    List available Stripe Terminal readers
 * @access  Public
 */
router.get('/readers', async (req, res) => {
  try {
    console.log('[Stripe Terminal] Fetching readers');
    
    const readers = await stripe.terminal.readers.list({
      limit: 10
    });
    
    res.json({
      readers: readers.data
    });
    
    console.log(`[Stripe Terminal] Found ${readers.data.length} readers`);
  } catch (error) {
    console.error('[Stripe Terminal] Error fetching readers:', error);
    res.status(500).json({ 
      error: 'Failed to fetch readers',
      message: error.message 
    });
  }
});

/**
 * @route   POST /api/stripe/register-reader
 * @desc    Register a new reader (for setup)
 * @access  Public
 */
router.post('/register-reader', async (req, res) => {
  try {
    const { label, registration_code } = req.body;
    const locationId = getLocationId();
    
    if (!locationId) {
      return res.status(400).json({
        error: 'Location not configured',
        message: 'STRIPE_LOCATION_ID must be set in environment variables'
      });
    }
    
    console.log(`[Stripe Terminal] Registering reader: ${label} at location: ${locationId}`);
    
    const reader = await stripe.terminal.readers.create({
      label: label,
      registration_code: registration_code,
      location: locationId
    });
    
    res.json({
      reader_id: reader.id,
      label: reader.label,
      status: reader.status,
      location: reader.location
    });
    
    console.log(`[Stripe Terminal] Reader registered: ${reader.id}`);
  } catch (error) {
    console.error('[Stripe Terminal] Error registering reader:', error);
    res.status(500).json({ 
      error: 'Failed to register reader',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/stripe/locations
 * @desc    List all Stripe Terminal locations (for debugging)
 * @access  Public
 */
router.get('/locations', async (req, res) => {
  try {
    const locations = await stripe.terminal.locations.list({ limit: 10 });
    
    res.json({
      count: locations.data.length,
      configured_id: getLocationId(),
      locations: locations.data.map(loc => ({
        id: loc.id,
        display_name: loc.display_name,
        address: loc.address
      }))
    });
  } catch (error) {
    console.error('[Stripe Terminal] Error listing locations:', error);
    res.status(500).json({ 
      error: 'Failed to list locations',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/stripe/location
 * @desc    Get configured location info
 * @access  Public
 */
router.get('/location', async (req, res) => {
  try {
    const locationId = getLocationId();
    
    if (!locationId) {
      return res.json({
        configured: false,
        message: 'No location configured. Set STRIPE_LOCATION_ID in environment.'
      });
    }
    
    const location = await stripe.terminal.locations.retrieve(locationId);
    
    res.json({
      configured: true,
      location_id: location.id,
      display_name: location.display_name,
      address: location.address
    });
  } catch (error) {
    console.error('[Stripe Terminal] Error fetching location:', error);
    res.status(500).json({ 
      error: 'Failed to fetch location',
      message: error.message 
    });
  }
});

/**
 * @route   POST /api/stripe/refund
 * @desc    Refund a payment
 * @access  Public
 */
router.post('/refund', async (req, res) => {
  try {
    const { payment_intent_id, amount, reason } = req.body;
    
    console.log(`[Stripe Terminal] Refunding payment: ${payment_intent_id}, amount: ${amount || 'full'}`);
    
    const refundParams = {
      payment_intent: payment_intent_id
    };
    
    if (amount) {
      refundParams.amount = amount;
    }
    
    if (reason) {
      refundParams.reason = reason;
    }
    
    const refund = await stripe.refunds.create(refundParams);
    
    // Update sale record
    const sale = await Sale.findOne({ stripePaymentIntentId: payment_intent_id });
    if (sale) {
      const newRefundedCents = sale.refundedCents + refund.amount;
      const newStatus = newRefundedCents >= sale.totalCents ? 'refunded' : 'partially_refunded';
      
      await Sale.findOneAndUpdate(
        { stripePaymentIntentId: payment_intent_id },
        {
          status: newStatus,
          refundedCents: newRefundedCents,
          refundReason: reason || null
        }
      );
    }
    
    res.json({
      success: true,
      refund_id: refund.id,
      amount: refund.amount,
      status: refund.status
    });
    
    console.log(`[Stripe Terminal] Refund created: ${refund.id}`);
  } catch (error) {
    console.error('[Stripe Terminal] Error creating refund:', error);
    res.status(500).json({ 
      error: 'Failed to create refund',
      message: error.message 
    });
  }
});

module.exports = router;
