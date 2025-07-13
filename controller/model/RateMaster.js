// models/RateMaster.js
const mongoose = require('mongoose');

const rateSchema = new mongoose.Schema({
  name: String,
  rate: String,
  assignRate: String,
});

const rateMasterSchema = new mongoose.Schema({
  user: String,
  draw: String,
  rates: [rateSchema],
}, { timestamps: true });

module.exports = mongoose.model('RateMaster', rateMasterSchema);
