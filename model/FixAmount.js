const mongoose = require('mongoose');

const userAmountSchema = new mongoose.Schema({
  fromUser: {
    type: String,
    required: true
  },
  toUser: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  drawTime: {
    type: String,
    default: "ALL"
  },
  date: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

userAmountSchema.index({ toUser: 1, drawTime: 1 });
userAmountSchema.index({ fromUser: 1 });

module.exports = mongoose.model('UserAmount', userAmountSchema);
