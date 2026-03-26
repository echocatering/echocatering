const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const EventRequest = require('../models/EventRequest');
const { authenticateToken } = require('../middleware/auth');

// Build a nodemailer transporter using Gmail SMTP.
// Requires GMAIL_USER and GMAIL_APP_PASSWORD env vars (Gmail App Password, not account password).
function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER || 'echocateringllc@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = ((h + 11) % 12) + 1;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

function buildEmailHtml(r) {
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
  <div style="background:#222;padding:24px 28px;">
    <h2 style="color:#fff;margin:0;font-size:20px;">New Event Inquiry — Echo Catering</h2>
  </div>
  <div style="padding:28px;background:#fff;">
    <h3 style="margin-top:0;color:#333;font-size:15px;border-bottom:1px solid #eee;padding-bottom:10px;">Contact</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
      <tr><td style="padding:6px 0;color:#666;width:160px;">Name</td><td style="padding:6px 0;color:#222;font-weight:600;">${r.firstName} ${r.lastName}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;"><a href="mailto:${r.email}" style="color:#800080;">${r.email}</a></td></tr>
      <tr><td style="padding:6px 0;color:#666;">Phone</td><td style="padding:6px 0;color:#222;">${r.phone}${r.ext ? ` ext. ${r.ext}` : ''}</td></tr>
      ${r.company ? `<tr><td style="padding:6px 0;color:#666;">Company</td><td style="padding:6px 0;color:#222;">${r.company}</td></tr>` : ''}
      ${r.hearAbout ? `<tr><td style="padding:6px 0;color:#666;">Heard via</td><td style="padding:6px 0;color:#222;">${r.hearAbout}</td></tr>` : ''}
    </table>

    <h3 style="color:#333;font-size:15px;border-bottom:1px solid #eee;padding-bottom:10px;">Event Details</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
      <tr><td style="padding:6px 0;color:#666;width:160px;">Date</td><td style="padding:6px 0;color:#222;font-weight:600;">${r.eventDate}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Time</td><td style="padding:6px 0;color:#222;">${formatTime(r.startTime)} – ${formatTime(r.endTime)}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Guests</td><td style="padding:6px 0;color:#222;">${r.numPeople}</td></tr>
      ${r.provide ? `<tr><td style="padding:6px 0;color:#666;">Service</td><td style="padding:6px 0;color:#222;">${r.provide}</td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#666;vertical-align:top;">Nature</td><td style="padding:6px 0;color:#222;">${r.eventNature}</td></tr>
      ${r.additionalInfo ? `<tr><td style="padding:6px 0;color:#666;vertical-align:top;">Additional</td><td style="padding:6px 0;color:#222;">${r.additionalInfo}</td></tr>` : ''}
    </table>
  </div>
  <div style="background:#f9f9f9;padding:16px 28px;font-size:12px;color:#999;border-top:1px solid #eee;">
    Submitted via echocatering.com
  </div>
</div>`;
}

/**
 * POST /api/event-requests
 * Public — saves inquiry to DB and sends notification email.
 */
router.post('/', async (req, res) => {
  try {
    const {
      firstName, lastName, email, phone, ext, company,
      provide, eventNature, eventDate, startTime, endTime,
      numPeople, additionalInfo, hearAbout,
    } = req.body;

    if (!firstName || !lastName || !email || !phone || !eventNature || !eventDate || !startTime || !endTime || !numPeople) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const record = await EventRequest.create({
      firstName, lastName, email, phone, ext: ext || '',
      company: company || '', provide: provide || '',
      eventNature, eventDate, startTime, endTime,
      numPeople: parseInt(numPeople) || 0,
      additionalInfo: additionalInfo || '',
      hearAbout: hearAbout || '',
    });

    // Send notification email (non-blocking — don't fail submission if email errors)
    if (process.env.GMAIL_APP_PASSWORD) {
      try {
        const transporter = getTransporter();
        await transporter.sendMail({
          from: `"Echo Catering" <${process.env.GMAIL_USER || 'echocateringllc@gmail.com'}>`,
          to: 'echocateringllc@gmail.com',
          replyTo: email,
          subject: `New Event Inquiry — ${firstName} ${lastName} (${eventDate})`,
          html: buildEmailHtml(record),
        });
        console.log(`[EventRequests] Email sent for inquiry from ${email}`);
      } catch (emailErr) {
        console.error('[EventRequests] Email send failed (inquiry still saved):', emailErr.message);
      }
    } else {
      console.warn('[EventRequests] GMAIL_APP_PASSWORD not set — email notification skipped');
    }

    res.status(201).json({ success: true, id: record._id });
  } catch (err) {
    console.error('[EventRequests] POST error:', err);
    res.status(500).json({ error: 'Failed to submit inquiry', message: err.message });
  }
});

/**
 * GET /api/event-requests
 * Admin-only — list all inquiries, newest first.
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const requests = await EventRequest.find().sort({ createdAt: -1 }).lean();
    res.json({ requests });
  } catch (err) {
    console.error('[EventRequests] GET error:', err);
    res.status(500).json({ error: 'Failed to fetch inquiries' });
  }
});

/**
 * PATCH /api/event-requests/:id/status
 * Admin-only — update status of an inquiry.
 */
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['new', 'contacted', 'booked', 'declined'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const updated = await EventRequest.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json({ request: updated });
  } catch (err) {
    console.error('[EventRequests] PATCH status error:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

module.exports = router;
