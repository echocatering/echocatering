const express = require('express');
const crypto = require('crypto');

const router = express.Router();

// Store for tracking pending checkouts (checkout_id -> checkout data)
// In production, this should be Redis or database-backed
const pendingCheckouts = new Map();

// WebSocket clients reference - will be set by server/index.js
let posClients = null;

/**
 * Set the WebSocket clients reference for broadcasting
 * Called from server/index.js after WebSocket server is created
 */
function setPosClients(clients) {
  posClients = clients;
}

/**
 * Broadcast payment status to all connected POS clients
 */
function broadcastPaymentStatus(checkoutId, status, data = {}) {
  if (!posClients) {
    console.warn('[Square Webhook] No WebSocket clients reference set');
    return;
  }
  
  const message = JSON.stringify({
    type: 'payment_status',
    checkoutId,
    status, // 'payment_success', 'payment_canceled', 'payment_failed'
    ...data,
    timestamp: new Date().toISOString()
  });
  
  let broadcastCount = 0;
  posClients.forEach((client) => {
    if (client.readyState === 1) { // 1 = OPEN
      client.send(message);
      broadcastCount++;
    }
  });
  
  console.log(`[Square Webhook] Broadcast payment_status (${status}) to ${broadcastCount} clients for checkout ${checkoutId}`);
}

/**
 * Register a pending checkout
 * Called when the frontend initiates a Square POS checkout
 */
function registerCheckout(checkoutId, checkoutData) {
  pendingCheckouts.set(checkoutId, {
    ...checkoutData,
    status: 'pending',
    createdAt: new Date().toISOString()
  });
  console.log(`[Square Webhook] Registered checkout: ${checkoutId}`);
  
  // Auto-expire after 10 minutes
  setTimeout(() => {
    if (pendingCheckouts.has(checkoutId)) {
      const checkout = pendingCheckouts.get(checkoutId);
      if (checkout.status === 'pending') {
        pendingCheckouts.delete(checkoutId);
        console.log(`[Square Webhook] Expired checkout: ${checkoutId}`);
        broadcastPaymentStatus(checkoutId, 'payment_expired', {
          message: 'Checkout expired after 10 minutes'
        });
      }
    }
  }, 10 * 60 * 1000);
}

/**
 * Get checkout status
 */
function getCheckoutStatus(checkoutId) {
  return pendingCheckouts.get(checkoutId) || null;
}

/**
 * @route   POST /api/square-webhook/register
 * @desc    Register a new checkout before launching Square POS
 * @access  Private (should be authenticated in production)
 */
