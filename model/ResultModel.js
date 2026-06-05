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

const Result =
  mongoose.models.Result || mongoose.model("Result", resultSchema);

module.exports = Result;
