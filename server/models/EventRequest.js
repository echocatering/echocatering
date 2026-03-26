const mongoose = require('mongoose');

const eventRequestSchema = new mongoose.Schema({
  firstName:      { type: String, required: true, trim: true },
  lastName:       { type: String, required: true, trim: true },
  email:          { type: String, required: true, trim: true },
  phone:          { type: String, required: true, trim: true },
  ext:            { type: String, default: '' },
  company:        { type: String, default: '' },
  provide:        { type: String, default: '' },
  eventNature:    { type: String, required: true },
  eventDate:      { type: String, required: true },
  startTime:      { type: String, required: true },
  endTime:        { type: String, required: true },
  numPeople:      { type: Number, required: true },
  additionalInfo: { type: String, default: '' },
  hearAbout:      { type: String, default: '' },
  status: {
    type: String,
    enum: ['new', 'contacted', 'booked', 'declined'],
    default: 'new'
  },
}, { timestamps: true });

module.exports = mongoose.model('EventRequest', eventRequestSchema);
