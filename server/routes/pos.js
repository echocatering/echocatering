const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const Product = require('../models/Product');
const Order = require('../models/Order');

const router = express.Router();

// All POS routes require authentication
router.use(authenticateToken);

// @route   GET /api/pos/products
// @desc    Get all products (active by default)
// @access  Private
router.get('/products', async (req, res) => {
  try {
    const { category, activeOnly = 'true' } = req.query;
    const query = {};
    
    if (activeOnly === 'true') {
      query.isActive = true;
    }
    
    if (category) {
      query.category = category;
    }
    
    const products = await Product.find(query)
      .sort({ category: 1, order: 1, name: 1 })
      .lean();
    
    res.json({ products });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/pos/products/:id
// @desc    Get single product
// @access  Private
router.get('/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    res.json({ product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/pos/products
// @desc    Create new product
// @access  Private
router.post('/products', [
  body('name').trim().isLength({ min: 1, max: 200 }),
  body('price').isFloat({ min: 0 }),
  body('category').trim().isLength({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const product = new Product(req.body);
    await product.save();
    
    res.status(201).json({ product });
  } catch (error) {
    console.error('Create product error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Product with this SKU or barcode already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/pos/products/:id
// @desc    Update product
// @access  Private
router.put('/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    res.json({ product });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/pos/products/:id
// @desc    Delete product (soft delete by setting isActive to false)
// @access  Private
router.delete('/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive: false, updatedAt: Date.now() },
      { new: true }
    );
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    res.json({ message: 'Product deactivated', product });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/pos/categories
// @desc    Get all product categories
// @access  Private
router.get('/categories', async (req, res) => {
  try {
    const categories = await Product.distinct('category', { isActive: true });
    res.json({ categories: categories.sort() });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/pos/orders
// @desc    Get all orders
// @access  Private
router.get('/orders', async (req, res) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;
    const query = {};
    
    if (status) {
      query.status = status;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();
    
    const total = await Order.countDocuments(query);
    
    res.json({ orders, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/pos/orders/:id
// @desc    Get single order
// @access  Private
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.productId', 'name price')
      .lean();
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    res.json({ order });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/pos/orders
// @desc    Create new order
// @access  Private
router.post('/orders', [
  body('items').isArray({ min: 1 }),
  body('items.*.productId').isMongoId(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('items.*.unitPrice').isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { items, customerName, customerEmail, notes, paymentMethod, discount = 0 } = req.body;
    
    // Calculate totals
    let subtotal = 0;
    const orderItems = [];
    
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isActive) {
        return res.status(400).json({ message: `Product ${item.productId} not found or inactive` });
      }
      
      const itemSubtotal = item.unitPrice * item.quantity;
      const itemTax = itemSubtotal * (product.taxRate / 100);
      
      subtotal += itemSubtotal;
      
      orderItems.push({
        productId: product._id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: itemSubtotal,
        tax: itemTax,
        notes: item.notes || ''
      });
    }
    
    const tax = orderItems.reduce((sum, item) => sum + item.tax, 0);
    const total = subtotal + tax - discount;
    
    const order = new Order({
      items: orderItems,
      subtotal,
      tax,
      discount,
      total,
      customerName: customerName || '',
      customerEmail: customerEmail || '',
      notes: notes || '',
      paymentMethod: paymentMethod || 'cash',
      createdBy: req.user.email || req.user.username || 'unknown'
    });
    
    await order.save();
    
    // Update inventory if tracking is enabled
    for (const item of orderItems) {
      const product = await Product.findById(item.productId);
      if (product && product.trackInventory) {
        product.stockQuantity = Math.max(0, product.stockQuantity - item.quantity);
        await product.save();
      }
    }
    
    res.status(201).json({ order });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/pos/orders/:id/complete
// @desc    Complete an order
// @access  Private
router.put('/orders/:id/complete', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    if (order.status === 'completed') {
      return res.status(400).json({ message: 'Order already completed' });
    }
    
    order.status = 'completed';
    order.paymentStatus = 'paid';
    order.completedAt = new Date();
    await order.save();
    
    res.json({ order });
  } catch (error) {
    console.error('Complete order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/pos/orders/:id/cancel
// @desc    Cancel an order
// @access  Private
router.put('/orders/:id/cancel', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    if (order.status === 'completed') {
      return res.status(400).json({ message: 'Cannot cancel completed order' });
    }
    
    order.status = 'cancelled';
    order.paymentStatus = 'refunded';
    order.cancelledAt = new Date();
    await order.save();
    
    // Restore inventory if tracking is enabled
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (product && product.trackInventory) {
        product.stockQuantity += item.quantity;
        await product.save();
      }
    }
    
    res.json({ order });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

