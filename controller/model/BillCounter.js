const mongoose = require('mongoose');

const billCounterSchema = new mongoose.Schema({
  name: { type: String, default: 'bill' },
  counter: { type: Number, default: 1 },
});

module.exports = mongoose.model('BillCounter', billCounterSchema);
