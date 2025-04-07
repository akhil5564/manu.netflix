const mongoose = require('mongoose');

// Define your schema
const resultSchema = new mongoose.Schema({
  ticket: { type: String, required: true },
  result: { type: String, required: true, match: /^[0-9]{3}$/ }, // Validate 3-digit result
  date: { type: String, required: true }, // Store the date as a string
  time: { type: String, required: true }, // Store the time slot
}, { timestamps: true }); // Optionally, you can use timestamps

// Safely check if model already exists
const Result = mongoose.models.Result || mongoose.model('Result', resultSchema);

module.exports = Result;
