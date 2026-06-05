const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
  date: { type: String, required: true },
  time: { type: String, required: true },
  prizes: { type: [String], required: true }, // array of prize strings
  entries: { type: [Object], required: false }, // your entries array (optional)
}, { timestamps: true });

module.exports = mongoose.model('Result', resultSchema);
