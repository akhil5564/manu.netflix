const mongoose = require('mongoose');

const mainUserSchema = new mongoose.Schema({
  name: String,
  username: { type: String, unique: true },
  password: String,
  scheme: String,
  createdBy: String,
    usertype: {
    type: String,
    enum: ['master', 'sub'], // restrict to two roles
    default: 'sub',
  },
  createdAt: { type: Date, default: Date.now },
  blocked: { type: Boolean, default: false },

});

module.exports = mongoose.model('MainUser', mainUserSchema);
