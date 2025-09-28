const mongoose = require('mongoose');

const blockNumberSchema = new mongoose.Schema({
  field: {
    type: String,
    required: true,
    enum: ['A', 'B', 'C', 'AB', 'BC', 'AC', 'SUPER', 'BOX']
  },
  number: {
    type: String,
    required: true,
    trim: true
  },
  count: {
    type: Number,
    required: true,
    min: 1,
    max: 999
  },
  group: {
    type: String,
    required: true,
    enum: ['group1', 'group2', 'group3']
  },
  drawTime: {
    type: String,
    required: true,
    enum: ['DEAR 1 PM', 'KERALA 3 PM', 'DEAR 6 PM', 'DEAR 8 PM']
  },
  createdBy: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
blockNumberSchema.index({ field: 1, number: 1, drawTime: 1, createdBy: 1 });
blockNumberSchema.index({ group: 1, drawTime: 1, createdBy: 1 });
blockNumberSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BlockNumber', blockNumberSchema);
