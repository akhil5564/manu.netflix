const mongoose = require('mongoose');

// Main User Schema
const mainUserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true }, // Unique username
  password: { type: String, required: true },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    match: /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/ // Email format validation
  },
  role: { 
    type: String, 
    enum: ['admin', 'user'], // Admin or regular user role
    required: true 
  },
}, { timestamps: true }); // Automatically adds createdAt and updatedAt fields

// Create a model from the schema
const MainUser = mongoose.model('MainUser', mainUserSchema);

module.exports = MainUser;
