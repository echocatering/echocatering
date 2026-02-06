const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Initialize Stripe (you'll need to add your Stripe secret key to .env)
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * @route   POST /api/stripe/connection-token
 * @desc    Create a connection token for Stripe Terminal
 * @access  Public
 */
router.post('/connection-token', async (req, res) => {
  try {
    console.log('[Stripe Terminal] Creating connection token');
    
    const connectionToken = await stripe.terminal.connectionTokens.create();
    
    res.json({ 
      secret: connectionToken.secret 
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
    const { amount, currency = 'usd', metadata = {} } = req.body;
    
    console.log(`[Stripe Terminal] Creating payment intent: ${amount} ${currency}`);
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: currency,
      payment_method_types: ['card_present'],
      capture_method: 'manual', // Required for Terminal
      metadata: {
        source: 'echo_catering_pos',
        ...metadata
      },
      application_fee_amount: 0, // No application fee
    });
    
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
 * @desc    Capture a payment after successful authorization
 * @access  Public
 */
router.post('/capture-payment', async (req, res) => {
  try {
    const { payment_intent_id, amount_to_capture } = req.body;
    
    console.log(`[Stripe Terminal] Capturing payment: ${payment_intent_id}`);
    
    const paymentIntent = await stripe.paymentIntents.capture(payment_intent_id, {
      amount_to_capture: amount_to_capture
    });
    
    res.json({
      status: paymentIntent.status,
      charge_id: paymentIntent.charges.data[0]?.id,
      receipt_url: paymentIntent.charges.data[0]?.receipt_url
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
    
    console.log(`[Stripe Terminal] Registering reader: ${label}`);
    
    const reader = await stripe.terminal.readers.create({
      label: label,
      registration_code: registration_code
    });
    
    res.json({
      reader_id: reader.id,
      label: reader.label,
      status: reader.status
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

module.exports = router;
