// model/TicketLimit.js
const mongoose = require('mongoose');

const ticketLimitSchema = new mongoose.Schema({
  group1: {
    A: String,
    B: String,
    C: String,
  },
  group2: {
    AB: String,
    BC: String,
    AC: String,
  },
  group3: {
    SUPER: String,
    BOX: String,
  },
  createdBy: String,
  date: String, // Optional
});

module.exports = mongoose.model('TicketLimit', ticketLimitSchema);
