const mongoose = require('mongoose');

const BlockTimeSchema = new mongoose.Schema({
  drawLabel: { type: String, required: true, unique: true },
  blockTime: { type: String, required: true }, // format: 'HH:mm'
});

module.exports = mongoose.model('BlockTime', BlockTimeSchema);
