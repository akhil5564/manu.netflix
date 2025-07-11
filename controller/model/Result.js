const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
  ticket: { type: String, required: true },
  result: { type: String, required: true },
  date: { type: String, required: true }, // format: YYYY-MM-DD
  time: { type: String, required: true }, // example: "KERALA 3PM"
}, { timestamps: true });

module.exports = mongoose.model('Result', resultSchema);
