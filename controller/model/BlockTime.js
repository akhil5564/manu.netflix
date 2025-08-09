const mongoose = require('mongoose');

const BlockTimeSchema = new mongoose.Schema({
  drawLabel: { type: String, required: true, unique: true },
  blockTime: { type: String, required: true }, // format: 'HH:mm'
    unblockTime: { type: String, required: true },

});

module.exports = mongoose.model('BlockTime', BlockTimeSchema);
