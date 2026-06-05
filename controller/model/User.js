const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
  selectedTime: { type: String, required: true },
  username: { type: String, required: true },
  tableRows: [
    {
      letter: { type: String, required: true },
      num: { type: String, required: true },
      count: { type: Number, required: true }, // Changed to Number for numeric data
      amount: { type: Number, required: true }, // Changed to Number for numeric data
    },
  ],
  createdAt: { type: Date, default: Date.now },
  customId: { type: String, required: true, unique: true }
});

// Add an index on `username` for fast querying
dataSchema.index({ username: 1 });

const DataModel = mongoose.model('Data', dataSchema);

const AdminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
  }
);
const AdminModel = mongoose.model('admin', AdminSchema);
const MainUsers = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
  }
);
const MainUsersModel = mongoose.model('MainUsers', MainUsers);

module.exports = {DataModel,AdminModel,MainUsersModel};
