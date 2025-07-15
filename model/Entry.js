const mongoose = require('mongoose');

const EntrySchema = new mongoose.Schema({
  number: String,
  count: Number,
  type: String,
  timeLabel: String,
  timeCode: String,
  createdBy: String,
  toggleCount: String,
  billNo: String, // <-- THIS IS REQUIRED
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Entry', EntrySchema);
