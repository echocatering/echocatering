const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { initSquareClient } = require('../squareClient');
const crypto = require('crypto');

const router = express.Router();

// All Square routes require authentication
router.use(authenticateToken);

/**
 * @route   POST /api/square/create-order-test
 * @desc    Create a Square order for POS checkout with TEST_MODE support
 * @access  Private
 * 
 * When TEST_MODE is true:
 * - All item prices are overridden to $0.01 (1 cent)
 * - Order metadata includes "TEST MODE" label
 * - Safe for testing without charging real money
 * 
 * When TEST_MODE is false:
 * - Real prices are used
 * - Production checkout
 */
router.post('/create-order-test', async (req, res) => {
  try {
    const { tabId, tabName, items, total, testMode = true } = req.body;

    // Validate required fields
    if (!tabId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: tabId and items array' 
      });
    }

    // Get Square client
    const squareClient = await initSquareClient();
    const locationId = process.env.SQUARE_LOCATION_ID;

    if (!locationId) {
      return res.status(500).json({ 
        success: false, 
        message: 'Square location ID not configured' 
      });
    }

    // Generate unique idempotency key
    const idempotencyKey = crypto.randomUUID();

    // ============================================
    // TEST MODE: Override all prices to $0.01
    // ============================================
    const lineItems = items.map((item, index) => {
      // In TEST_MODE, all items are $0.01 (1 cent = 1 in smallest currency unit)
      // In production mode, use actual price (convert dollars to cents)
      const priceInCents = testMode 
        ? 1  // $0.01 for test mode
        : Math.round((parseFloat(item.price) || 0) * 100);

      // Build item name with modifier if present
      const itemName = item.modifier 
        ? `${item.name} (${item.modifier})`
        : item.name;

      return {
        name: testMode ? `[TEST] ${itemName}` : itemName,
        quantity: String(item.quantity || 1),
        basePriceMoney: {
          amount: BigInt(priceInCents),
          currency: 'USD'
        },
        note: item.category || undefined
      };
    });

    // Calculate total for metadata
    const orderTotal = testMode 
      ? items.length  // $0.01 per item in test mode
      : Math.round((parseFloat(total) || 0) * 100);

    // ============================================
    // Create Square Order
    // ============================================
    const orderRequest = {
      order: {
        locationId: locationId,
        lineItems: lineItems,
        metadata: {
          source: 'echo-pos',
          tabId: String(tabId),
          tabName: String(tabName || 'Tab'),
          testMode: String(testMode),
          ...(testMode && { warning: 'TEST_MODE_ORDER_DO_NOT_FULFILL' })
        }
      },
      idempotencyKey: idempotencyKey
    };

    console.log(`[Square] Creating order for tab ${tabId} (${tabName}), testMode: ${testMode}`);
    console.log(`[Square] Line items:`, lineItems.map(li => ({ name: li.name, qty: li.quantity, price: li.basePriceMoney.amount.toString() })));
    console.log(`[Square] Full order request:`, JSON.stringify(orderRequest, null, 2));

    // Square SDK v44+ uses squareClient.orders.create() not createOrder()
    const result = await squareClient.orders.create(orderRequest);

    if (!result || !result.order) {
      throw new Error('Failed to create Square order - no order returned');
    }

    const orderId = result.order.id;
    console.log(`[Square] Order created successfully: ${orderId}`);

    // ============================================
    // Return order details for deep-link
    // ============================================
    res.json({
      success: true,
      orderId: orderId,
      locationId: locationId,
      testMode: testMode,
      totalCents: orderTotal,
      message: testMode 
        ? 'TEST MODE: Order created with $0.01 prices' 
        : 'Order created successfully'
    });

  } catch (error) {
    console.error('[Square] Create order error:', error);
    
    // Handle Square API errors
    if (error.errors) {
      const squareErrors = error.errors.map(e => e.detail || e.code).join(', ');
      return res.status(400).json({ 
        success: false, 
        message: `Square API error: ${squareErrors}` 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to create Square order' 
    });
  }
});

/**
 * @route   GET /api/square/location
 * @desc    Get configured Square location ID
 * @access  Private
 */
router.get('/location', async (req, res) => {
  try {
    const locationId = process.env.SQUARE_LOCATION_ID;
    
    if (!locationId) {
      return res.status(500).json({ 
        success: false, 
        message: 'Square location ID not configured' 
      });
    }

    res.json({
      success: true,
      locationId: locationId
    });
  } catch (error) {
    console.error('[Square] Get location error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get Square location' 
    });
  }
});

module.exports = router;
