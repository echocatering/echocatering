const express = require('express');
const router = express.Router();
const { Resend } = require('resend');
const twilio = require('twilio');
const puppeteer = require('puppeteer');

// Resend client for email
const resend = new Resend(process.env.RESEND_API_KEY || 're_DBu7uZNQ_N5p2wMrLfW9cG7MJbngMDcmW');

// Twilio client for SMS (configure with your Twilio credentials)
let twilioClient = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
} catch (err) {
  console.log('[Receipts] Twilio client not configured:', err.message);
}

/**
 * Generate receipt HTML
 */
function generateReceiptHTML(data) {
  const { items, subtotal, tip, total, paymentMethod, tabId, cardBrand, cardLast4 } = data;
  
  // Format payment method display
  let paymentDisplay = 'Payment method: Card';
  if (paymentMethod === 'cash') {
    paymentDisplay = 'Payment method: Cash';
  } else if (paymentMethod === 'credit' && cardBrand && cardLast4) {
    // Capitalize card brand (visa -> Visa, mastercard -> Mastercard)
    const brandName = cardBrand.charAt(0).toUpperCase() + cardBrand.slice(1).toLowerCase();
    paymentDisplay = `Payment method: ${brandName} ending in ${cardLast4}`;
  } else if (paymentMethod === 'invoice') {
    paymentDisplay = 'Payment method: Invoice';
  }
  const date = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Helvetica Neue', Arial, sans-serif;
          max-width: 400px;
          margin: 0 auto;
          padding: 20px;
          background: #fff;
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
          padding-bottom: 20px;
          border-bottom: 2px dashed #ddd;
        }
        .logo {
          margin-bottom: 10px;
        }
        .logo img {
          max-width: 150px;
          height: auto;
        }
        .date {
          color: #666;
          font-size: 14px;
        }
        .items {
          margin-bottom: 20px;
        }
        .item {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #eee;
        }
        .item-name {
          color: #333;
        }
        .item-price {
          color: #333;
          font-weight: 500;
        }
        .totals {
          border-top: 2px dashed #ddd;
          padding-top: 15px;
          margin-top: 15px;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          padding: 5px 0;
        }
        .total-row.final {
          font-size: 20px;
          font-weight: bold;
          padding-top: 10px;
          border-top: 1px solid #ddd;
          margin-top: 10px;
        }
        .payment-method {
          text-align: center;
          margin-top: 20px;
          padding: 10px;
          background: #f5f5f5;
          border-radius: 8px;
          color: #666;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #999;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo"><img src="https://echocatering.com/assets/icons/LOGO_echo.png" alt="Echo Catering" /></div>
        <div class="date">${date}</div>
      </div>
      
      <div class="items">
        ${(items || []).map(item => `
          <div class="item">
            <span class="item-name">${item.name}${item.modifiers?.length ? ` (${item.modifiers.map(m => m.name).join(', ')})` : ''}</span>
            <span class="item-price"> — $${(parseFloat(item.price) || 0).toFixed(2)}</span>
          </div>
        `).join('')}
      </div>
      
      <div class="totals">
        <div class="total-row">
          <span>Subtotal</span>
          <span>— $${(subtotal || 0).toFixed(2)}</span>
        </div>
        <div class="total-row">
          <span>Tax (8%)</span>
          <span>— $${((subtotal || 0) * 0.08).toFixed(2)}</span>
        </div>
        ${tip > 0 ? `
          <div class="total-row">
            <span>Tip</span>
            <span>— $${tip.toFixed(2)}</span>
          </div>
        ` : ''}
        <div class="total-row final">
          <span>Total</span>
          <span>— $${(total || 0).toFixed(2)}</span>
        </div>
      </div>
      
      <div class="payment-method">
        ${paymentDisplay}
      </div>
      
      <div class="footer">
        Thank you for your business!<br>
        echocatering.com
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate receipt image (JPG) from HTML
 */
async function generateReceiptImage(html) {
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.setViewport({ width: 400, height: 800 });
    
    // Get the actual content height
    const bodyHandle = await page.$('body');
    const boundingBox = await bodyHandle.boundingBox();
    await bodyHandle.dispose();
    
    // Screenshot the content
    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 90,
      clip: {
        x: 0,
        y: 0,
        width: 400,
        height: Math.ceil(boundingBox.height) + 40,
      },
    });
    
    return screenshot;
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Detect if contact is email or phone
 */
