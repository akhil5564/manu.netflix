const mongoose = require('mongoose');

const blockTimeSchema = new mongoose.Schema({
  drawLabel: { type: String, required: true },
  type: { type: String, required: true },
  blockTime: { type: String, required: true },
  unblockTime: { type: String, required: true }
});

// **No unique index** needed if duplicates are not a problem

module.exports = mongoose.model('BlockTime', blockTimeSchema);
