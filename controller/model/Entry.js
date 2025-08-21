const mongoose = require('mongoose');

const EntrySchema = new mongoose.Schema({
  number: String,
  count: Number,
  type: String,
  timeLabel: String,
  timeCode: String,
  createdBy: String,
  billNo: Number,

  rate: { type: Number }, // FIXED

  toggleCount: Number,
  createdAt: { type: Date, default: Date.now },

  // ✅ New date field for the entry's effective date
  date: { type: Date, required: true },

  isValid: {
    type: Boolean,
    default: true,
  },
});

module.exports = mongoose.model('Entry', EntrySchema);
