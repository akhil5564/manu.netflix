const mongoose = require('mongoose');

const EntrySchema = new mongoose.Schema({
  number: String,
  count: Number,
  type: String,
  timeLabel: String,
  timeCode: String,
  createdBy: String,
  billNo: Number,
  toggleCount: Number,
  createdAt: { type: Date, default: Date.now },

  // ✅ Correct placement of isValid
  isValid: {
    type: Boolean,
    default: true,
  },
});

module.exports = mongoose.model('Entry', EntrySchema);