function detectContactType(contact) {
  // Simple email check
  if (contact.includes('@') && contact.includes('.')) {
    return 'email';
  }
  // Phone number - contains mostly digits
  const digits = contact.replace(/\D/g, '');
  if (digits.length >= 10) {
    return 'phone';
  }
  return 'unknown';
}

/**
 * Send receipt via email using Resend
 */
async function sendEmailReceipt(email, receiptImage, receiptHTML) {
  try {
    const emailData = {
      from: 'Echo Catering <receipts@echocatering.com>',
      to: email,
      subject: 'Your Receipt from Echo Catering',
      html: receiptHTML,
    };
    
    // Add attachment if image was generated
    if (receiptImage) {
      emailData.attachments = [
        {
          filename: 'receipt.jpg',
          content: receiptImage.toString('base64'),
        },
      ];
    }
    
    const { data, error } = await resend.emails.send(emailData);
    
    if (error) {
      console.error('[Receipts] Resend error:', error);
      throw new Error(error.message || 'Failed to send email');
    }
    
    console.log('[Receipts] Email sent successfully via Resend:', data);
    return { success: true, method: 'email', id: data?.id };
  } catch (err) {
    console.error('[Receipts] Email send failed:', err);
    throw err;
  }
}

/**
 * Send receipt via SMS/MMS
 */
async function sendSMSReceipt(phone, receiptImage) {
  // Format phone number
  let formattedPhone = phone.replace(/\D/g, '');
  if (formattedPhone.length === 10) {
    formattedPhone = '+1' + formattedPhone;
  } else if (!formattedPhone.startsWith('+')) {
    formattedPhone = '+' + formattedPhone;
  }
  
  if (!twilioClient) {
    console.log('[Receipts] Twilio not configured - would send to:', formattedPhone);
    return { success: true, method: 'sms', simulated: true };
  }
  
  // For MMS, we need to host the image somewhere accessible
  // For now, just send a text message
  await twilioClient.messages.create({
    body: 'Thank you for your purchase at Echo Catering! Your receipt has been processed.',
    from: process.env.TWILIO_PHONE_NUMBER,
    to: formattedPhone,
  });
  
  return { success: true, method: 'sms' };
}

/**
 * POST /api/receipts/send
 * Send a receipt to email or phone
 */
router.post('/send', async (req, res) => {
  try {
    const { contact, tabId, items, subtotal, tip, total, paymentMethod } = req.body;
    
    if (!contact) {
      return res.status(400).json({ error: 'Contact (email or phone) is required' });
    }
    
    console.log('[Receipts] Sending receipt to:', contact);
    
    // Generate receipt HTML and image
    const receiptHTML = generateReceiptHTML({ items, subtotal, tip, total, paymentMethod, tabId });
    
    let receiptImage = null;
    try {
      receiptImage = await generateReceiptImage(receiptHTML);
    } catch (err) {
      console.error('[Receipts] Failed to generate receipt image:', err.message);
      // Continue without image
    }
    
    // Detect contact type and send
    const contactType = detectContactType(contact);
    let result;
    
    if (contactType === 'email') {
      result = await sendEmailReceipt(contact, receiptImage, receiptHTML);
    } else if (contactType === 'phone') {
      result = await sendSMSReceipt(contact, receiptImage);
    } else {
      return res.status(400).json({ error: 'Invalid contact format. Please enter a valid email or phone number.' });
    }
    
    console.log('[Receipts] Receipt sent successfully:', result);
    res.json(result);
    
  } catch (error) {
    console.error('[Receipts] Error sending receipt:', error);
    res.status(500).json({ error: 'Failed to send receipt', details: error.message });
  }
});

module.exports = router;
