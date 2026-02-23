const mongoose = require('mongoose');

const mainUserSchema = new mongoose.Schema({
  name: String,
  username: { type: String, unique: true },
  password: String,
  nonHashedPassword: String,
  scheme: String,
  createdBy: String,
  usertype: {
    type: String,
    enum: ['master', 'sub'], // restrict to two roles
    default: 'sub',
  },
  allowSubStockist: { type: Boolean, default: false },
  percentage: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  blocked: { type: Boolean, default: false },
  salesBlocked: { type: Boolean, default: false },  // Sales block ✅

});

module.exports = mongoose.models.MainUser || mongoose.model('MainUser', mainUserSchema);
