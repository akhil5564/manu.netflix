const mongoose = require('mongoose');

const rateSchema = new mongoose.Schema({
  label: String, 
 rate: Number,
});

const rateMasterSchema = new mongoose.Schema({
  user: String,
  draw: String,
  rates: [rateSchema],
}, { timestamps: true });

module.exports = mongoose.model('RateMaster', rateMasterSchema);
