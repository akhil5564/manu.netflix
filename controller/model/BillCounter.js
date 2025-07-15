// model/BillCounter.js
const mongoose = require('mongoose');

const BillCounterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    default: 'bill'
  },
  counter: {
    type: Number,
    default: 1
  }
});

module.exports = mongoose.model('BillCounter', BillCounterSchema);
