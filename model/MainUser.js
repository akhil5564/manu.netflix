// const mongoose = require('mongoose');

// const mainUserSchema = new mongoose.Schema({
//   name: String,
//   username: { type: String, unique: true },
//   password: String,
//   scheme: String,
//   createdBy: String,
//     usertype: {
//     type: String,
//     enum: ['master', 'sub'], // restrict to two roles
//     default: 'sub',
//   },
//   createdAt: { type: Date, default: Date.now },
// });

// // module.exports = mongoose.model('MainUser', mainUserSchema);
// module.exports =
//   mongoose.models.MainUser ||
//   mongoose.model('MainUser', mainUserSchema);
const mongoose = require('mongoose');

const mainUserSchema = new mongoose.Schema({
  name: String,
  username: { type: String, unique: true }, // index already created
  password: String,
  scheme: String,
  createdBy: String,
  usertype: {
    type: String,
    enum: ['master', 'sub'],
    default: 'sub',
  },
  createdAt: { type: Date, default: Date.now },
});

/* 🔥 PERFORMANCE INDEXES */
mainUserSchema.index({ createdBy: 1 });
mainUserSchema.index({ usertype: 1 });

module.exports =
  mongoose.models.MainUser ||
  mongoose.model('MainUser', mainUserSchema);
