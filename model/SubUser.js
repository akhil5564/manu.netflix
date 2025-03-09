const mongoose = require('mongoose');

// Sub User Schema with userType
const subUserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true }, // Unique username
  password: { type: String, required: true },
  userType: { type: String, required: true, enum: ['main', 'sub'] }, // userType with enum validation
}, { timestamps: true }); // Automatically adds createdAt and updatedAt fields

// Create a model from the schema
const SubUser = mongoose.model('SubUser', subUserSchema);

module.exports = SubUser;
