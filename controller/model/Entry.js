const mongoose = require('mongoose');

const EntrySchema = new mongoose.Schema({
  number: String,
  count: Number,
  type: String,
  timeLabel: String,
  timeCode: String,
  createdBy: String,
  billNo: Number,
  toggleCount: Number, // ✅ MUST be added!
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Entry', EntrySchema);