router.post('/register', (req, res) => {
  try {
    const { checkoutId, tabId, tabName, totalCents, items } = req.body;
    
    if (!checkoutId) {
      return res.status(400).json({ success: false, message: 'checkoutId is required' });
    }
    
    registerCheckout(checkoutId, {
      tabId,
      tabName,
      totalCents,
      items,
      itemCount: items?.length || 0
    });
    
    res.json({ success: true, checkoutId });
  } catch (error) {
    console.error('[Square Webhook] Register error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/square-webhook/status/:checkoutId
 * @desc    Get the status of a checkout (for polling fallback)
 * @access  Private
 */
router.get('/status/:checkoutId', (req, res) => {
  const { checkoutId } = req.params;
  const checkout = getCheckoutStatus(checkoutId);
  
  if (!checkout) {
    return res.status(404).json({ success: false, message: 'Checkout not found' });
  }
  
  res.json({ success: true, checkout });
});

/**
 * @route   POST /api/square-webhook/simulate
 * @desc    Simulate a payment completion (for testing without real Square webhook)
 * @access  Private (development only)
 */
router.post('/simulate', (req, res) => {
  try {
    const { checkoutId, status, transactionId } = req.body;
    
    if (!checkoutId || !status) {
      return res.status(400).json({ success: false, message: 'checkoutId and status are required' });
    }
    
    const checkout = pendingCheckouts.get(checkoutId);
    if (checkout) {
      checkout.status = status;
      checkout.transactionId = transactionId;
      checkout.completedAt = new Date().toISOString();
    }
    
    // Broadcast to all connected clients
    broadcastPaymentStatus(checkoutId, status, {
      transactionId,
      tabId: checkout?.tabId,
      tabName: checkout?.tabName,
      totalCents: checkout?.totalCents
    });
    
    res.json({ success: true, message: `Simulated ${status} for checkout ${checkoutId}` });
  } catch (error) {
    console.error('[Square Webhook] Simulate error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Verify Square webhook signature
 * Square signs webhooks with HMAC-SHA256
 */
function verifySquareSignature(body, signature, webhookSignatureKey) {
  if (!webhookSignatureKey) {
    console.warn('[Square Webhook] No SQUARE_WEBHOOK_SIGNATURE_KEY configured, skipping verification');
    return true; // Allow in development
  }
  
  const hmac = crypto.createHmac('sha256', webhookSignatureKey);
  hmac.update(body);
  const expectedSignature = hmac.digest('base64');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature || ''),
    Buffer.from(expectedSignature)
  );
}

/**
 * @route   POST /api/square-webhook
 * @desc    Receive Square webhook events (payment.completed, payment.canceled, etc.)
 * @access  Public (verified by signature)
 * 
 * Square webhook events:
 * - payment.completed: Payment was successful
 * - payment.canceled: Payment was canceled
 * - payment.failed: Payment failed
 * - order.updated: Order status changed
 */
router.post('/', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const signature = req.headers['x-square-hmacsha256-signature'];
    const webhookSignatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    
    // Get raw body for signature verification
    const rawBody = req.body.toString();
    
    // Verify signature in production
    if (process.env.NODE_ENV === 'production' && webhookSignatureKey) {
      if (!verifySquareSignature(rawBody, signature, webhookSignatureKey)) {
        console.error('[Square Webhook] Invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }
    
    // Parse the webhook payload
    const event = JSON.parse(rawBody);
    const eventType = event.type;
    const eventData = event.data?.object || {};
    
    console.log(`[Square Webhook] Received event: ${eventType}`);
    console.log(`[Square Webhook] Event data:`, JSON.stringify(eventData, null, 2));
    
    // Extract checkout_id from the payment/order metadata
    // We embed checkout_id in the REQUEST_METADATA when launching Square POS
    let checkoutId = null;
    let transactionId = null;
    
    if (eventData.payment) {
      transactionId = eventData.payment.id;
      // Try to get checkout_id from order metadata
      const orderId = eventData.payment.order_id;
      // Note: We may need to fetch the order to get metadata
      // For now, try to extract from reference_id
      const referenceId = eventData.payment.reference_id || '';
      if (referenceId.startsWith('ECHO-')) {
        checkoutId = referenceId.replace('ECHO-', '');
      }
    }
    
    if (eventData.order) {
      // Check order metadata for checkout_id
      const metadata = eventData.order.metadata || {};
      checkoutId = metadata.checkoutId || checkoutId;
      transactionId = transactionId || eventData.order.id;
    }
    
    // Map Square event types to our status
    let status = null;
    switch (eventType) {
      case 'payment.completed':
        status = 'payment_success';
        break;
      case 'payment.canceled':
        status = 'payment_canceled';
        break;
      case 'payment.failed':
        status = 'payment_failed';
        break;
      case 'order.updated':
        // Check order state
        const orderState = eventData.order?.state;
        if (orderState === 'COMPLETED') {
          status = 'payment_success';
        } else if (orderState === 'CANCELED') {
          status = 'payment_canceled';
        }
        break;
      default:
        console.log(`[Square Webhook] Ignoring event type: ${eventType}`);
    }
    
    // If we have a status and checkout_id, broadcast it
    if (status && checkoutId) {
      const checkout = pendingCheckouts.get(checkoutId);
      if (checkout) {
        checkout.status = status;
        checkout.transactionId = transactionId;
        checkout.completedAt = new Date().toISOString();
      }
      
      broadcastPaymentStatus(checkoutId, status, {
        transactionId,
        tabId: checkout?.tabId,
        tabName: checkout?.tabName,
        totalCents: checkout?.totalCents,
        eventType
      });
    } else if (status) {
      // Broadcast even without checkout_id (client can match by other means)
      broadcastPaymentStatus('unknown', status, {
        transactionId,
        eventType,
        message: 'Payment event received but checkout_id not found'
      });
    }
    
    // Always respond 200 to Square
    res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('[Square Webhook] Error processing webhook:', error);
    // Still respond 200 to prevent Square from retrying
    res.status(200).json({ received: true, error: error.message });
  }
});

module.exports = router;
module.exports.setPosClients = setPosClients;
module.exports.registerCheckout = registerCheckout;
module.exports.getCheckoutStatus = getCheckoutStatus;
module.exports.broadcastPaymentStatus = broadcastPaymentStatus;
