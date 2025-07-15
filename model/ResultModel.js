const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
  date: String,
  time: String,
  prizes: [String],
  entries: [
    {
      ticket: String,
      result: String,
    },
  ],
});

module.exports = mongoose.model('Result', resultSchema);
