const mongoose = require('mongoose');

const EntrySchema = new mongoose.Schema({
  number: String,
  count: Number,
  type: String,
  timeLabel: String,     // LSK, DEAR etc
  timeCode: String,      // LSK3, D-1-, etc
  createdBy: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Entry', EntrySchema);
