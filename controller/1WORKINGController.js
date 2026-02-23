//ratemaster and sales report working updated rate is adding to both schema parent rate problem
const MainUser = require('./model/MainUser');
const Entry = require('./model/Entry');
const bcrypt = require('bcryptjs');
const RateMaster = require('./model/RateMaster');
const Result = require('./model/ResultModel');
const DailyLimitUsage = require('./model/DailyLimitUsage');
const BlockTime = require('./model/BlockTime');

const TicketLimit = require('./model/TicketLimit'); // create this model
const BillCounter = require('./model/BillCounter');
const User = require('./model/MainUser'); // adjust the path to where your MainUser.js is
const BlockDate = require("./model/BlockDate");
const BlockNumber = require("./model/BlockNumber");
const DailyUserLimit = require('./model/DailyUserLimit');
const OverflowLimit = require('../model/OverflowLimit');
const Schema = require('../model/Schema')
const UserAmount = require('../model/FixAmount')
const { getCache, setCache } = require("../utils/cache");
const SalesReportSummary = require("../model/Summary");



// =======================
// 📌 Date Utilities for IST (Indian Standard Time - UTC+5:30)
// =======================

/**
 * Parse a date string (YYYY-MM-DD) and create Date object for start of day in IST
 */
function parseDateISTStart(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Parse a date string (YYYY-MM-DD) and create Date object for end of day in IST
 */
function parseDateISTEnd(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

/**
 * Format a Date object to YYYY-MM-DD string using local time (IST)
 */
function formatDateIST(date) {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const normalizeName = (name) => (name || "").toString().trim();

/**
 * Get standard default rate for a ticket type
 * A, B, C -> 12
 * SUPER, BOX, AB, BC, AC -> 10
 */
const getRateForType = (type) => {
  const t = (type || "").toUpperCase();
  if (["A", "B", "C"].includes(t)) return 12;
  return 10;
};

// Global standardization map for Draw Labels
const summaryLabelMap = {
  "DEAR 1 PM": "DEAR 1 PM",
  "KERALA 3 PM": "KERALA 3 PM",
  "LSK 3 PM": "KERALA 3 PM",
  "DEAR 6 PM": "DEAR 6 PM",
  "DEAR 8 PM": "DEAR 8 PM"
};

const extractBaseType = (type) => {
  if (!type) return "SUPER";
  const upper = type.toString().toUpperCase();
  if (upper.includes("SUPER")) return "SUPER";
  if (upper.includes("BOX")) return "BOX";
  if (upper.includes("AB")) return "AB";
  if (upper.includes("BC")) return "BC";
  if (upper.includes("AC")) return "AC";
  if (upper.endsWith("A") || upper.includes("-A")) return "A";
  if (upper.endsWith("B") || upper.includes("-B")) return "B";
  if (upper.endsWith("C") || upper.includes("-C")) return "C";
  const parts = type.toString().split("-");
  return parts[parts.length - 1] || "SUPER";
};






// Static ticket codes to use when blocking for "all"
const STATIC_TICKETS = [
  'LSK3',
  'DEAR1',
  'DEAR6',
  'DEAR8'
];
const STATIC_DATES = [
  'DEAR 1 PM',
  'KERALA 3 PM',
  'DEAR 6 PM',
  'DEAR 8 PM',
];

// Function to parse and normalize time values
const parseTimeValue = (time) => {
  if (!time || time === "ALL") {
    return null;
  }

  // Normalize to NO SPACE format (standard for Result collection)
  const t = time.toString().toUpperCase();
  if (t.includes('DEAR 1') || t.includes('DEAR1')) {
    return 'DEAR 1PM';
  } else if (t.includes('DEAR 8') || t.includes('DEAR8')) {
    return 'DEAR 8PM';
  } else if (t.includes('DEAR 6') || t.includes('DEAR6')) {
    return 'DEAR 6PM';
  } else if (t.includes('LSK') || t.includes('KERALA')) {
    return 'KERALA 3PM';
  } else {
    return 'KERALA 3PM'; // Default fallback
  }
};
const parseTicketTimeValue = (time) => {
  if (!time || time === "ALL") {
    return null;
  }

  // Normalize different time formats to standard format
  if (time === 'DEAR1') {
    return 'DEAR 1 PM';
  } else if (time === 'LSK3') {
    return 'KERALA 3 PM';
  } else if (time === 'DEAR6') {
    return 'DEAR 6 PM';
  } else {
    return 'DEAR 8 PM'; // Default fallback
  }
};

const getBlockedDates = async (req, res) => {
  try {
    const dates = await BlockDate.find().sort({ date: -1 });
    res.json(dates);
  } catch (err) {
    res.status(500).json({ message: "Error fetching blocked dates" });
  }
};

// ✅ Add new block date
const addBlockDate = async (req, res) => {
  try {
    const { ticket, date } = req.body;
    // console.log('exists1=============', req.body)

    if (!ticket || !date) {
      return res.status(400).json({ message: "Ticket and Date are required" });
    }
    // If ticket is 'all', block the date for all tickets/draws
    const isAll = typeof ticket === 'string' && ticket.trim().toLowerCase() === 'all';
    if (isAll) {
      const allTickets = STATIC_TICKETS;

      // Check which are already blocked for the date
      const existing = await BlockDate.find({ date, ticket: { $in: allTickets } }, { ticket: 1 }).lean();
      const alreadyBlockedSet = new Set((existing || []).map(d => d.ticket));
      const toInsert = allTickets
        .filter(t => !alreadyBlockedSet.has(t))
        .map(t => ({ ticket: t, date }));

      if (toInsert.length === 0) {
        return res.status(201).json({ status: 2, message: 'Already blocked for all tickets', blockedCount: 0 });
      }

      const result = await BlockDate.insertMany(toInsert, { ordered: false });
      return res.status(201).json({ status: 1, message: 'Blocked successfully for all tickets', blockedCount: result.length });
    }

    // Single ticket flow: Prevent duplicate
    const dates = await BlockDate.find({});
    // console.log('exists1=============', dates)
    const exists = await BlockDate.findOne({ ticket, date });
    if (exists) {
      return res.status(201).json({ status: 2, message: "Already blocked" });
    }

    const blockDate = new BlockDate({ ticket, date });
    await blockDate.save();
    res.status(201).json({ status: 1, message: "Blocked successfully", blockDate });
  } catch (err) {
    res.status(500).json({ status: 0, message: "Error blocking date" });
  }
};

// ✅ Delete block date
const deleteBlockDate = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await BlockDate.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting block date" });
  }
};



// Delete user controller
const deleteUser = async (req, res) => {
  // console.log('sssssssssssssssssssssssssssssss');
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ success: false, message: 'User ID is required' });
  }

  try {
    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({
      success: true,
      message: `User "${user.username}" deleted successfully`,
      user,
    });
  } catch (error) {
    console.error('❌ Delete user error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};


// ✅ Get block time for a draw

const getBlockTime = async (req, res) => {
  const drawLabel = req.params.drawLabel?.trim();

  if (!drawLabel) {
    return res.status(400).json({ message: 'Missing drawLabel in request params' });
  }

  try {
    const record = await BlockTime.findOne({ drawLabel });

    if (!record) {
      return res.status(404).json({ message: `No block time found for ${drawLabel}` });
    }

    return res.status(200).json(record);
  } catch (error) {
    console.error(`Error retrieving block time for "${drawLabel}":`, error);
    return res.status(500).json({ message: 'Server error while fetching block time' });
  }
};

const toggleSalesBlock = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the user
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Toggle the salesBlocked status
    user.salesBlocked = !user.salesBlocked;
    await user.save();

    res.json({
      message: `User sales block status updated to ${user.salesBlocked}`,
      user,
    });
  } catch (err) {
    console.error('❌ Error toggling sales block:', err);
    res.status(500).json({ message: 'Server error' });
  }
};


const toggleLoginBlock = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await MainUser.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.blocked = !user.blocked; // ✅ match frontend field name
    await user.save();

    res.json({
      message: `User login ${user.blocked ? "blocked" : "unblocked"}`,
      user,
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating user", error });
  }
};

// ✅ Get all block times (optional for admin view)
const getAllBlockTimes = async (req, res) => {
  try {
    const records = await BlockTime.find({});
    return res.status(200).json(records);
  } catch (error) {
    console.error('Error retrieving block times:', error);
    return res.status(500).json({ message: 'Error retrieving block times' });
  }
};
// ✅ Get block time for a draw and role (admin/master/sub)
const getBlockTimeByType = async (req, res) => {
  try {
    const drawLabel = req.params.drawLabel?.trim();
    const type = req.params.type?.trim();

    if (!drawLabel || !type) {
      return res.status(400).json({ message: 'Missing drawLabel or type in request params' });
    }

    const record = await BlockTime.findOne({ drawLabel, type });
    // console.log('Record:==============', record);
    if (!record) {
      return res.status(404).json({ message: `No block time found for ${drawLabel} (${type})` });
    }

    return res.status(200).json(record);
  } catch (error) {
    console.error(`Error retrieving block time for draw/type:`, error);
    return res.status(500).json({ message: 'Server error while fetching block time' });
  }
};
// ✅ Save or update block time



const countByNumber = async (req, res) => {
  try {
    const { keys, date, timeLabel } = req.body;

    if (!Array.isArray(keys) || !date || !timeLabel) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Helper to normalize types
    const normalizeType = (rawType) => {
      if (rawType.toUpperCase().includes('SUPER')) return 'SUPER';
      const parts = rawType.split('-');
      return parts.length > 1 ? parts[parts.length - 2].toUpperCase() : parts[0].toUpperCase();
    };

    // Prepare match conditions for MongoDB aggregation
    const matchConditions = keys.map((key) => {
      const parts = key.split('-');
      const number = parts[parts.length - 1];
      const type = normalizeType(key);
      return {
        number,
        type: { $regex: `^${type}$`, $options: 'i' }, // exact match ignoring case
        timeLabel,
        date, // match the explicit date sent from frontend
      };
    });

    // Aggregate total counts
    const results = await Entry.aggregate([
      { $match: { $or: matchConditions } },
      {
        $group: {
          _id: { type: '$type', number: '$number' },
          total: { $sum: '$count' },
        },
      },
    ]);

    // Initialize countMap with all keys defaulting to 0
    const countMap = {};
    keys.forEach((key) => {
      const parts = key.split('-');
      const number = parts[parts.length - 1];
      const type = normalizeType(key);
      countMap[`${type}-${number}`] = 0;
    });

    // Fill in totals from aggregation results
    results.forEach((item) => {
      const type = normalizeType(item._id.type);
      const number = item._id.number;
      const key = `${type}-${number}`;
      countMap[key] = item.total;
    });

    // console.log('✅ Returning counts for date', date, countMap);
    res.json(countMap);
  } catch (err) {
    console.error('❌ countByNumber error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};




const updatePasswordController = async (req, res) => {
  try {
    const username = req.params.username;
    const { password } = req.body;

    if (!password || password.trim() === '') {
      return res.status(400).json({ message: 'Password is required' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user password
    const updatedUser = await User.findOneAndUpdate(
      { username },
      { password: hashedPassword },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ✅ Update User Controller
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      username,
      password,
      percentage,
      scheme,
      allowSubStockist,
      // allowAgents,
      blocked,
      salesBlocked,
      name
    } = req.body;
    // console.log(' req.body======', req.body)

    if (!id) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    // Build update object
    const updateData = {};

    if (username !== undefined) updateData.username = username;
    if (name !== undefined) updateData.name = name;
    if (percentage !== undefined) updateData.percentage = parseFloat(percentage) || 0;
    if (scheme !== undefined) updateData.scheme = scheme;
    if (allowSubStockist !== undefined) updateData.usertype = allowSubStockist ? 'master' : 'sub';
    // if (allowAgents !== undefined) updateData.allowAgents = allowAgents;
    if (blocked !== undefined) updateData.blocked = blocked;
    if (salesBlocked !== undefined) updateData.salesBlocked = salesBlocked;

    // Handle password update
    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
      updateData.nonHashedPassword = password;
    }
    // console.log("updateData", updateData);

    // Update user
    const updatedUser = await MainUser.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Return updated user (excluding sensitive data)
    const { password: _, nonHashedPassword: __, ...userResponse } = updatedUser.toObject();

    return res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user: userResponse
    });

  } catch (error) {
    console.error('❌ Update user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating user',
      error: error.message
    });
  }
};






const setBlockTime = async (req, res) => {
  const { blocks } = req.body;

  if (!Array.isArray(blocks)) {
    return res.status(400).json({ message: "blocks must be an array" });
  }

  try {
    const results = await Promise.all(
      blocks.map(async ({ drawLabel, type, blockTime, unblockTime }) => {
        if (!drawLabel || !type || !blockTime || !unblockTime) {
          throw new Error(
            "drawLabel, type, blockTime, and unblockTime are all required."
          );
        }

        // Validate HH:mm
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(blockTime) || !timeRegex.test(unblockTime)) {
          throw new Error("blockTime and unblockTime must be in HH:mm format.");
        }

        // Replace existing document if exists, otherwise insert new
        await BlockTime.findOneAndReplace(
          { drawLabel, type },       // search by drawLabel + type
          { drawLabel, type, blockTime, unblockTime },
          { upsert: true }           // insert if not exist
        );
      })
    );

    res.status(200).json({ message: "Block times saved/updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};







const getNextBillNumber = async () => {
  const result = await BillCounter.findOneAndUpdate(
    { name: 'bill' },
    { $inc: { counter: 1 } },
    { new: true, upsert: true }
  );

  return result.counter.toString().padStart(5, '0'); // ➜ '00001', '00002', ...
};

const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password required' });
    }

    const user = await MainUser.findOne({
      username: { $regex: new RegExp(`^${username}$`, 'i') },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // ⛔ Check if the user is blocked
    if (user.blocked) {
      return res.status(403).json({ message: 'User is blocked. Contact admin.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    // ✅ Structured login response (include salesBlocked)
    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user._id,
        username: user.username,
        userType: user.usertype,
        scheme: user.scheme || null,
        salesBlocked: user.salesBlocked ?? false, // ✅ FIX
        isLoginBlocked: user.blocked
      },
    });
  } catch (error) {
    console.error('[LOGIN ERROR]', error.message, error.stack);
    return res.status(500).json({ message: 'Server error' });
  }
};






// ✅ Get Entries (filterable)

// const getEntries = async (req, res) => {
//   try {
//     const {
//       createdBy,
//       timeCode,
//       timeLabel,
//       number,
//       count,
//       date,
//       billNo,
//       fromDate,
//       toDate,
//       loggedInUser,
//       usertype
//     } = req.query;

//     const query = { isValid: true };

//     if (createdBy) query.createdBy = createdBy;
//     if (timeCode) query.timeCode = timeCode;
//     if (timeLabel) query.timeLabel = timeLabel;
//     if (number) query.number = number;
//     if (count) query.count = parseInt(count);
//     if (billNo) query.billNo = billNo;

//     // Single date filter (using "date" field)
//     if (date) {
//       const start = new Date(date);
//       start.setHours(0, 0, 0, 0);
//       const end = new Date(date);
//       end.setHours(23, 59, 59, 999);
//       query.date = { $gte: start, $lte: end };
//     }
//     // Date range filter (using "date" field)
//     else if (fromDate && toDate) {
//       const start = new Date(fromDate);
//       start.setHours(0, 0, 0, 0);
//       const end = new Date(toDate);
//       end.setHours(23, 59, 59, 999);
//       query.date = { $gte: start, $lte: end };
//     }

//     // Sort primarily by date, secondarily by createdAt
//     const entries = await Entry.find(query).sort({ date: -1, createdAt: -1 });
//     // console.log('entries===========', entries) 
//     // If loggedInUser exists → adjust rates
//     if (loggedInUser && entries.length > 0) {
//       // Get unique draws
//       const uniqueDraws = [...new Set(entries.map(e => e.timeLabel))];

//       // Fetch rate masters for this user
//       const rateMastersByDraw = {};
//       for (const draw of uniqueDraws) {
//         let rateMasterQuery = { user: loggedInUser, draw };
//         if (draw === "LSK 3 PM") {
//           rateMasterQuery.draw = "KERALA 3 PM"; // your special case
//         }

//         const rateMaster = await RateMaster.findOne(rateMasterQuery);
//         const rateLookup = {};
//         (rateMaster?.rates || []).forEach(r => {
//           rateLookup[r.label] = Number(r.rate) || 10;
//         });
//         rateMastersByDraw[draw] = rateLookup;
//       }

//       // Apply rates to entries
//       const extractBetType = (typeStr) => {
//         if (!typeStr) return "SUPER";
//         if (typeStr.toUpperCase().includes("SUPER")) return "SUPER";
//         if (typeStr.toUpperCase().includes("BOX")) return "BOX";
//         if (typeStr.toUpperCase().includes("AB")) return "AB";
//         if (typeStr.toUpperCase().includes("BC")) return "BC";
//         if (typeStr.toUpperCase().includes("AC")) return "AC";
//         if (typeStr.includes("-A") || typeStr.endsWith("A")) return "A";
//         if (typeStr.includes("-B") || typeStr.endsWith("B")) return "B";
//         if (typeStr.includes("-C") || typeStr.endsWith("C")) return "C";
//         return typeStr.split("-").pop();
//       };

//       entries.forEach(e => {
//         const betType = extractBetType(e.type);
//         const rateLookup = rateMastersByDraw[e.timeLabel] || {};
//         const rate = rateLookup[betType] ?? 10; // fallback default
//         e.rate = rate * (Number(e.count) || 0);
//       });
//     }
//     res.status(200).json(entries);
//   } catch (error) {
//     console.error("[GET ENTRIES ERROR]", error);
//     res.status(500).json({ message: "Failed to fetch entries" });
//   }
// };
const entriesCache = new Map();
const rateMasterCache = new Map();

// cache TTLs
const ENTRIES_TTL = 60 * 1000; // 60 seconds
const RATE_TTL = 10 * 60 * 1000; // 10 minutes


// const getEntries = async (req, res) => {
//   try {
//     const {
//       createdBy,
//       timeCode,
//       timeLabel,
//       number,
//       count,
//       date,
//       billNo,
//       fromDate,
//       toDate,
//       loggedInUser,
//       usertype
//     } = req.query;

//     // 🔑 1. Build cache key
//     const cacheKey = `entries:${JSON.stringify(req.query)}`;

//     // 🔍 2. Check entries cache
//     const cached = entriesCache.get(cacheKey);
//     if (cached && cached.expiry > Date.now()) {
//       return res.status(200).json(cached.data);
//     }

//     // 🔨 3. Build DB query
//     const query = { isValid: true };

//     if (createdBy) query.createdBy = createdBy;
//     if (timeCode) query.timeCode = timeCode;
//     if (timeLabel) query.timeLabel = timeLabel;
//     if (number) query.number = number;
//     if (count) query.count = parseInt(count);
//     if (billNo) query.billNo = billNo;

//     if (date) {
//       const start = new Date(date);
//       start.setHours(0, 0, 0, 0);
//       const end = new Date(date);
//       end.setHours(23, 59, 59, 999);
//       query.date = { $gte: start, $lte: end };
//     } else if (fromDate && toDate) {
//       const start = new Date(fromDate);
//       start.setHours(0, 0, 0, 0);
//       const end = new Date(toDate);
//       end.setHours(23, 59, 59, 999);
//       query.date = { $gte: start, $lte: end };
//     }

//     // 🗄 DB call
//     const entries = await Entry.find(query).sort({ date: -1, createdAt: -1 });

//     // 🔁 Apply rate logic
//     if (loggedInUser && entries.length > 0) {
//       const uniqueDraws = [...new Set(entries.map(e => e.timeLabel))];

//       for (const draw of uniqueDraws) {
//         const rateKey = `rate:${loggedInUser}:${draw}`;

//         let rateLookup;
//         const cachedRate = rateMasterCache.get(rateKey);

//         if (cachedRate && cachedRate.expiry > Date.now()) {
//           rateLookup = cachedRate.data;
//         } else {
//           let rateMasterQuery = { user: loggedInUser, draw };
//           if (draw === "LSK 3 PM") {
//             rateMasterQuery.draw = "KERALA 3 PM";
//           }

//           const rateMaster = await RateMaster.findOne(rateMasterQuery);

//           rateLookup = {};
//           (rateMaster?.rates || []).forEach(r => {
//             rateLookup[r.label] = Number(r.rate) || 10;
//           });

//           rateMasterCache.set(rateKey, {
//             data: rateLookup,
//             expiry: Date.now() + RATE_TTL
//           });
//         }

//         entries.forEach(e => {
//           if (e.timeLabel !== draw) return;

//           const type = e.type?.toUpperCase() || "SUPER";
//           let betType = "SUPER";
//           if (type.includes("BOX")) betType = "BOX";
//           else if (type.includes("AB")) betType = "AB";
//           else if (type.includes("BC")) betType = "BC";
//           else if (type.includes("AC")) betType = "AC";
//           else if (type.endsWith("A")) betType = "A";
//           else if (type.endsWith("B")) betType = "B";
//           else if (type.endsWith("C")) betType = "C";

//           const rate = rateLookup[betType] ?? 10;
//           e.rate = rate * (Number(e.count) || 0);
//         });
//       }
//     }

//     // 💾 4. Save final response to cache
//     entriesCache.set(cacheKey, {
//       data: entries,
//       expiry: Date.now() + ENTRIES_TTL
//     });

//     res.status(200).json(entries);
//   } catch (error) {
//     console.error("[GET ENTRIES ERROR]", error);
//     res.status(500).json({ message: "Failed to fetch entries" });
//   }
// };

const getEntries = async (req, res) => {
  try {
    const {
      createdBy,
      timeCode,
      timeLabel,
      number,
      count,
      date,
      billNo,
      fromDate,
      toDate,
      loggedInUser,
      usertype,
      after,            // ⭐ auto-load cursor
      limit = 20        // ⭐ batch size
    } = req.query;

    // ❗ Skip cache for auto-load calls
    const useCache = !after;
    const cacheKey = `entries:${JSON.stringify(req.query)}`;

    if (useCache) {
      const cached = entriesCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        return res.status(200).json(cached.data);
      }
    }

    // 🔨 Base query
    const query = { isValid: true };

    if (createdBy) query.createdBy = createdBy;
    if (timeCode) query.timeCode = timeCode;
    if (timeLabel) query.timeLabel = timeLabel;
    if (number) query.number = number;
    if (count) query.count = parseInt(count);
    if (billNo) query.billNo = billNo;

    // ✅ FIX: combine date + after properly
    const createdAtQuery = {};

    if (after) {
      createdAtQuery.$gt = new Date(after);
    }

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);

      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      createdAtQuery.$gte = start;
      createdAtQuery.$lte = end;
    } else if (fromDate && toDate) {
      const start = new Date(fromDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);

      createdAtQuery.$gte = start;
      createdAtQuery.$lte = end;
    }

    if (Object.keys(createdAtQuery).length > 0) {
      query.createdAt = createdAtQuery;
    }

    // 🗄 DB call (newest first)
    const entries = await Entry.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const response = {
      data: entries,
      lastTimestamp: entries.length > 0 ? entries[0].createdAt : after || null
    };

    // 💾 Cache only initial load
    if (useCache) {
      entriesCache.set(cacheKey, {
        data: response,
        expiry: Date.now() + ENTRIES_TTL
      });
    }

    res.status(200).json(response);
  } catch (error) {
    console.error("[GET ENTRIES ERROR]", error);
    res.status(500).json({ message: "Failed to fetch entries" });
  }
};







const getEntriesWithTimeBlock = async (req, res) => {
  try {
    const {
      createdBy,
      timeCode,
      timeLabel,
      number,
      count,
      date,
      billNo,
      fromDate,
      toDate,
      loggedInUser,
      usertype
    } = req.query;

    const query = { isValid: true };

    if (createdBy) query.createdBy = createdBy;
    if (timeCode) query.timeCode = timeCode;
    if (timeLabel) query.timeLabel = timeLabel;
    if (number) query.number = number;
    if (count) query.count = parseInt(count);
    if (billNo) query.billNo = billNo;

    // Single date filter (using "date" field)
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    }
    // Date range filter (using "date" field)
    else if (fromDate && toDate) {
      const start = new Date(fromDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    }

    // Sort primarily by date, secondarily by createdAt
    const entries = await Entry.find(query).sort({ date: -1, createdAt: -1 });
    // console.log('entries===========', entries)
    // 🔁 Rate calculation based on viewer's (loggedInUser) Perspective
    if (loggedInUser && entries.length > 0) {
      const uniqueDraws = [...new Set(entries.map(e => (e.timeLabel || "").trim().toUpperCase()))];
      const rateMastersByDrawKey = {};

      for (const draw of uniqueDraws) {
        const rmDraw = summaryLabelMap[draw] || draw;
        const rateMaster = await RateMaster.findOne({
          user: { $regex: new RegExp(`^${loggedInUser}$`, 'i') },
          draw: rmDraw
        });

        const rateLookup = {};
        (rateMaster?.rates || []).forEach(r => {
          const key = (r.label || r.name || "").toUpperCase();
          if (key) rateLookup[key] = Number(r.rate) || getRateForType(key);
        });
        rateMastersByDrawKey[draw] = rateLookup;
      }

      entries.forEach(e => {
        const drawKey = (e.timeLabel || "").trim().toUpperCase();
        const rateLookup = rateMastersByDrawKey[drawKey] || {};
        const betType = extractBaseType(e.type);
        const rate = rateLookup[betType] ?? getRateForType(betType);

        // Overwrite e.rate with the viewer's perspective (rate * count)
        const entryCount = Number(e.count) || 0;
        e.rate = (rate * entryCount).toFixed(2);
      });
    }
    let updatedEntries = entries
    if (entries.length > 0) {
      const now = new Date();
      updatedEntries = entries.map(e => {
        const obj = e.toObject(); // Convert Mongoose document → plain object

        const blockTimeData = getBlockTimeF(obj.timeLabel, usertype);
        if (!blockTimeData || !blockTimeData.blockTime) {
          obj.timeOver = 0;
          return obj;
        }

        const { blockTime } = blockTimeData;
        const [bh, bm] = blockTime.split(":").map(Number)
        // Use the entry's date instead of today
        const entryDate = new Date(obj.date); // the date of the entry
        const block = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate(), bh, bm);

        const now = new Date(); // current time
        obj.timeOver = now >= block ? 1 : 0;


        return obj;
      });

    }

    return res.status(200).json(updatedEntries);
  } catch (error) {
    console.error("[GET ENTRIES ERROR]", error);
    res.status(500).json({ message: "Failed to fetch entries" });
  }
};







const invalidateEntry = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await Entry.findByIdAndUpdate(
      id,
      { isValid: false },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.status(200).json({ message: 'Marked as invalid' });
  } catch (err) {
    console.error('[INVALIDATE ENTRY ERROR]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteEntryById = async (req, res) => {
  try {
    const { id, userType } = req.params;

    const obj = await Entry.findById(id);
    // console.log('obj=========', obj)
    const usertype = userType;
    const timeLabel = obj.timeLabel;
    const blockTimeData = await getBlockTimeF(timeLabel, usertype);
    // console.log('blockTimeData==========', blockTimeData)
    if (!blockTimeData || !blockTimeData.blockTime) {
      return res.status(400).json({ message: 'Block time not found' });
    }

    const { blockTime } = blockTimeData;
    const [bh, bm] = blockTime.split(":").map(Number)
    // Use the entry's date instead of today
    const entryDate = new Date(obj.date); // the date of the entry
    const block = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate(), bh, bm);

    const now = new Date(); // current time
    if (now >= block) {
      return res.status(400).json({ message: 'Cannot delete entry, Entry time is blocked for this draw' });
    }
    const deletedEntry = await Entry.findByIdAndDelete(id);

    if (!deletedEntry) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.status(200).json({ message: 'Entry deleted successfully' });
  } catch (err) {
    console.error('[DELETE ENTRY ERROR]', err);
    res.status(500).json({ message: 'Server error while deleting entry' });
  }
};



const deleteEntriesByBillNo = async (req, res) => {
  try {
    const { billNo } = req.params;

    const result = await Entry.deleteMany({ billNo });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'No entries found with this bill number' });
    }

    res.status(200).json({ message: 'Entries deleted successfully' });
  } catch (err) {
    console.error('[DELETE BY BILL NO ERROR]', err);
    res.status(500).json({ message: 'Server error while deleting entries' });
  }
};


const saveTicketLimit = async (req, res) => {
  try {
    const { group1, group2, group3, createdBy } = req.body;
    // console.log('req.body=============', req.body);

    if (!group1 || !group2 || !group3 || !createdBy) {
      return res.status(400).json({ message: 'Missing data' });
    }

    // Always update the single ticket limit record
    const updated = await TicketLimit.findOneAndUpdate(
      {}, // no filter → single global document
      { group1, group2, group3, createdBy },
      { upsert: true, new: true } // create if not exists, return updated doc
    );

    res.status(200).json({ message: 'Ticket limit saved successfully', data: updated });
  } catch (err) {
    console.error('[SAVE TICKET LIMIT]', err);
    res.status(500).json({ message: 'Server error' });
  }
};



const getLatestTicketLimit = async (req, res) => {
  try {
    const latest = await TicketLimit.findOne().sort({ _id: -1 }); // latest record
    if (!latest) return res.status(404).json({ message: 'No limits found' });

    res.status(200).json(latest);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// ✅ GET: Get result for specific date and time
const getResult = async (req, res) => {
  try {
    const { date, time } = req.query;
    // console.log('req.query', req.query);
    if (!time) {
      return res.status(400).json({ message: 'Missing time parameter' });
    }

    if (!date) {
      return res.status(400).json({ message: 'Missing date parameter' });
    }

    let query = { time, date };

    // Find all matching result documents

    const resultDocs = await Result.find(query).lean();
    const resultDoc = await Result.find({}).lean();
    // console.log('resultDoc=>>>>>>>>>>>>>>>>', resultDoc)
    // console.log('resultDoc=>>>>>>>>>>>>>>>>', resultDocs)

    if (!resultDocs || resultDocs.length === 0) {
      return res.status(200).json({ message: 'No results found for given parameters', status: 0 });
    }

    // Map each document to response format
    const results = resultDocs.map((resultDoc) => {
      const firstFive = Array.isArray(resultDoc.prizes) ? resultDoc.prizes : [];
      const othersRaw = Array.isArray(resultDoc.entries) ? resultDoc.entries : [];

      const others = othersRaw
        .map(entry => entry.result)
        .filter(r => r && r.length > 0);

      return {
        date: resultDoc.date,
        "1": firstFive[0] || null,
        "2": firstFive[1] || null,
        "3": firstFive[2] || null,
        "4": firstFive[3] || null,
        "5": firstFive[4] || null,
        others,
      };
    });

    // console.log('results=>>>>>>>>>>>>>>>>', results)
    return res.status(200).json({ data: results, status: 1, message: 'Result fetched successfully' });
    // return res.json(results); // returns array of result objects for each date
  } catch (error) {
    console.error('[GET RESULT ERROR]', error);
    return res.status(500).json({ message: 'Failed to fetch result' });
  }
};





// ✅ Create New User
const createUser = async (req, res) => {
  try {
    const {
      name = '',
      username,
      password,
      scheme = '',
      createdBy = '',
      usertype = 'sub', // default to 'sub' if not provided
    } = req.body;

    // Only require username and password
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const existingUser = await MainUser.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new MainUser({
      name,
      username,
      password: hashedPassword,
      nonHashedPassword: password,
      scheme,
      createdBy,
      usertype, // ✅ added usertype to the document
    });

    await newUser.save();

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser._id,
        name: newUser.name,
        username: newUser.username,
        nonHashedPassword: newUser.nonHashedPassword,
        scheme: newUser.scheme,
        createdBy: newUser.createdBy,
        usertype: newUser.usertype, // ✅ include in response
      },
    });
  } catch (error) {
    console.error('[CREATE USER ERROR]', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};


const saveResult = async (req, res) => {
  try {
    const { results } = req.body;

    const [date] = Object.keys(results);
    const [timeData] = results[date];
    const [time] = Object.keys(timeData);

    const { prizes, entries } = timeData[time];

    // ✅ Replace old result if same date & time exists
    const updatedResult = await Result.findOneAndUpdate(
      { date, time }, // search by date + time
      { prizes, entries }, // fields to update
      { upsert: true, new: true } // create if not exists, return updated
    );

    res.status(200).json({
      message: 'Result saved successfully',
      result: updatedResult
    });
  } catch (err) {
    console.error('❌ Error saving result:', err);
    res.status(500).json({
      message: 'Error saving result',
      error: err.message
    });
  }
};



// ✅ Add Entries

const addEntries = async (req, res) => {
  try {
    const { entries, timeLabel, timeCode, createdBy, toggleCount, date } = req.body;

    if (!entries || entries.length === 0) {
      return res.status(400).json({ message: 'No entries provided' });
    }
    if (!date) {
      return res.status(400).json({ message: 'Date is required' });
    }

    const billNo = await getNextBillNumber();

    const normCreatedBy = normalizeName(createdBy);
    // Use selectedAgent if provided (e.g. Admin or Master entering for a sub-agent)
    const activeSeller = normalizeName(req.body.selectedAgent) || normCreatedBy;

    const toSave = entries.map(e => ({
      ...e,
      rate: e.rate || Number(e?.total || (e.number.length === 1 ? 12 : 10) * e.count).toFixed(2),
      timeLabel,
      timeCode,
      createdBy: activeSeller,
      billNo,
      toggleCount,
      createdAt: new Date(),
      date: new Date(date),
    }));

    /*CREDIT LIMIT ENFORCEMENT */
    const lookupLabel = normalizeDrawLabel(timeLabel);
    const userLimitDoc = await UserAmount.findOne({
      toUser: createdBy,
      $or: [{ drawTime: lookupLabel }, { drawTime: "ALL" }]
    }).sort({ drawTime: -1 }); // Priority: Specific Draw > ALL

    if (userLimitDoc) {
      const limit = userLimitDoc.amount;

      // Calculate current batch total
      const currentBatchTotal = toSave.reduce((sum, e) => sum + Number(e.rate), 0);

      // Calculate total sales already submitted today for this draw
      // Normalize labels to catch both "LSK 3 PM" and "KERALA 3 PM"
      const labelsToCheck = [timeLabel];
      if (timeLabel === "LSK 3 PM") labelsToCheck.push("KERALA 3 PM");
      if (timeLabel === "KERALA 3 PM") labelsToCheck.push("LSK 3 PM");

      const startOfDay = parseDateISTStart(date);
      const endOfDay = parseDateISTEnd(date);

      const existingEntries = await Entry.find({
        createdBy,
        date: { $gte: startOfDay, $lte: endOfDay },
        timeLabel: { $in: labelsToCheck }
      });

      const totalAlreadySold = existingEntries.reduce((sum, e) => sum + (Number(e.rate) || 0), 0);

      if (totalAlreadySold + currentBatchTotal > limit) {
        return res.status(400).json({
          message: `Credit limit exceeded for ${timeLabel}.`,
          details: {
            limit,
            alreadySold: totalAlreadySold.toFixed(2),
            currentAttempt: currentBatchTotal.toFixed(2),
            shortfall: (totalAlreadySold + currentBatchTotal - limit).toFixed(2)
          }
        });
      }
    }

    await Entry.insertMany(toSave);

    // 🟢 Update SalesReportSummary automatically (using transaction date to match accounting expectations)
    const transactionDateStr = formatDateIST(new Date());
    await updateAutomaticSummary(createdBy, transactionDateStr, timeLabel, timeCode, toSave);

    res.status(200).json({ message: 'Entries saved successfully', billNo });
  } catch (error) {
    console.error('[SAVE ENTRY ERROR]', error);
    res.status(500).json({ message: 'Server error saving entries' });
  }
};




// Get Result (by date and time)
// controller/rateMasterController.js
const saveRateMaster = async (req, res) => {
  try {
    const { user, draw, rates } = req.body;
    // console.log('req.body', req.body)

    if (!user || !draw || !Array.isArray(rates)) {
      return res.status(400).json({ message: "Missing user, draw, or rates" });
    }

    // Validate each rate item
    for (const item of rates) {
      if (!item.label || typeof item.rate !== "number") {
        return res
          .status(400)
          .json({ message: "Each rate must have a label and numeric rate" });
      }
    }

    // Update existing document OR create new if not exists
    const updatedRate = await RateMaster.findOneAndUpdate(
      { user, draw },                     // match user + draw
      { $set: { rates } },                // update rates only
      { new: true, upsert: true }         // return new doc, create if missing
    );

    res.status(200).json({
      message: "Rate master saved/updated successfully",
      data: updatedRate,
      status: 200,
    });
  } catch (error) {
    console.error("[SAVE RATE MASTER ERROR]", error);
    res.status(500).json({ message: "Server error saving rate master" });
  }
};


// GET /rateMaster?user=vig&draw=LSK
const getRateMaster = async (req, res) => {
  try {
    const { user, draw } = req.query;
    if (!user || !draw) {
      return res.status(400).json({ message: 'User and draw are required' });
    }
    let RateMasterQuery = {}
    if (user) {
      RateMasterQuery.user = user
    }
    if (draw) {
      RateMasterQuery.draw = draw
    } if (draw === "LSK 3 PM") {
      RateMasterQuery.draw = "KERALA 3 PM"
    }
    // console.log('RateMasterQuery', RateMasterQuery)
    // const allDocs = await RateMaster.find({}).sort({ _id: -1 }).limit(2);
    // const allDocs = await RateMaster.find({})
    // console.log('All documents:', allDocs);
    const rateDoc = await RateMaster.findOne(RateMasterQuery);
    if (!rateDoc) {
      return res.status(200).json({ message: 'No rate found' });
    }

    res.json(rateDoc);
  } catch (error) {
    console.error('[GET RATE MASTER ERROR]', error);
    res.status(500).json({ message: 'Server error' });
  }
};


const updateEntryCount = async (req, res) => {
  try {
    const { id } = req.params;
    const { count, userType } = req.body;

    if (!count || isNaN(count)) return res.status(400).json({ message: 'Invalid count' });
    const obj = await Entry.findById(id);
    // console.log('obj=========', obj)
    const usertype = userType;
    const timeLabel = obj.timeLabel;
    const blockTimeData = await getBlockTimeF(timeLabel, usertype);
    // console.log('blockTimeData==========', blockTimeData)
    if (!blockTimeData || !blockTimeData.blockTime) {
      return res.status(400).json({ message: 'Block time not found' });
    }

    const { blockTime } = blockTimeData;
    const [bh, bm] = blockTime.split(":").map(Number)
    // Use the entry's date instead of today
    const entryDate = new Date(obj.date); // the date of the entry
    const block = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate(), bh, bm);

    const now = new Date(); // current time
    if (now >= block) {
      return res.status(400).json({ message: 'Cannot update count, Entry time is blocked for this draw' });
    }
    const updated = await Entry.findByIdAndUpdate(id, { count: parseInt(count) }, { new: true });
    if (!updated) return res.status(404).json({ message: 'Entry not found' });

    res.status(200).json({ message: 'Count updated successfully', entry: updated });
  } catch (err) {
    console.error('[UPDATE ENTRY COUNT ERROR]', err);
    res.status(500).json({ message: 'Server error updating count' });
  }
};



//   New: Get total count grouped by number
const getCountReport = async (req, res) => {
  try {
    const { date, time, agent, group, number } = req.query;

    const query = { isValid: true };

    if (date) {
      const start = parseDateISTStart(date);
      const end = parseDateISTEnd(date);
      query.createdAt = { $gte: start, $lte: end };
    }

    if (agent) {
      query.createdBy = agent;
    }

    if (time && time !== 'ALL') {
      query.timeLabel = time;
    }
    if (number) {
      query.number = number
    }
    const entries = await Entry.find(query);

    const countMap = {};

    entries.forEach(entry => {
      let ticket = extractBaseType(entry.type)
      const key = group === 'true'
        ? entry.number // Group only by number
        : `${entry.number}_${ticket}`; // Group by number + ticket name

      if (!countMap[key]) {
        countMap[key] = {
          number: entry.number,
          ticketName: group === 'true' ? null : ticket,
          count: 0,
          total: 0,
        };
      }

      countMap[key].count += entry.count;
      countMap[key].total += entry.amount;
    });

    const result = Object.values(countMap).sort((a, b) => b.count - a.count);

    res.status(200).json(result);
  } catch (err) {
    console.error('[COUNT REPORT ERROR]', err);
    res.status(500).json({ message: 'Server error while generating report' });
  }
};



//   Get All Users (optionally filter by createdBy)
const getAllUsers = async (req, res) => {
  try {
    const { createdBy } = req.query;
    const query = createdBy ? { createdBy } : {};

    const users = await MainUser.find(query).select('-password -nonHashedPassword');

    // const userss = await MainUser.find(query);
    res.status(200).json(users);
  } catch (error) {
    console.error('[GET USERS ERROR]', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};
const getusersByid = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ message: 'User _id is required' });
    }

    const user = await MainUser.findById(id).select('');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('[GET USER BY ID ERROR]', error);
    res.status(500).json({ message: 'Failed to fetch user' });
  }
};


const payouts = {
  SUPER: { 1: 5000, 2: 500, 3: 250, 4: 100, 5: 50, other: 20 },
  BOX: {
    normal: { perfect: 3000, permutation: 800 },
    double: { perfect: 3800, permutation: 1600 },
  },
  AB_BC_AC: 700,
  A_B_C: 100,
};

// Helper function to calculate win amount
// Helper function to calculate win amount dynamically based on Schema
const calculateWinAmount = (entry, results, schemeData) => {
  if (!results || !results["1"]) return 0;

  const baseType = extractBaseType(entry.type);
  const winType = computeWinType(entry, results);
  if (!winType) return 0;

  // Find the group in schemeData that matches this baseType
  let targetGroup = "";
  if (baseType === "A" || baseType === "B" || baseType === "C") {
    targetGroup = "Group 1";
  } else if (["AB", "BC", "AC"].includes(baseType)) {
    targetGroup = "Group 2";
  } else if (baseType === "SUPER") {
    targetGroup = "Group 3-SUPER";
  } else if (baseType === "BOX") {
    targetGroup = "Group 3-BOX";
  }

  const group = (schemeData?.schemes || []).find(g => g.group === targetGroup);
  if (!group) return 0;

  let row;
  if (baseType === "SUPER" || baseType === "BOX") {
    const match = winType.match(/(\d+)/); // Extracts 1, 2, 3...
    const pos = match ? parseInt(match[1], 10) : 1;
    row = group.rows.find(r => r.pos === pos);

    // Box fallback for non-doubles if pos > 1
    if (!row && baseType === "BOX") {
      row = group.rows[0]; // Default to first row
    }
  } else {
    row = group.rows.find(r => r.scheme === baseType);
  }

  if (row) {
    return (row.amount || 0) * (entry.count || 0);
  }

  return 0;
};

// Pseudocode based on your frontend logic
const drawLabelMap = {
  "LSK 3 PM": "KERALA 3 PM",
  "DEAR 1 PM": "DEAR 1 PM",
  "DEAR 6 PM": "DEAR 6 PM",
  "DEAR 8 PM": "DEAR 8 PM"
};

function normalizeDrawLabel(label) {
  return drawLabelMap[label] || label;
}
const netPayMultiday = async (req, res) => {
  const { fromDate, toDate, time, agent, fromAccountSummary, loggedInUser } = req.body;
  // console.log('req.body=>>>>>>>>>>>>>>>>', req.body);

  try {
    const users = await MainUser.find().select("-password -nonHashedPassword");
    const userSchemeMap = {};
    users.forEach(u => {
      userSchemeMap[u.username] = u.scheme || "Scheme 1";
    });
    function getAllDescendants(username, usersList, visited = new Set()) {
      if (visited.has(username)) return [];
      visited.add(username);
      const children = usersList.filter(u => u.createdBy === username).map(u => u.username);
      let all = [...children];
      children.forEach(child => all = all.concat(getAllDescendants(child, usersList, visited)));
      return all;
    }

    const agentUsers = agent
      ? [agent, ...getAllDescendants(agent, users)]
      : users.map(u => u.username);

    const start = parseDateISTStart(fromDate);
    const end = parseDateISTEnd(toDate);

    const isArrayTime = Array.isArray(time);
    const isAllTime = !isArrayTime && (time === 'All' || time === 'ALL');

    let entryQuery = {
      createdBy: { $in: agentUsers },
      createdAt: { $gte: start, $lte: end },
      isValid: true
    };

    if (!isAllTime) {
      if (isArrayTime && time.length > 0) {
        entryQuery.timeLabel = { $in: time };
      } else if (typeof time === 'string' && time.trim().length > 0) {
        entryQuery.timeLabel = time;
      }
    }

    // console.log('🔍 Entry Query:', JSON.stringify(entryQuery, null, 2));
    // console.log('🔍 Agent Users:', agentUsers);
    // console.log('🔍 Date range (IST):', { 
    //   start: formatDateIST(start) + ' 00:00:00 IST', 
    //   end: formatDateIST(end) + ' 23:59:59 IST',
    //   startUTC: start.toISOString(),
    //   endUTC: end.toISOString()
    // });

    const entries = await Entry.find(entryQuery);
    // console.log('📊 Found entries count:', entries.length);

    // If no entries found, let's check what data exists
    if (entries.length === 0) {
      // const allEntries = await Entry.find({}).limit(5);
      // console.log('📋 Sample entries in DB:', allEntries.map(e => ({
      //   createdBy: e.createdBy,
      //   timeLabel: e.timeLabel,
      //   date: e.date,
      //   number: e.number
      // })));

      // const agentEntries = await Entry.find({ createdBy: { $in: agentUsers } }).limit(5);
      // console.log('👥 Sample entries for agent:', agentEntries.length);
    }

    const stripSpaceBeforeMeridiem = (label) => label.replace(/\s+(PM|AM)$/gi, '$1');

    const datesList = getDatesBetween(start, end).map(d => formatDateIST(d));
    let resultQuery = { date: { $in: datesList } };
    if (!isAllTime) {
      if (isArrayTime) {
        // Normalize draw labels to match how results are stored (e.g., LSK 3 PM -> KERALA 3PM)
        const times = (time || []).map(t =>
          stripSpaceBeforeMeridiem(normalizeDrawLabel(String(t)))
        );
        if (times.length > 0) resultQuery.time = { $in: times };
      } else if (typeof time === 'string' && time.trim().length > 0) {
        // Normalize single draw label as well
        resultQuery.time = stripSpaceBeforeMeridiem(normalizeDrawLabel(time));
      }
    }

    const results = await Result.find(resultQuery).lean();
    // console.log('resultQuery=>>>>>>>>>>>>>>>>', resultQuery);
    // console.log('results=>>>>>>>>>>>>>>>>', results);

    const resultByDateTime = {};
    results.forEach(r => {
      const dateStr = formatDateIST(new Date(r.date));
      const normalizedTime = stripSpaceBeforeMeridiem(r.time);
      resultByDateTime[`${dateStr}_${normalizedTime}`] = r;
    });
    // console.log('resultByDate=>>>>>>>>>>>>>>>', resultByDateTime);

    const userRates = await getUserRates(
      agentUsers,
      (isArrayTime ? 'All' : time),
      req.body.fromAccountSummary,
      req.body.loggedInUser
    );
    // console.log('userRates=>>>>>>>>>>>>>>>>', userRates)
    const processedEntries = entries.map(entry => {
      const entryDateStr = formatDateIST(new Date(entry.createdAt));
      // Normalize entry draw label to align with result keys (e.g., LSK 3 PM -> KERALA 3PM)
      const normalizedLabel = stripSpaceBeforeMeridiem(normalizeDrawLabel(entry.timeLabel));
      const dayResult = resultByDateTime[`${entryDateStr}_${normalizedLabel}`] || null;

      let normalizedResult = null;
      if (dayResult) {
        normalizedResult = {
          "1": dayResult.prizes?.[0] || null,
          "2": dayResult.prizes?.[1] || null,
          "3": dayResult.prizes?.[2] || null,
          "4": dayResult.prizes?.[3] || null,
          "5": dayResult.prizes?.[4] || null,
          others: (dayResult.entries || []).map(e => e.result).filter(Boolean)
        };
      }
      // console.log('normalizedResult=>>>>>>>>>>>>>>>', normalizedResult);

      const userRateMap = userRates[entry.createdBy] || {};
      // console.log('userRateMap=>>>>>>>>>>>>>>>>', userRateMap);
      // Normalize the draw label to match how it's stored in getUserRates
      const normalizedRateDrawLabel = stripSpaceBeforeMeridiem(normalizeDrawLabel(entry.timeLabel));
      // console.log('normalizedRateDrawLabel', normalizedRateDrawLabel)
      const drawRateMap = (isAllTime || isArrayTime)
        ? (userRateMap[normalizedRateDrawLabel] || {})
        : (userRateMap[normalizedLabel] || userRateMap[time] || {});

      const betType = extractBaseType(entry.type);
      // console.log('drawRateMap', drawRateMap)
      // console.log('betType', betType)
      const rate = drawRateMap[betType] ?? 10;
      // console.log('rate', rate)
      const winAmount = calculateWinAmount(entry, normalizedResult);
      // console.log('winAmount', winAmount)
      const winType = computeWinType(entry, normalizedResult);
      // console.log('winType', winType)

      return {
        ...entry.toObject(),
        winAmount,
        winType,
        scheme: userSchemeMap[entry.createdBy] || "Scheme 1",
        appliedRate: rate,
        calculatedAmount: rate * (Number(entry.count) || 0),
        date: entryDateStr
      };
    });

    if (processedEntries.length === 0) {
      return res.status(200).json({ message: "No entries found for given date range" });
    }

    res.json({
      fromDate,
      toDate,
      time,
      agent: agent || "All Agents",
      entries: processedEntries,
      usersList: users.map(u => u.username),
      userRates
    });

  } catch (err) {
    console.error("[netPayMultiday ERROR]", err);
    res.status(500).json({ error: err.message });
  }
};

// async function getUserRates(usernames, time, fromAccountSummary, loggedInUser) {
//   const encodedDraw = time;
// let ratee = await RateMaster.find({})
//   console.log('ratee=======', ratee)
//   if (fromAccountSummary) {
//     // Only fetch loggedInUser rate once
//     const adminRateDoc = await RateMaster.findOne({
//       user: loggedInUser,
//       draw: encodedDraw
//     });

//     const adminRates = {};
//     (adminRateDoc?.rates || []).forEach(r => {
//       adminRates[r.label] = r.rate;
//     });

//     // Apply same rates to all users
//     const ratesMap = {};
//     usernames.forEach(u => (ratesMap[u] = adminRates));
//     return ratesMap;
//   } else {
//     // Fetch each user’s rate
//     const rateDocs = await RateMaster.find({
//       user: { $in: usernames },
//       draw: encodedDraw
//     });

//     const ratesMap = {};
//     rateDocs.forEach(doc => {
//       const map = {};
//       doc.rates.forEach(r => (map[r.label] = r.rate));
//       ratesMap[doc.user] = map;
//     });
//     return ratesMap;
//   }
// }
async function getUserRates(usernames, time, fromAccountSummary, loggedInUser) {
  // Log function entry always
  console.log('🔵 getUserRates called with:');
  console.log('  - time:', time);
  console.log('  - fromAccountSummary:', fromAccountSummary);
  console.log('  - loggedInUser:', loggedInUser);
  console.log('  - usernames:', usernames);

  const normalizeDrawForStorage = (drawLabel) => {
    // Normalize draw label to match entry.timeLabel format
    let normalized = normalizeDrawLabel(drawLabel); // Maps "LSK 3 PM" -> "KERALA 3 PM"
    normalized = normalized.replace(/\s+(PM|AM)$/gi, '$1'); // Strip space before PM/AM: "DEAR 1 PM" -> "DEAR 1PM"
    return normalized;
  };

  // CASE 1: Specific draw
  if (time !== "All") {
    const encodedDraw = time;

    console.log('✅ Processing specific draw:', encodedDraw);
    console.log('fromAccountSummary=>>>>>>>>>>>>>>>>', fromAccountSummary)
    console.log('loggedInUser=>>>>>>>>>>>>>>>>', loggedInUser)
    console.log('usernames=>>>>>>>>>>>>>>>>', usernames)

    if (fromAccountSummary) {
      // Find rates for each user in usernames
      console.log('  📋 Finding rates for each user:', usernames);
      const rateDocs = await RateMaster.find({
        user: { $in: usernames },
        $or: [
          { draw: encodedDraw },
          { draw: normalizeDrawLabel(encodedDraw) }
        ]
      });

      const ratesMap = {};
      rateDocs.forEach(doc => {
        const map = {};
        doc.rates.forEach(r => (map[r.label] = r.rate));
        if (!ratesMap[doc.user]) ratesMap[doc.user] = {};
        // Store with normalized key
        const normalizedDrawKey = normalizeDrawForStorage(doc.draw);
        ratesMap[doc.user][normalizedDrawKey] = map;
      });
      return ratesMap;
    } else {
      // Find rates only for loggedInUser, then apply to all users
      console.log('  📋 Finding rates only for loggedInUser:', loggedInUser);
      const adminRateDoc = await RateMaster.findOne({
        user: loggedInUser,
        $or: [
          { draw: encodedDraw },
          { draw: normalizeDrawLabel(encodedDraw) }
        ]
      });

      const adminRates = {};
      (adminRateDoc?.rates || []).forEach(r => {
        adminRates[r.label] = r.rate;
      });

      // Apply admin rates to all users, store with normalized key
      const normalizedDrawKey = normalizeDrawForStorage(encodedDraw);
      const ratesMap = {};
      usernames.forEach(u => (ratesMap[u] = { [normalizedDrawKey]: adminRates }));
      return ratesMap;
    }
  }

  // CASE 2: All draws
  console.log('✅ Processing all draws (time === "All")');

  let rateDocs;
  if (fromAccountSummary) {
    // Find rates for each user in usernames
    console.log('  📋 Finding rates for each user:', usernames);
    rateDocs = await RateMaster.find({
      user: { $in: usernames }
    });
  } else {
    // Find rates only for loggedInUser, then apply to all users
    console.log('  📋 Finding rates only for loggedInUser:', loggedInUser);
    rateDocs = await RateMaster.find({
      user: loggedInUser
    });
  }

  const ratesMap = {};

  if (fromAccountSummary) {
    // Store rates for each user separately
    rateDocs.forEach(doc => {
      const map = {};
      doc.rates.forEach(r => (map[r.label] = r.rate));

      if (!ratesMap[doc.user]) ratesMap[doc.user] = {};
      // Store with normalized key for consistent lookup
      const normalizedDrawKey = normalizeDrawForStorage(doc.draw);
      ratesMap[doc.user][normalizedDrawKey] = map;
    });
  } else {
    // Apply loggedInUser rates to all users in usernames
    const adminRatesByDraw = {};
    rateDocs.forEach(doc => {
      const map = {};
      doc.rates.forEach(r => (map[r.label] = r.rate));
      const normalizedDrawKey = normalizeDrawForStorage(doc.draw);
      adminRatesByDraw[normalizedDrawKey] = map;
    });

    // Apply admin rates to all users
    usernames.forEach(u => {
      ratesMap[u] = { ...adminRatesByDraw };
    });
  }

  return ratesMap;
}

// =======================
// 📌 Winning Report (multi-day)
// =======================


// ---- helper functions for winning report ----



function isDoubleNumber(numStr) {
  return new Set(numStr.split("")).size === 2;
}

// function extractBaseType(typeStr) {
//   if (!typeStr) return "";
//   const parts = typeStr.split("-");
//   return parts[parts.length - 1]; // Get the last part (SUPER, BOX, etc.)
// }
const extractBetTypeTime = (typeStr) => {
  // console.log('typeStr', typeStr);
  if (!typeStr) return "KERALA 3 PM";

  // Handle different patterns: LSK3SUPER, D-1-A, etc.
  if (typeStr.toUpperCase().includes("LSK3")) {
    return "KERALA 3 PM";
  } else if (typeStr.toUpperCase().includes("D-1")) {
    return "DEAR 1 PM";
  } else if (typeStr.toUpperCase().includes("D-6")) {
    return "DEAR 6 PM";
  } else if (typeStr.toUpperCase().includes("D-8")) {
    return "DEAR 8 PM";
  }

  // Fallback: extract from parts
  const parts = typeStr.split("-");
  return parts[parts.length - 1];
};

// ---- helper functions ----
// --- Normalize results from multiple docs into one object ---
function normalizeResultDocs(resultDocs) {
  const grouped = {};

  for (const doc of resultDocs) {
    const ds = formatDateIST(new Date(doc.date));
    const key = `${ds}|${doc.time}`;

    if (!grouped[key]) {
      grouped[key] = {
        "1": null, "2": null, "3": null, "4": null, "5": null,
        others: [],
      };
    }

    if (["1", "2", "3", "4", "5"].includes(doc.ticket)) {
      grouped[key][doc.ticket] = doc.result;
    } else {
      grouped[key].others.push(doc.result);
    }
  }

  return grouped;
}

function computeWinType(entry, results) {
  if (!results) return "";
  const baseType = extractBaseType(entry.type);
  const num = entry.number;
  const first = results["1"];
  const others = results.others || [];

  if (baseType === "SUPER") {
    if (num === results["1"]) return "SUPER 1";
    if (num === results["2"]) return "SUPER 2";
    if (num === results["3"]) return "SUPER 3";
    if (num === results["4"]) return "SUPER 4";
    if (num === results["5"]) return "SUPER 5";
    if (others.includes(num)) return "SUPER other";
    return "";
  }

  if (baseType === "BOX" && first) {
    const isDouble = isDoubleNumber(first);
    const isPerfect = num === first;
    const isPerm = num.split("").sort().join("") === first.split("").sort().join("");
    if (isPerfect) return isDouble ? "BOX double perfect" : "BOX perfect";
    if (isPerm) return isDouble ? "BOX double permutation" : "BOX permutation";
    return "";
  }

  if (["AB", "BC", "AC", "A", "B", "C"].includes(baseType)) return baseType;
  return "";
}
function getDatesBetween(start, end) {
  const dates = [];
  const curr = new Date(start);
  while (curr <= end) {
    dates.push(new Date(curr));
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}
// --- MAIN FUNCTION ---
// =======================
// 📌 Fixed getWinningReport
// =======================
function formatDate(date) {
  return formatDateIST(date);
}


// const getWinningReport = async (req, res) => {
//   try {
//     const { fromDate, toDate, time = "ALL", agent } = req.body;

//     if (!fromDate || !toDate) {
//       return res.status(400).json({ message: "fromDate and toDate are required" });
//     }

//     /* ----------------------------------
//        1️⃣ USERS + DESCENDANTS
//     ---------------------------------- */
//     const users = await MainUser.find().select("username createdBy scheme");

//     const userMap = {};
//     users.forEach(u => userMap[u.username] = u);

//     function getAllDescendants(username, visited = new Set()) {
//       if (visited.has(username)) return [];
//       visited.add(username);

//       const children = users
//         .filter(u => u.createdBy === username)
//         .map(u => u.username);

//       let all = [...children];
//       children.forEach(c => {
//         all = all.concat(getAllDescendants(c, visited));
//       });
//       return all;
//     }

//     const agentUsers = agent
//       ? [agent, ...getAllDescendants(agent)]
//       : users.map(u => u.username);

//     /* ----------------------------------
//        2️⃣ DATE RANGE (IST SAFE)
//     ---------------------------------- */
//     const start = parseDateISTStart(fromDate);
//     const end = parseDateISTEnd(toDate);

//     /* ----------------------------------
//        3️⃣ ENTRY QUERY (🔥 FIXED)
//     ---------------------------------- */
//     const entryQuery = {
//       createdBy: { $in: agentUsers },
//       isValid: true,
//       createdAt: { $gte: start, $lte: end }, // ✅ FIX
//     };

//     if (time !== "ALL") {
//       entryQuery.timeLabel = new RegExp(time, "i"); // ✅ FLEXIBLE MATCH
//     }

//     const entries = await Entry.find(entryQuery).lean();

//     if (!entries.length) {
//       return res.json({ message: "No entries found", bills: [], grandTotal: 0 });
//     }

//     /* ----------------------------------
//        4️⃣ FETCH RESULTS
//     ---------------------------------- */
//     const datesList = getDatesBetween(start, end).map(d => formatDateIST(d));

//     const resultQuery = { date: { $in: datesList } };

//     const normalizedTime = parseTimeValue(time);
//     if (normalizedTime && time !== "ALL") {
//       resultQuery.time = normalizedTime;
//     }

//     const results = await Result.find(resultQuery).lean();

//     const resultsByTime = {};
//     for (const r of results) {
//       if (!resultsByTime[r.time]) resultsByTime[r.time] = [];
//       resultsByTime[r.time].push(r);
//     }

//     /* ----------------------------------
//        5️⃣ FIND RESULT BY DATE + TIME
//     ---------------------------------- */
//     function findDayResult(dateStr, timeLabel) {
//       const t = parseTimeValue(timeLabel);
//       const list = resultsByTime[t] || [];

//       const found = list.find(r => formatDateIST(new Date(r.date)) === dateStr);
//       if (!found) return null;

//       return {
//         "1": found.prizes?.[0] || null,
//         "2": found.prizes?.[1] || null,
//         "3": found.prizes?.[2] || null,
//         "4": found.prizes?.[3] || null,
//         "5": found.prizes?.[4] || null,
//         others: (found.entries || []).map(e => e.result).filter(Boolean)
//       };
//     }

//     /* ----------------------------------
//        6️⃣ CALCULATE WINNING ENTRIES
//     ---------------------------------- */
//     const winningEntries = [];

//     for (const e of entries) {
//       const ds = formatDateIST(new Date(e.createdAt));
//       const dayResult = findDayResult(ds, e.timeLabel);

//       if (!dayResult) continue;

//       const winAmount = calculateWinAmount(e, dayResult);
//       if (winAmount <= 0) continue;

//       winningEntries.push({
//         ...e,
//         date: ds,
//         winAmount,
//         baseType: extractBaseType(e.type),
//         winType: computeWinType(e, dayResult),
//         name: e.name || "-"
//       });
//     }

//     if (!winningEntries.length) {
//       return res.json({ message: "No winning entries found", bills: [], grandTotal: 0 });
//     }

//     /* ----------------------------------
//        7️⃣ GROUP BY BILL
//     ---------------------------------- */
//     const billsMap = {};

//     for (const w of winningEntries) {
//       if (!billsMap[w.billNo]) {
//         billsMap[w.billNo] = {
//           billNo: w.billNo,
//           createdBy: w.createdBy,
//           scheme: userMap[w.createdBy]?.scheme || "N/A",
//           winnings: [],
//           total: 0
//         };
//       }

//       billsMap[w.billNo].winnings.push({
//         number: w.number,
//         type: w.baseType,
//         winType: w.winType,
//         count: w.count,
//         winAmount: w.winAmount,
//         name: w.name
//       });

//       billsMap[w.billNo].total += w.winAmount;
//     }

//     const bills = Object.values(billsMap);
//     const grandTotal = bills.reduce((a, b) => a + b.total, 0);

//     return res.json({
//       fromDate,
//       toDate,
//       time,
//       agent: agent || "ALL",
//       grandTotal,
//       bills
//     });

//   } catch (err) {
//     console.error("❌ getWinningReport ERROR:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

const getWinningReport = async (req, res) => {
  try {
    const { fromDate, toDate, time = "ALL", agent } = req.body;

    if (!fromDate || !toDate) {
      return res.status(400).json({ message: "fromDate and toDate are required" });
    }

    // 🔑 Cache key (request based)
    const cacheKey = `winningReport:${fromDate}:${toDate}:${time}:${agent || "ALL"}`;

    // ⚡ Check memory cache (Disabled for instant updates)
    // const cachedData = getCache(cacheKey);
    // if (cachedData) {
    //   console.log("⚡ Winning report from MEMORY cache");
    //   return res.json(cachedData);
    // }

    console.log("🐢 Winning report from MongoDB");

    /* ================================
       🔥 ORIGINAL WORKING LOGIC
       (UNCHANGED)
    ================================= */

    const users = await MainUser.find().select("username createdBy scheme");

    const userMap = {};
    users.forEach(u => userMap[u.username] = u);

    function getAllDescendants(username, visited = new Set()) {
      if (visited.has(username)) return [];
      visited.add(username);

      const children = users
        .filter(u => u.createdBy === username)
        .map(u => u.username);

      let all = [...children];
      children.forEach(c => {
        all = all.concat(getAllDescendants(c, visited));
      });
      return all;
    }

    const agentUsers = agent
      ? [agent, ...getAllDescendants(agent)]
      : users.map(u => u.username);

    const start = parseDateISTStart(fromDate);
    const end = parseDateISTEnd(toDate);

    const entryQuery = {
      createdBy: { $in: agentUsers },
      isValid: true,
      createdAt: { $gte: start, $lte: end },
    };

    if (time !== "ALL") {
      entryQuery.timeLabel = new RegExp(time, "i");
    }

    const entries = await Entry.find(entryQuery).lean();

    if (!entries.length) {
      const emptyResponse = { message: "No entries found", bills: [], grandTotal: 0 };
      // setCache(cacheKey, emptyResponse, 300);
      return res.json(emptyResponse);
    }

    const datesList = getDatesBetween(start, end).map(d => formatDateIST(d));

    const resultQuery = { date: { $in: datesList } };

    const normalizedTime = parseTimeValue(time);
    if (normalizedTime && time !== "ALL") {
      resultQuery.time = normalizedTime;
    }

    const results = await Result.find(resultQuery).lean();

    const resultsByTime = {};
    for (const r of results) {
      if (!resultsByTime[r.time]) resultsByTime[r.time] = [];
      resultsByTime[r.time].push(r);
    }

    function findDayResult(dateStr, timeLabel) {
      const t = parseTimeValue(timeLabel);
      const list = resultsByTime[t] || [];

      const found = list.find(r => formatDateIST(new Date(r.date)) === dateStr);
      if (!found) return null;

      return {
        "1": found.prizes?.[0] || null,
        "2": found.prizes?.[1] || null,
        "3": found.prizes?.[2] || null,
        "4": found.prizes?.[3] || null,
        "5": found.prizes?.[4] || null,
        others: (found.entries || []).map(e => e.result).filter(Boolean)
      };
    }

    // 🔍 1. Identify "Report Head" and their Scheme
    const headUsername = req.body.loggedInUser || agent;
    const reportHead = userMap[headUsername];
    const headScheme = reportHead?.scheme || "N/A";
    let activeTab = 1;
    if (headScheme.toUpperCase() !== "N/A") {
      activeTab = parseInt(headScheme.replace(/[^0-9]/g, ""), 10) || 1;
    }

    // 🔍 2. Fetch Scheme Data (Schema) for the Report Head
    // We fetch unique draw labels from entries to load specific schemes
    const uniqueTimeLabels = [...new Set(entries.map(e => e.timeLabel))];
    const schemeCacheInternal = {};

    for (const label of uniqueTimeLabels) {
      const normalizedLabel = summaryLabelMap[label] || label;
      const labelNoSpace = label.replace(/\s/g, '');
      const normNoSpace = normalizedLabel.replace(/\s/g, '');

      // Search for any draw that matches the spaced OR non-spaced labels
      const searchLabels = [...new Set([label, normalizedLabel, labelNoSpace, normNoSpace])];

      const data = await Schema.findOne(
        { activeTab, "draws.drawName": { $in: searchLabels } },
        { draws: { $elemMatch: { drawName: { $in: searchLabels } } } }
      ).lean();
      if (data) schemeCacheInternal[label] = data.draws[0];
    }

    const winningEntries = [];

    for (const e of entries) {
      const ds = formatDateIST(new Date(e.createdAt));
      const dayResult = findDayResult(ds, e.timeLabel);

      if (!dayResult) continue;

      // Use Report Head's specific scheme data for this draw
      const drawSchemeData = schemeCacheInternal[e.timeLabel];
      const winAmount = calculateWinAmount(e, dayResult, drawSchemeData);

      if (winAmount <= 0) continue;

      winningEntries.push({
        ...e,
        date: ds,
        winAmount,
        baseType: extractBaseType(e.type),
        winType: computeWinType(e, dayResult),
        name: e.name || "-"
      });
    }

    if (!winningEntries.length) {
      const emptyResponse = { message: "No winning entries found", bills: [], grandTotal: 0 };
      // setCache(cacheKey, emptyResponse, 300);
      return res.json(emptyResponse);
    }

    function getPath(username) {
      const path = [];
      let curr = userMap[username];
      while (curr && curr.createdBy) {
        path.unshift(curr.createdBy);
        curr = userMap[curr.createdBy];
      }
      return path;
    }

    const billsMap = {};

    for (const w of winningEntries) {
      if (!billsMap[w.billNo]) {
        billsMap[w.billNo] = {
          billNo: w.billNo,
          createdBy: w.createdBy,
          path: getPath(w.createdBy),
          scheme: headScheme, // Override to Report Head's scheme for frontend super calc
          drawName: w.timeLabel || "N/A",
          winnings: [],
          total: 0
        };
      }

      billsMap[w.billNo].winnings.push({
        number: w.number,
        type: w.baseType,
        winType: w.winType,
        count: w.count,
        winAmount: w.winAmount,
        name: w.name,
        drawName: w.timeLabel || "N/A" // Added drawName to winnings too just in case
      });

      billsMap[w.billNo].total += w.winAmount;
    }

    const bills = Object.values(billsMap);
    const grandTotal = bills.reduce((a, b) => a + b.total, 0);

    const response = {
      fromDate,
      toDate,
      time,
      agent: agent || "ALL",
      grandTotal,
      bills
    };

    // 💾 Cache FINAL correct response (Disabled for instant updates)
    // setCache(cacheKey, response, 300);

    return res.json(response);

  } catch (err) {
    console.error("❌ getWinningReport ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};



const normalizeDrawLabelLimit = (label) => {
  if (!label || typeof label !== 'string') return '';
  return label
    .toUpperCase()
    .replace(/\b(AM|PM)\b/g, '')
    .replace(/\s+/g, '')
    .trim();
};

async function getBlockTimeF(drawLabel, loggedInUserType) {
  if (!drawLabel || !loggedInUserType) return null;
  const records = await BlockTime.find({});
  // console.log('records=============', records)
  // console.log('drawLabel=============', drawLabel)
  // console.log('loggedInUserType=============', loggedInUserType)
  // Normalize incoming label to improve matching (e.g., "LSK 3 PM" -> "LSK3")


  const originalLabel = drawLabel;
  const normalizedLabel = normalizeDrawLabelLimit(drawLabel);

  let record = await BlockTime.findOne({ drawLabel: originalLabel, type: loggedInUserType });
  // let record2 = await BlockTime.find({});
  // console.log('record2=============', record2);
  // console.log('record=============', normalizedLabel)

  if (!record) {
    // Try normalized (space/AM/PM removed, uppercased)
    record = await BlockTime.findOne({ drawLabel: normalizedLabel, type: loggedInUserType });
  }

  if (!record) {
    // Fallback to case-insensitive exact match on normalized form
    const escaped = normalizedLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    record = await BlockTime.findOne({ drawLabel: { $regex: `^${escaped}$`, $options: 'i' }, type: loggedInUserType });
  }

  if (!record) return null;
  // console.log('record=============', record)
  return {
    blockTime: record.blockTime,
    unblockTime: record.unblockTime
  };
}
const getTicketLimits = async () => {
  try {
    const latest = await TicketLimit.findOne().sort({ _id: -1 }); // latest record
    if (!latest) {
      return null
    } else {
      return latest
    }
  } catch (err) {
    console.log("sssssssssss", err);
    return null

  }
};

// Helper: get existing usage totals from DailyLimitUsage for provided keys
const countByUsageF = async (date, keys) => {
  try {
    if (!Array.isArray(keys) || !date) {
      throw new Error('Missing required fields');
    }

    // keys are already in format TYPE-NUMBER, e.g., BOX-101
    const typeNumberPairs = keys.map((key) => {
      const parts = key.split('-');
      const number = parts.pop(); // last part is number
      const type = parts.join('-').toUpperCase(); // rest is type
      return { type, number, key };
    });

    // Fetch all DailyLimitUsage docs for this date and these type-number combos
    const docs = await DailyLimitUsage.find({
      date,
      $or: typeNumberPairs.map((t) => ({ type: t.type, number: t.number }))
    }).lean();

    // console.log('docs=============', docs)
    // console.log('typeNumberPairs=============', typeNumberPairs)
    const map = {};
    typeNumberPairs.forEach(({ type, number, key }) => {
      const hit = docs.find((d) => d.type === type && d.number === number);
      if (hit && typeof hit.remaining === 'number') {
        map[key] = { remaining: hit.remaining };
      } else {
        map[key] = { remaining: null }; // no record yet → full limit will be used
      }
    });
    // console.log('map=============', map)
    return map;
  } catch (err) {
    console.error('❌ countByUsageF error:', err);
    throw err;
  }
};

const countByUserUsageF = async (date, user, keys) => {
  try {
    if (!Array.isArray(keys) || !date || !user) {
      throw new Error('Missing required fields');
    }

    // keys are already in format TYPE-NUMBER, e.g., BOX-101
    const typeNumberPairs = keys.map((key) => {
      const parts = key.split('-');
      const number = parts.pop(); // last part is number
      const type = parts.join('-').toUpperCase(); // rest is type
      return { type, number, key };
    });

    // Fetch all DailyUserLimit docs for this user/date/type-number combos
    const docs = await DailyUserLimit.find({
      date,
      user,
      $or: typeNumberPairs.map(t => ({ type: t.type, number: t.number }))
    }).lean();

    const map = {};
    typeNumberPairs.forEach(({ type, number, key }) => {
      const hit = docs.find(d => d.type === type && d.number === number);
      if (hit && typeof hit.remaining === 'number') {
        map[key] = { remaining: hit.remaining };
      } else {
        map[key] = { remaining: null }; // no record yet → full limit will be used
      }
    });

    return map;

  } catch (err) {
    console.error('❌ countByUserUsageF error:', err);
    throw err;
  }
};
// Helper function (NOT Express handler anymore)
const countByNumberF = async (date, timeLabel, keys) => {
  try {
    if (!Array.isArray(keys) || !date || !timeLabel) {
      throw new Error("Missing required fields");
    }

    // Normalize type helper
    const normalizeType = (rawType) => {
      if (rawType.toUpperCase().includes("SUPER")) return "SUPER";
      const parts = rawType.split("-");
      return parts.length > 1
        ? parts[parts.length - 2].toUpperCase()
        : parts[0].toUpperCase();
    };

    // Prepare match conditions
    const matchConditions = keys.map((key) => {
      const parts = key.split("-");
      const number = parts[parts.length - 1];
      const type = normalizeType(key);
      return {
        number,
        type: { $regex: `^${type}$`, $options: "i" },
        timeLabel,
      };
    });

    // Build start/end of day range for Date-typed 'date' field (IST)
    const start = parseDateISTStart(date);
    const end = parseDateISTEnd(date);

    // Run aggregation with date range
    const results = await Entry.aggregate([
      {
        $match: {
          $and: [
            { date: { $gte: start, $lte: end } },
            { $or: matchConditions },
          ],
        },
      },
      {
        $group: {
          _id: { type: "$type", number: "$number" },
          total: { $sum: "$count" },
        },
      },
    ]);

    // Build count map
    const countMap = {};
    keys.forEach((key) => {
      const parts = key.split("-");
      const number = parts[parts.length - 1];
      const type = normalizeType(key);
      countMap[`${type}-${number}`] = 0;
    });

    results.forEach((item) => {
      const type = normalizeType(item._id.type);
      const number = item._id.number;
      const key = `${type}-${number}`;
      countMap[key] = item.total;
    });

    return countMap;
  } catch (err) {
    console.error("❌ countByNumber error:", err);
    throw err;
  }
};
const getPermutationsF = (str) => {
  if (str.length <= 1) return [str];
  const result = new Set();
  const permute = (arr, m = '') => {
    if (arr.length === 0) {
      result.add(m);
    } else {
      for (let i = 0; i < arr.length; i++) {
        const copy = arr.slice();
        const next = copy.splice(i, 1);
        permute(copy, m + next);
      }
    }
  };
  permute(str.split(''));
  return Array.from(result);
};

// Pure function, no req/res
const addEntriesF = async ({ entries, timeLabel, timeCode, selectedAgent, createdBy, toggleCount, date }) => {
  if (!entries || entries.length === 0) {
    throw new Error("No entries provided");
  }
  if (!date) {
    throw new Error("Date is required");
  }

  const billNo = await getNextBillNumber();
  const normCreatedBy = normalizeName(createdBy);
  const activeSeller = normalizeName(selectedAgent) || normCreatedBy;

  // 🟢 Fetch RateMaster for the active seller and draw (with fallback to 'All')
  const normalizedDraw = summaryLabelMap[timeLabel] || timeLabel;
  const rateMaster = await RateMaster.findOne({
    user: activeSeller,
    draw: { $in: [normalizedDraw, "All"] }
  }).sort({ draw: -1 }); // Specific draw > "All"

  const rateLookup = {};
  (rateMaster?.rates || []).forEach(r => {
    const key = (r.label || r.name || "").toUpperCase();
    if (key) {
      rateLookup[key] = Number(r.rate);
    }
  });

  console.log(`📝 [addEntriesF] Rate lookup for ${activeSeller} on ${timeLabel}:`, JSON.stringify(rateLookup));

  const toSave = entries.map((e) => {
    // Robust extraction of betType (SUPER, BOX, etc.)
    const betType = extractBaseType(e.type);

    const sellerRate = rateLookup[betType] ?? getRateForType(betType);

    // 🔴 FORCING backend calculation to ensure RateMaster is respected
    const calculatedTotalRate = (Number(e.count) * sellerRate).toFixed(2);

    return {
      ...e,
      rate: calculatedTotalRate,
      timeLabel,
      timeCode,
      createdBy: activeSeller,
      billNo,
      toggleCount,
      createdAt: new Date(),
      date: new Date(date),
    };
  });
  await Entry.insertMany(toSave);

  return { message: "Entries saved successfully", billNo };
};

const saveValidEntries = async (req, res) => {
  try {
    const { entries, timeLabel, timeCode, selectedAgent, createdBy, toggleCount, loggedInUserType, loggedInUser } = req.body;
    // console.log('req.body;============', req.body)
    if (!entries || entries.length === 0) {
      return res.status(400).json({ message: 'No entries provided' });
    }
    const now = new Date();
    const todayStr = formatDateIST(now);
    const normalizedLabel = normalizeDrawLabelLimit(timeLabel);
    // console.log('normalizedLabel==============', normalizedLabel);
    // 1️⃣ Get block/unblock time
    const blockTimeData = await getBlockTimeF(timeLabel, loggedInUserType);
    if (!blockTimeData) {
      return res.status(400).json({ message: `No block time configuration found for draw: ${timeLabel}` });
    }
    const { blockTime, unblockTime } = blockTimeData;
    if (!blockTime || !unblockTime) return res.status(400).json({ message: 'Block or unblock time missing' });

    const [bh, bm] = blockTime.split(':').map(Number);
    const [uh, um] = unblockTime.split(':').map(Number);

    const block = new Date(now.getFullYear(), now.getMonth(), now.getDate(), bh, bm);
    const unblock = new Date(now.getFullYear(), now.getMonth(), now.getDate(), uh, um);

    if (now >= block && now < unblock) {
      return res.status(403).json({ message: 'Entry time is blocked for this draw' });
    }

    // Decide target date: after unblock -> next day, else today
    const targetDateObj = new Date(now);
    if (now >= unblock) {
      targetDateObj.setDate(targetDateObj.getDate() + 1);
    }
    const targetDateStr = formatDateIST(targetDateObj);

    // 2️⃣ Check Blocked Date for the target date
    const blockedDates = await BlockDate.findOne({ date: targetDateStr, ticket: normalizedLabel });
    if (blockedDates) {
      return res.status(400).json({ message: `Entries are blocked for ${targetDateStr} for this ticket.` });
    }

    // 3️⃣ Fetch ticket limits
    const limits = await getTicketLimits();
    if (!limits) {
      return res.status(400).json({ message: 'No ticket limits configuration found. Please set up ticket limits first.' });
    }
    const allLimits = { ...limits.group1, ...limits.group2, ...limits.group3 };

    // 3️⃣ Expansion Logic (Range & Set)
    const expandedEntries = [];
    for (const entry of entries) {
      if (entry.rangeStart !== undefined && entry.rangeEnd !== undefined) {
        // Expand range
        const start = parseInt(entry.rangeStart, 10);
        const end = parseInt(entry.rangeEnd, 10);
        const width = entry.toggleCount === 1 ? 1 : entry.toggleCount === 2 ? 2 : 3;

        for (let i = start; i <= end; i++) {
          const numStr = String(i).padStart(width, '0');
          if (entry.isSet) {
            const perms = getPermutationsF(numStr);
            perms.forEach(p => expandedEntries.push({ ...entry, number: p }));
          } else {
            expandedEntries.push({ ...entry, number: numStr });
          }
        }
      } else if (entry.isSet && entry.number) {
        // Expand permutations for a single number
        const perms = getPermutationsF(entry.number);
        perms.forEach(p => expandedEntries.push({ ...entry, number: p }));
      } else {
        expandedEntries.push(entry);
      }
    }

    // 4️⃣ Sum counts per type-number for new entries
    const newTotalByNumberType = {};
    expandedEntries.forEach((entry) => {
      const rawType = entry.type.replace(timeCode, '').replace(/-/g, '').toUpperCase();
      const key = `${rawType}-${entry.number}`;
      newTotalByNumberType[key] = (newTotalByNumberType[key] || 0) + (entry.count || 1);
    });

    // 5️⃣ Fetch remaining from DailyLimitUsage
    const keys = Object.keys(newTotalByNumberType);
    const remainingMap = await countByUsageF(targetDateStr, keys);

    // 6️⃣ Validate entries
    const validEntries = [];
    const exceededEntries = [];

    for (const entry of expandedEntries) {
      const count = entry.count || 1;
      const rawType = entry.type.replace(timeCode, '').replace(/-/g, '').toUpperCase();
      const number = entry.number;
      const key = `${rawType}-${number}`;

      const maxLimit = parseInt(allLimits[rawType] || '9999', 10);
      const remainingFromDb = remainingMap[key]?.remaining;
      const allowedCount = typeof remainingFromDb === 'number'
        ? remainingFromDb
        : maxLimit;

      if (allowedCount <= 0) {
        exceededEntries.push({ key, attempted: count, limit: maxLimit, existing: maxLimit - allowedCount, added: 0 });
        continue;
      }

      if (count <= allowedCount) {
        validEntries.push(entry);
      } else {
        validEntries.push({ ...entry, count: allowedCount });
        exceededEntries.push({ key, attempted: count, limit: maxLimit, existing: maxLimit - allowedCount, added: allowedCount });
      }
    }
    // console.log('exceededEntries=============', exceededEntries)

    if (validEntries.length === 0) {
      // return res.status(400).json({ message: 'All entries exceed allowed limits', exceeded: exceededEntries });
      const humanLines = exceededEntries.map(e => `${e.key} → attempted ${e.attempted}, remaining 0`);
      const humanMessage = ['Daily limit reached for:', ...humanLines, '', 'Nothing was saved. Reduce the count and try again.'].join('\n');
      return res.status(400).json({ message: humanMessage });
    }

    if (exceededEntries.length > 0) {
      const humanLines = exceededEntries.map(e => `${e.key} → attempted ${e.attempted}, remaining ${Math.max(0, (e.limit || 0) - (e.existing || 0))}`);
      const humanMessage = ['Daily limit reached for:', ...humanLines, '', 'Nothing was saved. Reduce the count and try again.'].join('\n');
      return res.status(400).json({ message: humanMessage });
    }


    const blockedNumbersExceeded = [];

    // 7️⃣ Enforce strict per-user BlockNumber limit
    for (const entry of validEntries) {
      const rawTypes = await extractBaseType(entry.type)
      const rawTime = await extractBetTypeTime(entry.type)
      const number = entry.number;
      // const block = await BlockNumber.find({createdBy:'4',field:rawTypes});
      // console.log('block=============', block);
      // console.log('block=============', entry)
      // console.log('block=============', rawTypes);
      // console.log('block=============', rawTime)


      const blocked = await BlockNumber.findOne({
        field: rawTypes,
        number,
        drawTime: rawTime,
        createdBy: loggedInUser, // the agent/user whose limit we check
        isActive: true,
      });
      // console.log('block=============', blocked)
      if (blocked && blocked.count < entry.count) {
        blockedNumbersExceeded.push({
          key: `${rawTypes}-${number}`,
          attempted: entry.count,
          remaining: blocked.count
        });
      }
    }

    if (blockedNumbersExceeded.length > 0) {
      // console.log('blockedNumbersExceeded', blockedNumbersExceeded)
      const message = blockedNumbersExceeded.map(e => `${e.key} → attempted ${e.attempted}, allowed ${e.remaining}`).join('\n');
      return res.status(400).json({ message: 'User limit exceeded:\n' + message });
    }

    // Fetch per-user remaining
    const userRemainingMap = await countByUserUsageF(targetDateStr, loggedInUser, keys);
    // console.log('userRemainingMap====', userRemainingMap)

    // Check per-user daily limit
    // Check per-user daily limit based on BlockNumber
    const userExceededEntries = [];

    for (const entry of validEntries) {
      const rawTypes = await extractBaseType(entry.type);
      const rawTime = await extractBetTypeTime(entry.type);
      const number = entry.number;

      // Fetch the per-user block number limit
      const block = await BlockNumber.findOne({
        field: rawTypes,
        number,
        drawTime: rawTime,
        createdBy: loggedInUser,
        isActive: true,
      });

      const maxLimit = block?.count ?? parseInt(allLimits[rawTypes] || '9999', 10); // fallback to general limit
      const remainingFromDb = typeof userRemainingMap[`${rawTypes}-${number}`]?.remaining === 'number'
        ? userRemainingMap[`${rawTypes}-${number}`].remaining
        : maxLimit;

      // console.log('userRemainingMap====', remainingFromDb)
      if (entry.count > remainingFromDb) {
        userExceededEntries.push({
          key: `${rawTypes}-${number}`,
          attempted: entry.count,
          remaining: remainingFromDb
        });
      }
    }
    if (userExceededEntries.length > 0) {
      const humanLines = userExceededEntries.map(e => `${e.key} → attempted ${e.attempted}, remaining ${e.remaining}`);
      const humanMessage = ['User daily limit reached for:', ...humanLines, '', 'Nothing was saved. Reduce the count and try again.'].join('\n');
      return res.status(400).json({ message: humanMessage });
    }


    /* =========================================
       🛡️ CREDIT LIMIT ENFORCEMENT
       ========================================== */
    const lookupLabel = normalizeDrawLabel(timeLabel);
    const userLimitDoc = await UserAmount.findOne({
      toUser: createdBy,
      $or: [{ drawTime: lookupLabel }, { drawTime: "ALL" }]
    }).sort({ drawTime: -1 }); // Priority: Specific Draw > ALL

    if (userLimitDoc) {
      const limit = userLimitDoc.amount;

      // Calculate current batch total
      const currentBatchTotal = validEntries.reduce((sum, e) => {
        const rate = e.rate || (e?.total || (e.number.length === 1 ? 12 : 10) * e.count);
        return sum + Number(rate);
      }, 0);

      // Calculate total sales already submitted today for this draw
      // Normalize labels to catch both "LSK 3 PM" and "KERALA 3 PM"
      const labelsToCheck = [timeLabel];
      if (timeLabel === "LSK 3 PM") labelsToCheck.push("KERALA 3 PM");
      if (timeLabel === "KERALA 3 PM") labelsToCheck.push("LSK 3 PM");

      const startOfDay = parseDateISTStart(targetDateStr);
      const endOfDay = parseDateISTEnd(targetDateStr);

      const existingEntries = await Entry.find({
        createdBy,
        date: { $gte: startOfDay, $lte: endOfDay },
        timeLabel: { $in: labelsToCheck }
      });

      const totalAlreadySold = existingEntries.reduce((sum, e) => sum + (Number(e.rate) || 0), 0);

      if (totalAlreadySold + currentBatchTotal > limit) {
        return res.status(400).json({
          message: `Credit limit exceeded for ${timeLabel}.`,
          details: {
            limit,
            alreadySold: totalAlreadySold.toFixed(2),
            currentAttempt: currentBatchTotal.toFixed(2),
            shortfall: (totalAlreadySold + currentBatchTotal - limit).toFixed(2)
          }
        });
      }
    }

    const savedBill = await addEntriesF({
      entries: validEntries,
      timeLabel,
      timeCode,
      selectedAgent,
      createdBy,
      toggleCount,
      date: targetDateStr
    });
    // console.log('savedBill', savedBill)

    // 8️⃣ Upsert DailyLimitUsage remaining per (date,type,number)
    // We must decrement remaining by saved counts, initializing with TicketLimit on first write
    // const usageByType = {};
    // validEntries.forEach((e) => {
    //   const rawType = e.type.replace(timeCode, '').replace(/-/g, '').toUpperCase();
    //   usageByType[rawType] = (usageByType[rawType] || 0) + (e.count || 1);
    // });
    const usageByTypeNumber = {};
    validEntries.forEach((e) => {
      const rawType = e.type.replace(timeCode, '').replace(/-/g, '').toUpperCase();
      const number = e.number;
      const key = `${rawType}-${number}`;
      usageByTypeNumber[key] = (usageByTypeNumber[key] || 0) + (e.count || 1);
    });

    // const ops = Object.entries(usageByType).map(([t, used]) => {
    //   const max = parseInt(allLimits[t] || '9999', 10);
    //   return {
    //     updateOne: {
    //       filter: { date: targetDateStr, type: t },
    //       update: [
    //         {
    //           $set: {
    //             remaining: {
    //               $let: {
    //                 vars: { curr: "$remaining" },
    //                 in: {
    //                   $max: [0, { $subtract: [{ $ifNull: ["$$curr", max] }, used] }]
    //                 }
    //               }
    //             }
    //           }
    //         }
    //       ],
    //       upsert: true,
    //     }
    //   };
    // });
    const ops = Object.entries(usageByTypeNumber).map(([key, used]) => {
      const [rawType, number] = key.split('-');
      const max = parseInt(allLimits[rawType] || '9999', 10);
      return {
        updateOne: {
          filter: { date: targetDateStr, type: rawType, number },
          update: [
            {
              $set: {
                remaining: {
                  $let: {
                    vars: { curr: "$remaining" },
                    in: { $max: [0, { $subtract: [{ $ifNull: ["$$curr", max] }, used] }] }
                  }
                }
              }
            }
          ],
          upsert: true
        }
      };
    });

    if (ops.length > 0) {
      await DailyLimitUsage.bulkWrite(ops);
    }

    // Per-user daily limit update
    // Build per-user usage operations strictly using BlockNumber limits
    const userOps = await Promise.all(
      validEntries.map(async (entry) => {
        const rawType = await extractBaseType(entry.type);
        const rawTime = await extractBetTypeTime(entry.type);
        const number = entry.number;
        const count = entry.count || 1;

        // Get the strict per-user BlockNumber limit
        const block = await BlockNumber.findOne({
          field: rawType,
          number,
          drawTime: rawTime,
          createdBy: loggedInUser,
          isActive: true
        });

        const max = block?.count ?? parseInt(allLimits[rawType] || '9999', 10);

        return {
          updateOne: {
            filter: { date: targetDateStr, user: loggedInUser, type: rawType, number },
            update: [
              {
                $set: {
                  remaining: {
                    $let: {
                      vars: { curr: '$remaining' },
                      in: { $max: [0, { $subtract: [{ $ifNull: ['$$curr', max] }, count] }] },
                    },
                  },
                },
              },
            ],
            upsert: true,
          },
        };
      })
    );

    if (userOps.length > 0) await DailyUserLimit.bulkWrite(userOps);
    // 1️⃣1️⃣ Update SalesReportSummary Automatically
    try {
      const summaryUser = selectedAgent || createdBy || loggedInUser;
      // Pass validEntries to the helper for aggregation (using transaction date todayStr)
      await updateAutomaticSummary(summaryUser, todayStr, timeLabel, timeCode, validEntries);

      // 1️⃣2️⃣ Clear local entries cache to ensure reports show fresh data
      entriesCache.clear();
    } catch (summaryErr) {
      console.error("❌ Error updating SalesReportSummary:", summaryErr);
    }


    return res.json({ billNo: savedBill.billNo, exceeded: [] });

  } catch (err) {
    console.error('Error saving entries:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
// const saveValidEntries = async (req, res) => {
//   try {
//     const {
//       entries,
//       timeLabel,
//       timeCode,
//       selectedAgent,
//       createdBy,
//       toggleCount,
//       loggedInUserType,
//       loggedInUser
//     } = req.body;

//     if (!entries || entries.length === 0) {
//       return res.status(400).json({ message: 'No entries provided' });
//     }

//     const now = new Date();
//     const todayStr = now.toISOString().split('T')[0];
//     const normalizedLabel = normalizeDrawLabelLimit(timeLabel);

//     // 1️⃣ Check blocked date
//     const blockedDates = await BlockDate.findOne({ date: todayStr, ticket: normalizedLabel });
//     if (blockedDates) {
//       return res.status(400).json({ message: 'Today is blocked for this ticket' });
//     }

//     // 2️⃣ Get block/unblock times
//     const blockTimeData = await getBlockTimeF(timeLabel, loggedInUserType);
//     if (!blockTimeData || !blockTimeData.blockTime || !blockTimeData.unblockTime) {
//       return res.status(400).json({ message: `No block time configuration found for draw: ${timeLabel}` });
//     }

//     const { blockTime, unblockTime } = blockTimeData;
//     const [bh, bm] = blockTime.split(':').map(Number);
//     const [uh, um] = unblockTime.split(':').map(Number);
//     const block = new Date(now.getFullYear(), now.getMonth(), now.getDate(), bh, bm);
//     const unblock = new Date(now.getFullYear(), now.getMonth(), now.getDate(), uh, um);

//     if (now >= block && now < unblock) {
//       return res.status(403).json({ message: 'Entry time is blocked for this draw' });
//     }

//     // Target date after unblock
//     const targetDateObj = new Date(now);
//     if (now >= unblock) targetDateObj.setDate(targetDateObj.getDate() + 1);
//     const targetDateStr = targetDateObj.toISOString().split('T')[0];

//     // 3️⃣ Fetch ticket limits
//     const limits = await getTicketLimits();
//     if (!limits) {
//       return res.status(400).json({ message: 'No ticket limits configured. Set up ticket limits first.' });
//     }
//     const allLimits = { ...limits.group1, ...limits.group2, ...limits.group3 };

//     // 4️⃣ Sum counts per type-number for new entries
//     const newTotalByNumberType = {};
//     entries.forEach((entry) => {
//       const rawType = entry.type.replace(timeCode, '').replace(/-/g, '').toUpperCase();
//       const key = `${rawType}-${entry.number}`;
//       newTotalByNumberType[key] = (newTotalByNumberType[key] || 0) + (entry.count || 1);
//     });

//     // 5️⃣ Fetch remaining from DailyLimitUsage
//     const keys = Object.keys(newTotalByNumberType);
//     const remainingMap = await countByUsageF(targetDateStr, keys,allLimits); // returns { 'TYPE-NUMBER': { remaining: X } }

//     // 6️⃣ Validate daily limits
//     const validEntries = [];
//     const exceededEntries = [];
//     for (const entry of entries) {
//       const count = entry.count || 1;
//       const rawType = entry.type.replace(timeCode, '').replace(/-/g, '').toUpperCase();
//       const number = entry.number;
//       const key = `${rawType}-${number}`;
//       const maxLimit = parseInt(allLimits[rawType] || '9999', 10);
//       const remainingFromDb = remainingMap[key]?.remaining;
//       const allowedCount = Number.isInteger(remainingFromDb) ? remainingFromDb : maxLimit;

//       if (allowedCount <= 0) {
//         exceededEntries.push({ key, attempted: count, limit: maxLimit, existing: maxLimit - allowedCount, added: 0 });
//         continue;
//       }

//       if (count <= allowedCount) validEntries.push(entry);
//       else {
//         validEntries.push({ ...entry, count: allowedCount });
//         exceededEntries.push({ key, attempted: count, limit: maxLimit, existing: maxLimit - allowedCount, added: allowedCount });
//       }
//     }

//     if (validEntries.length === 0) {
//       const humanLines = exceededEntries.map(e => `${e.key} → attempted ${e.attempted}, remaining 0`);
//       const humanMessage = ['Daily limit reached for:', ...humanLines, '', 'Nothing was saved. Reduce the count and try again.'].join('\n');
//       return res.status(400).json({ message: humanMessage });
//     } 

//     // 7️⃣ Enforce strict per-user BlockNumber limit
//     const exceededUserEntries = [];
//     for (const entry of validEntries) {
//       const rawType = entry.type.replace(timeCode, '').replace(/-/g, '').toUpperCase();
//       const number = entry.number;

//       const blocked = await BlockNumber.findOne({
//         field: rawType,
//         number,
//         drawTime: timeLabel,
//         createdBy, // the agent/user whose limit we check
//         isActive: true,
//       });

//       if (blocked && blocked.count < entry.count) {
//         exceededUserEntries.push({
//           key: `${rawType}-${number}`,
//           attempted: entry.count,
//           remaining: blocked.count
//         });
//       }
//     }

//     if (exceededUserEntries.length > 0) {
//       const message = exceededUserEntries.map(e => `${e.key} → attempted ${e.attempted}, allowed ${e.remaining}`).join('\n');
//       return res.status(400).json({ message: 'User limit exceeded:\n' + message });
//     }

//     // 8️⃣ Save entries
//     const savedBill = await addEntriesF({
//       entries: validEntries,
//       timeLabel,
//       timeCode,
//       selectedAgent,
//       createdBy,
//       toggleCount,
//       date: targetDateStr
//     });

//     // 9️⃣ Update DailyLimitUsage
//     const usageOps = {};
//     validEntries.forEach(e => {
//       const rawType = e.type.replace(timeCode, '').replace(/-/g, '').toUpperCase();
//       const number = e.number;
//       const key = `${rawType}-${number}`;
//       usageOps[key] = (usageOps[key] || 0) + (e.count || 1);
//     });

//     const bulkOps = Object.entries(usageOps).map(([key, used]) => {
//       const [rawType, number] = key.split('-');
//       const max = parseInt(allLimits[rawType] || '9999', 10);
//       return {
//         updateOne: {
//           filter: { date: targetDateStr, type: rawType, number },
//           update: [{ $set: { remaining: { $let: { vars: { curr: '$remaining' }, in: { $max: [0, { $subtract: [{ $ifNull: ['$$curr', max] }, used] }] } } } } }],
//           upsert: true
//         }
//       };
//     });

//     if (bulkOps.length > 0) await DailyLimitUsage.bulkWrite(bulkOps);

//     // 10️⃣ Update DailyUserLimit
//     const userOps = Object.entries(usageOps).map(([key, used]) => {
//       const [rawType, number] = key.split('-');
//       const max = parseInt(allLimits[rawType] || '9999', 10);
//       return {
//         updateOne: {
//           filter: { date: targetDateStr, user: loggedInUser, type: rawType, number },
//           update: [{ $set: { remaining: { $let: { vars: { curr: '$remaining' }, in: { $max: [0, { $subtract: [{ $ifNull: ['$$curr', max] }, used] }] } } } } }],
//           upsert: true
//         }
//       };
//     });

//     if (userOps.length > 0) await DailyUserLimit.bulkWrite(userOps);

//     return res.json({ billNo: savedBill.billNo, exceeded: [] });

//   } catch (err) {
//     console.error('Error saving entries:', err);
//     return res.status(500).json({ message: 'Internal server error' });
//   }
// };
// 🆕 New endpoint: Sales Report
// const getSalesReport = async (req, res) => {
//   try {
//     const { fromDate, toDate, createdBy, timeLabel, loggedInUser } = req.query;

//     // console.log("📥 getSalesReport request:", req.query);

//     // 1️⃣ Build agent list (loggedInUser or createdBy + descendants)
//     const allUsers = await MainUser.find().select("username createdBy");
//     let agentList = [];
//     if (!createdBy) {
//       agentList = [loggedInUser, ...getDescendants(loggedInUser, allUsers)];
//     } else {
//       agentList = [createdBy, ...getDescendants(createdBy, allUsers)];
//     }
//     // console.log("👥 Agent Users (backend):", agentList);

//     // 2️⃣ Build query for entries
//     const entryQuery = {
//       createdBy: { $in: agentList },
//       date: { $gte: new Date(fromDate), $lte: new Date(toDate) },
//     };
//     if (timeLabel && timeLabel !== "all") {
//       entryQuery.timeLabel = timeLabel;
//     }

//     const entries = await Entry.find(entryQuery);
//     const last10Entries = await Entry.find({}).sort({ _id: -1 }).limit(2);
//     // console.log("entrie===========11", entryQuery)
//     // console.log("entrie===========12", last10Entries)
//     // console.log("entrie===========13", entries);
//     // console.log("📝 Entries fetched (backend):", entries.length);
//     // if (entries.length > 0) console.log("🔹 Example entry:", entries[0]);

//     // 3️⃣ Fetch RateMaster for each draw
//     const userForRate = loggedInUser;

//     // console.log('userForRate===========', userForRate)
//     // console.log('timeLabel===========', timeLabel)

//     // Get unique draws from entries
//     const uniqueDraws = [...new Set(entries.map(entry => entry.timeLabel))];
//     // console.log('uniqueDraws===========', uniqueDraws);

//     // Fetch rate masters for each draw
//     const rateMastersByDraw = {};
//     for (const draw of uniqueDraws) {
//       let rateMasterQuery = { user: userForRate };

//       if (draw === "LSK 3 PM") {
//         rateMasterQuery.draw = "KERALA 3 PM";
//       } else {
//         rateMasterQuery.draw = draw;
//       }

//       // console.log(`rateMasterQuery for ${draw}:`, rateMasterQuery);
//       const rateMaster = await RateMaster.findOne(rateMasterQuery);
//       // console.log(`rateMaster for ${draw}:`, rateMaster);

//       const rateLookup = {};
//       (rateMaster?.rates || []).forEach(r => {
//         rateLookup[r.label] = Number(r.rate) || 10;
//       });
//       rateMastersByDraw[draw] = rateLookup;
//     }

//     // console.log("💰 Rate masters by draw:", rateMastersByDraw);

//     // Helper: extract bet type
//     const extractBetType = (typeStr) => {
//       // console.log('typeStr', typeStr);
//       if (!typeStr) return "SUPER";

//       // Handle different patterns: LSK3SUPER, D-1-A, etc.
//       if (typeStr.toUpperCase().includes("SUPER")) {
//         return "SUPER";
//       } else if (typeStr.toUpperCase().includes("BOX")) {
//         return "BOX";
//       } else if (typeStr.toUpperCase().includes("AB")) {
//         return "AB";
//       } else if (typeStr.toUpperCase().includes("BC")) {
//         return "BC";
//       } else if (typeStr.toUpperCase().includes("AC")) {
//         return "AC";
//       } else if (typeStr.includes("-A") || typeStr.endsWith("A")) {
//         return "A";
//       } else if (typeStr.includes("-B") || typeStr.endsWith("B")) {
//         return "B";
//       } else if (typeStr.includes("-C") || typeStr.endsWith("C")) {
//         return "C";
//       }

//       // Fallback: extract from parts
//       const parts = typeStr.split("-");
//       return parts[parts.length - 1];
//     };

//     // 4️⃣ Calculate totals
//     let totalCount = 0;
//     let totalSales = 0;

//     entries.forEach(entry => {
//       const count = Number(entry.count) || 0;
//       const betType = extractBetType(entry.type);
//       const draw = entry.timeLabel;
//       const rateLookup = rateMastersByDraw[draw] || {};
//       const rate = rateLookup[betType] ?? 10;

//       // console.log(`Entry: ${entry.type}, Draw: ${draw}, BetType: ${betType}, Rate: ${rate}, Count: ${count}`);

//       totalCount += count;
//       totalSales += count * rate;
//       entry.rate = count * rate;
//     });

//     // 5️⃣ Build optional per-agent summary
//     const perAgentMap = {};
//     entries.forEach((entry) => {
//       const agent = entry.createdBy || "unknown";
//       if (!perAgentMap[agent]) {
//         perAgentMap[agent] = { agent, count: 0, amount: 0 };
//       }
//       perAgentMap[agent].count += Number(entry.count) || 0;
//       perAgentMap[agent].amount += Number(entry.rate) || 0;
//     });
//     const byAgent = Object.values(perAgentMap).sort((a, b) => b.amount - a.amount);

//     const report = {
//       count: totalCount,
//       amount: totalSales,
//       date: `${fromDate} to ${toDate} (${timeLabel || "all"})`,
//       fromDate,
//       toDate,
//       createdBy,
//       timeLabel,
//       entries,
//       byAgent,
//     };

//     // console.log("✅ Final Sales Report (backend):", report);
//     res.json(report);

//   } catch (err) {
//     console.error("❌ Error in getSalesReport:", err);
//     res.status(500).json({ error: err.message });
//   }
// };


// In-memory controlled cache
// Key: `${loggedInUser}-${createdBy}-${fromDate}-${toDate}-${timeLabel}`
// Value: report object
// Value: report object
const reportCache = new Map();

// --- Helper to get all descendants ---
function getDescendants(username, allUsers) {
  const normUsername = normalizeName(username);
  const descendants = [];
  const stack = [normUsername];
  while (stack.length) {
    const current = stack.pop();
    const children = allUsers.filter(u => normalizeName(u.createdBy) === current);
    children.forEach(c => {
      const normChild = normalizeName(c.username);
      descendants.push(normChild);
      stack.push(normChild);
    });
  }
  return descendants;
}

// --- Helper to get bet type ---

// --- Main function ---
// const getSalesReport = async (req, res) => {
//   try {
//     const { fromDate, toDate, createdBy, timeLabel, loggedInUser } = req.query;

//     // --- Step 0: Build controlled cache key ---
//     const cacheKey = `${loggedInUser}-${createdBy || 'all'}-${fromDate}-${toDate}-${timeLabel || 'all'}`;
//     if (reportCache.has(cacheKey)) {
//       console.log('📦 Returning cached report for', cacheKey);
//       return res.json(reportCache.get(cacheKey));
//     }

//     // --- Step 1: Build agent list ---
//     const allUsers = await MainUser.find().select("username createdBy");
//     const agentList = createdBy
//       ? [createdBy, ...getDescendants(createdBy, allUsers)]
//       : [loggedInUser, ...getDescendants(loggedInUser, allUsers)];

//     // --- Step 2: Fetch entries ---
//     const start = parseDateISTStart(fromDate);
//     const end = parseDateISTEnd(toDate);
//     const entryQuery = {
//       createdBy: { $in: agentList },
//       createdAt: { $gte: start, $lte: end },
//       isValid: true,
//     };
//     if (timeLabel && timeLabel !== "all") entryQuery.timeLabel = timeLabel;

//     const entries = await Entry.find(entryQuery);

//     // --- Step 3: Fetch rate masters ---
//     const userForRate = loggedInUser;
//     const uniqueDraws = [...new Set(entries.map(e => e.timeLabel))];
//     const rateMastersByDraw = {};

//     for (const draw of uniqueDraws) {
//       const rateMasterQuery = { user: userForRate, draw: draw === "LSK 3 PM" ? "KERALA 3 PM" : draw };
//       const rateMaster = await RateMaster.findOne(rateMasterQuery);

//       const rateLookup = {};
//       (rateMaster?.rates || []).forEach(r => {
//         rateLookup[r.name || r.label] = Number(r.rate) || 10;
//       });
//       rateMastersByDraw[draw] = rateLookup;
//     }

//     // --- Step 4: Calculate totals ---
//     let totalCount = 0;
//     let totalSales = 0;
//     entries.forEach(entry => {
//       const count = Number(entry.count) || 0;
//       const betType = getBetType(entry.type);
//       const draw = entry.timeLabel;
//       const rate = rateMastersByDraw[draw]?.[betType] ?? 10;

//       totalCount += count;
//       totalSales += count * rate;
//       entry.rate = count * rate;
//     });

//     // --- Step 5: Aggregate per agent ---
//     const perAgentMap = {};
//     entries.forEach(entry => {
//       const agent = entry.createdBy || "unknown";
//       if (!perAgentMap[agent]) perAgentMap[agent] = { agent, count: 0, amount: 0 };
//       perAgentMap[agent].count += Number(entry.count) || 0;
//       perAgentMap[agent].amount += Number(entry.rate) || 0;
//     });
//     const byAgent = Object.values(perAgentMap).sort((a, b) => b.amount - a.amount);

//     // --- Step 6: Build report ---
//     const report = {
//       count: totalCount,
//       amount: totalSales,
//       date: `${fromDate} to ${toDate} (${timeLabel || "all"})`,
//       fromDate,
//       toDate,
//       createdBy,
//       timeLabel,
//       entries,
//       byAgent,
//     };

//     // --- Step 7: Store in cache for 5 minutes ---
//     reportCache.set(cacheKey, report);
//     setTimeout(() => reportCache.delete(cacheKey), 5 * 60 * 1000);

//     return res.json(report);
//   } catch (err) {
//     console.error("❌ Error in getSalesReport:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// const getSalesReport = async (req, res) => {
//   try {
//     const { fromDate, toDate, createdBy, timeLabel, loggedInUser } = req.query;

//     console.log("📥 [getSalesReport] Request Query:", { fromDate, toDate, createdBy, timeLabel, loggedInUser });

//     if (!fromDate || !toDate) {
//       return res.status(400).json({ message: "fromDate and toDate are required" });
//     }

//     const allUsers = await MainUser.find().select("username createdBy");
//     const normCreatedBy = normalizeName(createdBy);
//     const normLoggedInUser = normalizeName(loggedInUser);

//     const agentList = normCreatedBy
//       ? [normCreatedBy, ...getDescendants(normCreatedBy, allUsers)]
//       : [normLoggedInUser, ...getDescendants(normLoggedInUser, allUsers)];

//     const filter = {
//       date: { $gte: fromDate, $lte: toDate },
//       createdBy: { $in: agentList }
//     };

//     if (timeLabel && timeLabel !== "all") {
//       filter.drawTime = summaryLabelMap[timeLabel.trim()] || timeLabel.trim().toUpperCase();
//     }

//     const targetUser = normCreatedBy || normLoggedInUser || "";

//     // To show the Parent Totals + Direct Children Breakdown, we only need them.
//     // Descendants are now pre-aggregated in the summary docs!
//     const children = allUsers.filter(u => normalizeName(u.createdBy) === targetUser).map(u => normalizeName(u.username));
//     const summaryAgentList = [targetUser, ...children];

//     const { view = "summary" } = req.query;
//     console.log(`🔍 [getSalesReport] Filter: ${JSON.stringify(filter)} (View: ${view})`);

//     let finalEntries = [];
//     let totalCount = 0;
//     let totalAmount = 0;
//     const perAgentMap = {};

//     // --- 1. SUMMARY VIEW (Hierarchical Path) ---
//     // We only use the optimized path if view is NOT explicitly "detailed"
//     if (view !== "detailed") {
//       // Filter for Parent + Direct Children only
//       const summaryFilter = { ...filter, createdBy: { $in: summaryAgentList } };
//       const summaries = await SalesReportSummary.find(summaryFilter);
//       console.log(`📊 [getSalesReport] Summaries found for ${view} view: ${summaries.length} (Target: ${targetUser})`);

//       if (summaries.length > 0) {
//         const userForRate = loggedInUser || createdBy || "";
//         const uniqueDraws = [...new Set(summaries.map(s => s.drawTime))];
//         const rateMastersByDraw = {};

//         summaries.forEach(s => {
//           const agent = normalizeName(s.createdBy);
//           const isTarget = (agent === targetUser);
//           const isDirectChild = children.includes(agent);

//           // 🟢 Use stored amounts from DB!
//           let selfCountAtLevel = Number(s.selfCount) || 0;
//           let branchCountAtLevel = Number(s.totalCount) || 0;

//           let selfAmountAtLevel = Number(s.selfAmount) || 0;
//           let branchAmountAtLevel = Number(s.totalAmount) || 0;

//           if (isTarget) {
//             totalCount += selfCountAtLevel;
//             totalAmount += selfAmountAtLevel;

//             if (!perAgentMap[agent]) perAgentMap[agent] = { agent, count: 0, amount: 0 };
//             perAgentMap[agent].count += selfCountAtLevel;
//             perAgentMap[agent].amount += selfAmountAtLevel;

//             // Populate 'finalEntries' for parent's self only
//             (s.schemes?.[0]?.rows || []).forEach(r => {
//               const rowCount = (Number(r.count) || 0);
//               const rowAmount = (Number(r.amount) || 0);
//               // If this is a summary level, we need to extract the 'self' portion of the rowAmount
//               // But SalesReportSummary rows currently store the BRANCH total for that scheme.
//               // To be perfectly accurate for 'view self', we'd need selfAmount per scheme.
//               // For now, we use the weight to approximate (this is consistent with existing logic).
//               const selfWeight = branchCountAtLevel > 0 ? (selfCountAtLevel / branchCountAtLevel) : 1;
//               const selfPartCount = rowCount * selfWeight;
//               const selfPartAmount = rowAmount * selfWeight;

//               if (selfPartCount > 0) {
//                 const rowUnitRate = Number((selfPartAmount / selfPartCount).toFixed(2));
//                 finalEntries.push({
//                   _id: s._id, createdBy: agent, date: s.date, drawTime: s.drawTime,
//                   type: r.scheme, count: selfPartCount,
//                   rate: selfPartAmount, // Frontend expects TOTAL amount here
//                   amount: selfPartAmount,
//                   unitRate: rowUnitRate
//                 });
//               }
//             });
//           } else if (isDirectChild) {
//             totalCount += branchCountAtLevel;
//             totalAmount += branchAmountAtLevel;

//             if (!perAgentMap[agent]) perAgentMap[agent] = { agent, count: 0, amount: 0 };
//             perAgentMap[agent].count += branchCountAtLevel;
//             perAgentMap[agent].amount += branchAmountAtLevel;
//           }
//         });

//         return res.json({
//           count: totalCount, amount: totalAmount,
//           date: `${fromDate} to ${toDate} (${timeLabel || "all"})`,
//           fromDate, toDate, createdBy, timeLabel,
//           entries: finalEntries,
//           byAgent: Object.values(perAgentMap).sort((a, b) => b.count - a.count)
//         });
//       }

//       // If zero summaries found for summary view, still return an empty result (strict behavior)
//       return res.json({
//         count: 0,
//         date: `${fromDate} to ${toDate} (${timeLabel || "all"})`,
//         fromDate, toDate, createdBy, timeLabel,
//         entries: [],
//         byAgent: []
//       });
//     }

//     // --- 2. DETAILED VIEW OR FALLBACK (Raw Entries Path) ---
//     // Fetch directly from Entry collection for bill-by-bill history or fallback
//     const start = parseDateISTStart(fromDate);
//     const end = parseDateISTEnd(toDate);

//     const entryQuery = {
//       createdBy: { $in: agentList },
//       createdAt: { $gte: start, $lte: end },
//       isValid: { $ne: false }
//     };

//     if (timeLabel && timeLabel !== "all") {
//       const normalized = summaryLabelMap[timeLabel.trim()] || timeLabel.trim().toUpperCase();
//       if (normalized === "KERALA 3 PM") {
//         entryQuery.timeLabel = { $in: ["KERALA 3 PM", "LSK 3 PM"] };
//       } else {
//         entryQuery.timeLabel = timeLabel;
//       }
//     }

//     console.log(`🔍 [getSalesReport] Fetching Entry data...`);
//     const rawEntries = await Entry.find(entryQuery);

//     if (rawEntries.length > 0) {
//       // 🟢 Recalculate based on EACH seller's RateMaster for true branch accuracy
//       const sellers = [...new Set(rawEntries.map(e => normalizeName(e.createdBy)))];
//       const draws = [...new Set(rawEntries.map(e => (e.timeLabel || "").trim().toUpperCase()))];

//       const drawSearch = draws.map(d => summaryLabelMap[d] || d);
//       if (!drawSearch.includes("All")) drawSearch.push("All");

//       console.log(`🔍 [getSalesReport] Bulk fetching RateMasters for ${sellers.length} sellers...`);
//       const allRateMasters = await RateMaster.find({
//         user: { $in: sellers.map(s => new RegExp(`^${s}$`, 'i')) },
//         draw: { $in: drawSearch }
//       }).sort({ draw: -1 }); // Specific draw > "All"

//       const rateMastersCache = {}; // key: seller|draw
//       allRateMasters.forEach(rm => {
//         const u = normalizeName(rm.user);
//         const d = rm.draw;
//         const lookup = {};
//         (rm.rates || []).forEach(r => {
//           const key = (r.label || r.name || "").toUpperCase();
//           if (key) lookup[key] = Number(r.rate) || getRateForType(key);
//         });
//         rateMastersCache[`${u}|${d}`] = lookup;
//       });

//       rawEntries.forEach(e => {
//         const entryCount = (Number(e.count) || 1);
//         const seller = normalizeName(e.createdBy);
//         const draw = (e.timeLabel || "").trim().toUpperCase();
//         const rmDraw = summaryLabelMap[draw] || draw;

//         const rateLookup = rateMastersCache[`${seller}|${rmDraw}`] || rateMastersCache[`${seller}|All`] || {};
//         const betType = extractBaseType(e.type);
//         const rate = rateLookup[betType] ?? getRateForType(betType);
//         const entryAmount = rate * entryCount;

//         const sellerAgent = e.createdBy;

//         // 1. Grand Totals (Everything in agentList is part of the branch)
//         totalCount += entryCount;
//         totalAmount += entryAmount;

//         // 2. Group for the 'By Agent' breakdown list
//         let sellerDirectParent = normalizeName(allUsers.find(u => normalizeName(u.username) === normalizeName(sellerAgent))?.createdBy);
//         let groupingAgent = normalizeName(sellerAgent);

//         if (groupingAgent !== targetUser && sellerDirectParent !== targetUser) {
//           // It's a deep descendant, find the direct child of targetUser in the path
//           const path = [groupingAgent];
//           let ancestor = sellerDirectParent;
//           while (ancestor && ancestor !== targetUser && !path.includes(ancestor)) {
//             path.push(ancestor);
//             ancestor = normalizeName(allUsers.find(u => normalizeName(u.username) === ancestor)?.createdBy);
//           }
//           if (ancestor === targetUser) {
//             groupingAgent = path[path.length - 1]; // The direct child of targetUser
//           }
//         }

//         if (!perAgentMap[groupingAgent]) perAgentMap[groupingAgent] = { agent: groupingAgent, count: 0, amount: 0 };
//         perAgentMap[groupingAgent].count += entryCount;
//         perAgentMap[groupingAgent].amount += entryAmount;

//         finalEntries.push({
//           _id: e._id,
//           billNo: e.billNo,
//           createdBy: sellerAgent,
//           date: formatDateIST(e.createdAt),
//           drawTime: e.timeLabel,
//           type: betType,
//           count: entryCount,
//           rate: entryAmount, // Frontend expects TOTAL amount here
//           amount: entryAmount,
//           unitRate: rate
//         });
//       });
//     }

//     return res.json({
//       count: totalCount, amount: totalAmount,
//       date: `${fromDate} to ${toDate} (${timeLabel || "all"})`,
//       fromDate, toDate, createdBy, timeLabel,
//       entries: finalEntries.sort((a, b) => String(b._id).localeCompare(String(a._id))),
//       byAgent: Object.values(perAgentMap).sort((a, b) => b.count - a.count)
//     });

//   } catch (err) {
//     console.error("❌ [getSalesReport] Error:", err);
//     res.status(500).json({ message: "Internal server error", error: err.message });
//   }
// };

const getSalesReport = async (req, res) => {
  try {
    const { fromDate, toDate, createdBy, timeLabel, loggedInUser } = req.query;

    console.log("📥 [getSalesReport] Request Query:", { fromDate, toDate, createdBy, timeLabel, loggedInUser });

    if (!fromDate || !toDate) {
      return res.status(400).json({ message: "fromDate and toDate are required" });
    }

    const allUsers = await MainUser.find().select("username createdBy");
    const normCreatedBy = normalizeName(createdBy);
    const normLoggedInUser = normalizeName(loggedInUser);

    const agentList = normCreatedBy
      ? [normCreatedBy, ...getDescendants(normCreatedBy, allUsers)]
      : [normLoggedInUser, ...getDescendants(normLoggedInUser, allUsers)];

    const filter = {
      date: { $gte: fromDate, $lte: toDate },
      createdBy: { $in: agentList }
    };

    if (timeLabel && timeLabel !== "all") {
      filter.drawTime = summaryLabelMap[timeLabel.trim()] || timeLabel.trim().toUpperCase();
    }

    const targetUser = normCreatedBy || normLoggedInUser || "";

    // To show the Parent Totals + Direct Children Breakdown, we only need them.
    // Descendants are now pre-aggregated in the summary docs!
    const children = allUsers.filter(u => normalizeName(u.createdBy) === targetUser).map(u => normalizeName(u.username));
    const summaryAgentList = [targetUser, ...children];

    const { view = "summary" } = req.query;
    console.log(`🔍 [getSalesReport] Filter: ${JSON.stringify(filter)} (View: ${view})`);

    let finalEntries = [];
    let totalCount = 0;
    let totalAmount = 0;
    const perAgentMap = {};

    // --- 1. SUMMARY VIEW (Hierarchical Path) ---
    // We only use the optimized path if view is NOT explicitly "detailed"
    if (view !== "detailed") {
      // Filter for Parent + Direct Children only
      const summaryFilter = { ...filter, createdBy: { $in: summaryAgentList } };
      const summaries = await SalesReportSummary.find(summaryFilter);
      console.log(`📊 [getSalesReport] Summaries found for ${view} view: ${summaries.length} (Target: ${targetUser})`);

      if (summaries.length > 0) {
        const userForRate = loggedInUser || createdBy || "";
        const uniqueDraws = [...new Set(summaries.map(s => s.drawTime))];
        const rateMastersByDraw = {};

        summaries.forEach(s => {
          const agent = normalizeName(s.createdBy);
          const isTarget = (agent === targetUser);
          const isDirectChild = children.includes(agent);

          // 🟢 Use stored amounts from DB!
          let selfCountAtLevel = Number(s.selfCount) || 0;
          let branchCountAtLevel = Number(s.totalCount) || 0;

          let selfAmountAtLevel = Number(s.selfAmount) || 0;
          let branchAmountAtLevel = Number(s.totalAmount) || 0;

          if (isTarget) {
            totalCount += selfCountAtLevel;
            totalAmount += selfAmountAtLevel;

            if (!perAgentMap[agent]) perAgentMap[agent] = { agent, count: 0, amount: 0 };
            perAgentMap[agent].count += selfCountAtLevel;
            perAgentMap[agent].amount += selfAmountAtLevel;

            // Populate 'finalEntries' for parent's self only
            (s.schemes?.[0]?.rows || []).forEach(r => {
              const rowCount = (Number(r.count) || 0);
              const rowAmount = (Number(r.amount) || 0);
              // If this is a summary level, we need to extract the 'self' portion of the rowAmount
              // But SalesReportSummary rows currently store the BRANCH total for that scheme.
              // To be perfectly accurate for 'view self', we'd need selfAmount per scheme.
              // For now, we use the weight to approximate (this is consistent with existing logic).
              const selfWeight = branchCountAtLevel > 0 ? (selfCountAtLevel / branchCountAtLevel) : 1;
              const selfPartCount = rowCount * selfWeight;
              const selfPartAmount = rowAmount * selfWeight;

              if (selfPartCount > 0) {
                const rowUnitRate = Number((selfPartAmount / selfPartCount).toFixed(2));
                finalEntries.push({
                  _id: s._id, createdBy: agent, date: s.date, drawTime: s.drawTime,
                  type: r.scheme, count: selfPartCount,
                  rate: selfPartAmount, // Frontend expects TOTAL amount here
                  amount: selfPartAmount,
                  unitRate: rowUnitRate
                });
              }
            });
          } else if (isDirectChild) {
            totalCount += branchCountAtLevel;
            totalAmount += branchAmountAtLevel;

            if (!perAgentMap[agent]) perAgentMap[agent] = { agent, count: 0, amount: 0 };
            perAgentMap[agent].count += branchCountAtLevel;
            perAgentMap[agent].amount += branchAmountAtLevel;
          }
        });

        return res.json({
          count: totalCount, amount: totalAmount,
          date: `${fromDate} to ${toDate} (${timeLabel || "all"})`,
          fromDate, toDate, createdBy, timeLabel,
          entries: finalEntries,
          byAgent: Object.values(perAgentMap).sort((a, b) => b.count - a.count)
        });
      }

      // If zero summaries found for summary view, still return an empty result (strict behavior)
      return res.json({
        count: 0,
        date: `${fromDate} to ${toDate} (${timeLabel || "all"})`,
        fromDate, toDate, createdBy, timeLabel,
        entries: [],
        byAgent: []
      });
    }

    // --- 2. DETAILED VIEW OR FALLBACK (Raw Entries Path) ---
    // Fetch directly from Entry collection for bill-by-bill history or fallback
    const start = parseDateISTStart(fromDate);
    const end = parseDateISTEnd(toDate);

    const entryQuery = {
      createdBy: { $in: agentList },
      createdAt: { $gte: start, $lte: end },
      isValid: { $ne: false }
    };

    if (timeLabel && timeLabel !== "all") {
      const normalized = summaryLabelMap[timeLabel.trim()] || timeLabel.trim().toUpperCase();
      if (normalized === "KERALA 3 PM") {
        entryQuery.timeLabel = { $in: ["KERALA 3 PM", "LSK 3 PM"] };
      } else {
        entryQuery.timeLabel = timeLabel;
      }
    }

    console.log(`🔍 [getSalesReport] Fetching Entry data...`);
    const rawEntries = await Entry.find(entryQuery);

    if (rawEntries.length > 0) {
      // 🟢 Recalculate based on EACH seller's RateMaster for true branch accuracy
      const sellers = [...new Set(rawEntries.map(e => normalizeName(e.createdBy)))];
      const draws = [...new Set(rawEntries.map(e => (e.timeLabel || "").trim().toUpperCase()))];

      const drawSearch = draws.map(d => summaryLabelMap[d] || d);
      if (!drawSearch.includes("All")) drawSearch.push("All");

      console.log(`🔍 [getSalesReport] Bulk fetching RateMasters for ${sellers.length} sellers...`);
      const allRateMasters = await RateMaster.find({
        user: { $in: sellers.map(s => new RegExp(`^${s}$`, 'i')) },
        draw: { $in: drawSearch }
      }).sort({ draw: -1 }); // Specific draw > "All"

      const rateMastersCache = {}; // key: seller|draw
      allRateMasters.forEach(rm => {
        const u = normalizeName(rm.user);
        const d = rm.draw;
        const lookup = {};
        (rm.rates || []).forEach(r => {
          const key = (r.label || r.name || "").toUpperCase();
          if (key) lookup[key] = Number(r.rate) || getRateForType(key);
        });
        rateMastersCache[`${u}|${d}`] = lookup;
      });

      rawEntries.forEach(e => {
        const entryCount = (Number(e.count) || 1);
        const seller = normalizeName(e.createdBy);
        const draw = (e.timeLabel || "").trim().toUpperCase();
        const rmDraw = summaryLabelMap[draw] || draw;

        const rateLookup = rateMastersCache[`${seller}|${rmDraw}`] || rateMastersCache[`${seller}|All`] || {};
        const betType = extractBaseType(e.type);
        const entryAmount = Number(e.rate);   // 🔒 frozen at entry time
        const unitRate = entryCount > 0 ? (entryAmount / entryCount) : 0;
        const sellerAgent = e.createdBy;

        // 1. Grand Totals (Everything in agentList is part of the branch)
        totalCount += entryCount;
        totalAmount += entryAmount;

        // 2. Group for the 'By Agent' breakdown list
        let sellerDirectParent = normalizeName(allUsers.find(u => normalizeName(u.username) === normalizeName(sellerAgent))?.createdBy);
        let groupingAgent = normalizeName(sellerAgent);

        if (groupingAgent !== targetUser && sellerDirectParent !== targetUser) {
          // It's a deep descendant, find the direct child of targetUser in the path
          const path = [groupingAgent];
          let ancestor = sellerDirectParent;
          while (ancestor && ancestor !== targetUser && !path.includes(ancestor)) {
            path.push(ancestor);
            ancestor = normalizeName(allUsers.find(u => normalizeName(u.username) === ancestor)?.createdBy);
          }
          if (ancestor === targetUser) {
            groupingAgent = path[path.length - 1]; // The direct child of targetUser
          }
        }

        if (!perAgentMap[groupingAgent]) perAgentMap[groupingAgent] = { agent: groupingAgent, count: 0, amount: 0 };
        perAgentMap[groupingAgent].count += entryCount;
        perAgentMap[groupingAgent].amount += entryAmount;

        finalEntries.push({
          _id: e._id,
          billNo: e.billNo,
          createdBy: sellerAgent,
          date: formatDateIST(e.createdAt),
          drawTime: e.timeLabel,
          type: betType,
          count: entryCount,
          rate: entryAmount, // Frontend expects TOTAL amount here
          amount: entryAmount,
          unitRate: unitRate
        });
      });
    }

    return res.json({
      count: totalCount, amount: totalAmount,
      date: `${fromDate} to ${toDate} (${timeLabel || "all"})`,
      fromDate, toDate, createdBy, timeLabel,
      entries: finalEntries.sort((a, b) => String(b._id).localeCompare(String(a._id))),
      byAgent: Object.values(perAgentMap).sort((a, b) => b.count - a.count)
    });

  } catch (err) {
    console.error("❌ [getSalesReport] Error:", err);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
};

// const getSalesReport = async (req, res) => {
//   try {
//     const { fromDate, toDate, createdBy, timeLabel, loggedInUser } = req.query;

//     if (!fromDate || !toDate) {
//       return res.status(400).json({ message: "fromDate and toDate are required" });
//     }

//     const allUsers = await MainUser.find().select("username createdBy");
//     const normCreatedBy = normalizeName(createdBy);
//     const normLoggedInUser = normalizeName(loggedInUser);

//     const agentList = normCreatedBy
//       ? [normCreatedBy, ...getDescendants(normCreatedBy, allUsers)]
//       : [normLoggedInUser, ...getDescendants(normLoggedInUser, allUsers)];

//     const filter = {
//       date: { $gte: fromDate, $lte: toDate },
//       createdBy: { $in: agentList }
//     };

//     if (timeLabel && timeLabel !== "all") {
//       filter.drawTime = summaryLabelMap[timeLabel.trim()] || timeLabel.trim().toUpperCase();
//     }

//     const targetUser = normCreatedBy || normLoggedInUser || "";
//     const children = allUsers.filter(u => normalizeName(u.createdBy) === targetUser)
//                              .map(u => normalizeName(u.username));
//     const summaryAgentList = [targetUser, ...children];

//     const { view = "summary" } = req.query;
//     let finalEntries = [];
//     let totalCount = 0;
//     let totalAmount = 0;
//     const perAgentMap = {};

//     // --- 1. SUMMARY VIEW ---
//     if (view !== "detailed") {
//       const summaryFilter = { ...filter, createdBy: { $in: summaryAgentList } };
//       const summaries = await SalesReportSummary.find(summaryFilter);

//       summaries.forEach(s => {
//         const agent = normalizeName(s.createdBy);
//         const isTarget = agent === targetUser;
//         const isDirectChild = children.includes(agent);

//         const selfCountAtLevel = Number(s.selfCount) || 0;
//         const branchCountAtLevel = Number(s.totalCount) || 0;
//         const selfAmountAtLevel = Number(s.selfAmount) || 0;
//         const branchAmountAtLevel = Number(s.totalAmount) || 0;

//         if (isTarget) {
//           totalCount += selfCountAtLevel;
//           totalAmount += selfAmountAtLevel;

//           if (!perAgentMap[agent]) perAgentMap[agent] = { agent, count: 0, amount: 0 };
//           perAgentMap[agent].count += selfCountAtLevel;
//           perAgentMap[agent].amount += selfAmountAtLevel;

//           (s.schemes?.[0]?.rows || []).forEach(r => {
//             const rowCount = Number(r.count) || 0;
//             const rowAmount = Number(r.amount) || 0;
//             const selfWeight = branchCountAtLevel > 0 ? (selfCountAtLevel / branchCountAtLevel) : 1;
//             const selfPartCount = rowCount * selfWeight;
//             const selfPartAmount = rowAmount * selfWeight;

//             if (selfPartCount > 0) {
//               finalEntries.push({
//                 _id: s._id,
//                 createdBy: agent,
//                 date: s.date,
//                 drawTime: s.drawTime,
//                 type: r.scheme,
//                 count: selfPartCount,
//                 rate: selfPartAmount,  // use stored amount
//                 amount: selfPartAmount,
//                 unitRate: selfPartCount > 0 ? (selfPartAmount / selfPartCount) : 0
//               });
//             }
//           });
//         } else if (isDirectChild) {
//           totalCount += branchCountAtLevel;
//           totalAmount += branchAmountAtLevel;

//           if (!perAgentMap[agent]) perAgentMap[agent] = { agent, count: 0, amount: 0 };
//           perAgentMap[agent].count += branchCountAtLevel;
//           perAgentMap[agent].amount += branchAmountAtLevel;
//         }
//       });

//       return res.json({
//         count: totalCount,
//         amount: totalAmount,
//         date: `${fromDate} to ${toDate} (${timeLabel || "all"})`,
//         fromDate, toDate, createdBy, timeLabel,
//         entries: finalEntries,
//         byAgent: Object.values(perAgentMap).sort((a, b) => b.count - a.count)
//       });
//     }

//     // --- 2. DETAILED VIEW ---
//     const start = parseDateISTStart(fromDate);
//     const end = parseDateISTEnd(toDate);

//     const entryQuery = {
//       createdBy: { $in: agentList },
//       createdAt: { $gte: start, $lte: end },
//       isValid: { $ne: false }
//     };

//     if (timeLabel && timeLabel !== "all") {
//       const normalized = summaryLabelMap[timeLabel.trim()] || timeLabel.trim().toUpperCase();
//       entryQuery.timeLabel = normalized === "KERALA 3 PM" ? { $in: ["KERALA 3 PM", "LSK 3 PM"] } : normalized;
//     }

//     const rawEntries = await Entry.find(entryQuery);

//     rawEntries.forEach(e => {
//       const entryCount = Number(e.count) || 1;
//       const entryAmount = Number(e.rate) || 0;  // ✅ USE STORED RATE HERE
//       const sellerAgent = e.createdBy;

//       totalCount += entryCount;
//       totalAmount += entryAmount;

//       let sellerDirectParent = normalizeName(allUsers.find(u => normalizeName(u.username) === normalizeName(sellerAgent))?.createdBy);
//       let groupingAgent = normalizeName(sellerAgent);

//       if (groupingAgent !== targetUser && sellerDirectParent !== targetUser) {
//         const path = [groupingAgent];
//         let ancestor = sellerDirectParent;
//         while (ancestor && ancestor !== targetUser && !path.includes(ancestor)) {
//           path.push(ancestor);
//           ancestor = normalizeName(allUsers.find(u => normalizeName(u.username) === ancestor)?.createdBy);
//         }
//         if (ancestor === targetUser) {
//           groupingAgent = path[path.length - 1];
//         }
//       }

//       if (!perAgentMap[groupingAgent]) perAgentMap[groupingAgent] = { agent: groupingAgent, count: 0, amount: 0 };
//       perAgentMap[groupingAgent].count += entryCount;
//       perAgentMap[groupingAgent].amount += entryAmount;

//       finalEntries.push({
//         _id: e._id,
//         billNo: e.billNo,
//         createdBy: sellerAgent,
//         date: formatDateIST(e.createdAt),
//         drawTime: e.timeLabel,
//         type: extractBaseType(e.type),
//         count: entryCount,
//         rate: entryAmount,
//         amount: entryAmount,
//         unitRate: entryAmount / entryCount
//       });
//     });

//     return res.json({
//       count: totalCount,
//       amount: totalAmount,
//       date: `${fromDate} to ${toDate} (${timeLabel || "all"})`,
//       fromDate, toDate, createdBy, timeLabel,
//       entries: finalEntries.sort((a, b) => String(b._id).localeCompare(String(a._id))),
//       byAgent: Object.values(perAgentMap).sort((a, b) => b.count - a.count)
//     });

//   } catch (err) {
//     console.error("❌ [getSalesReport] Error:", err);
//     res.status(500).json({ message: "Internal server error", error: err.message });
//   }
// };








// =======================
// 📌 Block Number Functions
// =======================

// ✅ Get all blocked numbers
const getBlockedNumbers = async (req, res) => {
  try {
    const { createdBy, group, drawTime, isActive = true } = req.query;
    // console.log("aaaaaaaaaaaaaaaaaa2", req.query);

    const query = { isActive: isActive === 'true' };

    if (createdBy) query.createdBy = createdBy;
    if (group) query.group = group;
    if (drawTime && !drawTime === 'All') query.drawTime = drawTime;

    const blockedNumbers = await BlockNumber.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: blockedNumbers,
      count: blockedNumbers.length
    });
  } catch (error) {
    console.error('❌ Error getting blocked numbers:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching blocked numbers'
    });
  }
};

// ✅ Add new blocked numbers
const addBlockedNumbers = async (req, res) => {
  try {
    const { blockData, selectedGroup, drawTime, createdBy } = req.body;
    // console.log("aaaaaaaaaaaaaaaaaaa1", blockData);

    if (!blockData || !Array.isArray(blockData) || blockData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Block data is required and must be an array'
      });
    }

    // console.log('selectedGroup', selectedGroup)
    // console.log('drawTime', drawTime)
    // console.log('createdBy', createdBy);
    if (!selectedGroup || !drawTime || !createdBy) {
      return res.status(400).json({
        success: false,
        message: 'Selected group, draw time, and created by are required'
      });
    }
    let numbersToBlock = [];

    if (drawTime === 'All') {
      // Create one blocked entry for each time in STATIC_DATES for each blockData item
      STATIC_DATES.forEach(time => {
        blockData.forEach(item => {
          numbersToBlock.push({
            field: item.field,
            number: item.number,
            count: item.count,
            group: selectedGroup,
            drawTime: time,
            createdBy: createdBy,
            isActive: true
          });
        });
      });
    } else {
      // Normal case: single drawTime
      numbersToBlock = blockData.map(item => ({
        field: item.field,
        number: item.number,
        count: item.count,
        group: selectedGroup,
        drawTime: drawTime,
        createdBy: createdBy,
        isActive: true
      }));
    }

    // console.log('numbersToBlock', numbersToBlock);
    // Check for existing blocked numbers to avoid duplicates
    const existingNumbers = await BlockNumber.find({
      createdBy,
      drawTime: { $in: drawTime === 'All' ? STATIC_DATES : [drawTime] },
      isActive: true,
      $or: numbersToBlock.map(item => ({
        field: item.field,
        number: item.number
      }))
    });
    // console.log('existingNumbers', existingNumbers);
    if (existingNumbers.length > 0) {
      const duplicates = existingNumbers.map(item => `${item.field}: ${item.number} (${item.drawTime})`);
      return res.status(200).json({
        status: 0,
        success: false,
        message: `Some numbers are already blocked:\n${duplicates.join('\n')}`,
        // duplicates: duplicates
      });
    }

    // Insert new blocked numbers
    const savedNumbers = await BlockNumber.insertMany(numbersToBlock);
    // console.log('savedNumbers====', savedNumbers)

    res.status(201).json({
      success: true,
      message: 'Blocked numbers added successfully',
      data: savedNumbers,
      count: savedNumbers.length
    });

  } catch (error) {
    console.error('❌ Error adding blocked numbers:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while adding blocked numbers'
    });
  }
};

// ✅ Update blocked number
const updateBlockedNumber = async (req, res) => {
  try {
    const { id } = req.params;
    const { field, number, count, group, drawTime, isActive } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Block number ID is required'
      });
    }

    const updateData = {};
    if (field !== undefined) updateData.field = field;
    if (number !== undefined) updateData.number = number;
    if (count !== undefined) updateData.count = count;
    if (group !== undefined) updateData.group = group;
    if (drawTime !== undefined) updateData.drawTime = drawTime;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updatedNumber = await BlockNumber.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedNumber) {
      return res.status(404).json({
        success: false,
        message: 'Blocked number not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Blocked number updated successfully',
      data: updatedNumber
    });

  } catch (error) {
    console.error('❌ Error updating blocked number:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating blocked number'
    });
  }
};

// ✅ Delete blocked number (soft delete by setting isActive to false)
const deleteBlockedNumber = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Block number ID is required'
      });
    }

    const deletedNumber = await BlockNumber.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!deletedNumber) {
      return res.status(404).json({
        success: false,
        message: 'Blocked number not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Blocked number deleted successfully',
      data: deletedNumber
    });

  } catch (error) {
    console.error('❌ Error deleting blocked number:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting blocked number'
    });
  }
};

// ✅ Get blocked numbers by user and draw time
const getBlockedNumbersByUser = async (req, res) => {
  try {
    const { createdBy, drawTime } = req.params;

    if (!createdBy || !drawTime) {
      return res.status(400).json({
        success: false,
        message: 'Created by and draw time are required'
      });
    }

    const blockedNumbers = await BlockNumber.find({
      createdBy,
      drawTime,
      isActive: true
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: blockedNumbers,
      count: blockedNumbers.length
    });

  } catch (error) {
    console.error('❌ Error getting blocked numbers by user:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching blocked numbers'
    });
  }
};

// ✅ Bulk delete blocked numbers
const bulkDeleteBlockedNumbers = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array of IDs is required'
      });
    }

    const result = await BlockNumber.updateMany(
      { _id: { $in: ids } },
      { isActive: false }
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} blocked numbers deleted successfully`,
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('❌ Error bulk deleting blocked numbers:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while bulk deleting blocked numbers'
    });
  }
};

// GET all overflow limits
const getOverflowLimit = async (req, res) => {
  try {
    const limits = await OverflowLimit.find();
    res.status(200).json(limits);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST to create/update overflow limits
const saveOverflowLimit = async (req, res) => {
  try {
    const { drawTime, limits } = req.body;

    if (!drawTime || !limits) {
      return res.status(400).json({ message: 'drawTime and limits are required' });
    }

    const updated = await OverflowLimit.findOneAndUpdate(
      { drawTime },
      { limits },
      { new: true, upsert: true } // creates if not exist
    );

    res.status(200).json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
//getone overlimit
const getOverflowLimitByDrawTime = async (req, res) => {
  try {
    const { drawTime } = req.query;

    if (!drawTime) {
      return res.status(400).json({
        message: "drawTime is required"
      });
    }

    const data = await OverflowLimit.findOne({ drawTime });

    if (!data) {
      return res.status(404).json({
        message: "No overflow limit found for this draw time"
      });
    }

    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Server error"
    });
  }
};


// ================= GET a draw by tab and drawName =================

// Get draw by drawName and activeTab
const getDrawByTabAndName = async (req, res) => {
  try {
    const { activeTab, drawName } = req.query;

    if (!activeTab || !drawName) {
      return res.status(400).json({ message: "activeTab and drawName are required" });
    }

    const data = await Schema.findOne(
      {
        activeTab: Number(activeTab),
        "draws.drawName": drawName
      },
      {
        draws: { $elemMatch: { drawName } }
      }
    );

    if (!data) {
      return res.status(404).json({ message: "Draw + tab not found" });
    }

    res.json({
      activeTab: data.activeTab,
      draw: data.draws[0]
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};




// ================= ADD a draw to a tab =================
// const addDrawToTab = async (req, res) => {
//   try {
//     const { activeTab, drawName, schemes } = req.body;

//     if (!activeTab || !drawName || !schemes)
//       return res.status(400).json({ message: "activeTab, drawName and schemes are required" });

//     // Find if tab exists
//     let tabData = await Schema.findOne({ activeTab: Number(activeTab) });

//     const newDraw = { drawName, schemes };

//     if (tabData) {
//       // Tab exists → add draw
//       tabData.draws.push(newDraw);
//       await tabData.save();
//       return res.status(201).json({ message: "Draw added to existing tab", data: tabData });
//     } else {
//       // Tab does not exist → create new tab with draw
//       const newTab = new Schema({
//         activeTab: Number(activeTab),
//         draws: [newDraw],
//       });
//       await newTab.save();
//       return res.status(201).json({ message: "Tab and draw created", data: newTab });
//     }
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Error adding draw" });
//   }
// };

// ================= ADD/UPDATE a draw to a tab =================
// ================= ADD/UPDATE a draw to a tab =================
// ================= ADD/UPDATE a draw to a tab =================
const addDrawToTab = async (req, res) => {
  try {
    const { activeTab, drawName, schemes } = req.body;
    if (!activeTab || !drawName || !schemes)
      return res.status(400).json({ message: "activeTab, drawName and schemes are required" });
    let tabData = await Schema.findOne({ activeTab: Number(activeTab) });
    if (tabData) {
      const drawIndex = tabData.draws.findIndex(d => d.drawName === drawName);
      if (drawIndex !== -1) {
        // UPDATE existing draw. schemes is already grouped from the app now.
        tabData.draws[drawIndex].schemes = schemes;
      } else {
        // ADD new draw
        tabData.draws.push({ drawName, schemes });
      }

      tabData.markModified('draws');
      await tabData.save();
      return res.status(201).json({ message: "Saved successfully", data: tabData });
    } else {
      const newTab = new Schema({
        activeTab: Number(activeTab),
        draws: [{ drawName, schemes }],
      });
      await newTab.save();
      return res.status(201).json({ message: "Created successfully", data: newTab });
    }
  } catch (err) {
    console.error("Error saving scheme:", err);
    res.status(500).json({ message: "Error saving scheme" });
  }
};

// ================= UPDATE super for a specific draw =================

// const updateSuperForDraw = async (req, res) => {
//   try {
//     const { activeTab, drawName, updates } = req.body;

//     if (!activeTab || !drawName || !updates) {
//       return res.status(400).json({ message: "Missing data" });
//     }

//     const doc = await Schema.findOne({ activeTab });

//     if (!doc) {
//       return res.status(404).json({ message: "Tab not found" });
//     }

//     const draw = doc.draws.find(d => d.drawName === drawName);

//     if (!draw) {
//       return res.status(404).json({ message: "Draw not found" });
//     }

//     updates.forEach(u => {
//       const group = draw.schemes.find(g => g.group === u.group);
//       if (!group) return;

//       const row = group.rows.find(
//         r => r.scheme === u.scheme && r.pos === u.pos
//       );

//       if (row) row.super = u.super;
//     });

//     await doc.save();

//     res.json({ message: "Super updated successfully" });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

const updateSuperForDraw = async (req, res) => {
  try {
    const { activeTab, drawName, updates } = req.body;
    if (!activeTab || !drawName || !updates || !Array.isArray(updates)) {
      return res.status(400).json({ message: "Missing or invalid data" });
    }
    const doc = await Schema.findOne({ activeTab: Number(activeTab) });
    if (!doc) return res.status(404).json({ message: "Tab not found" });
    const draw = doc.draws.find(d => d.drawName === drawName);
    if (!draw) return res.status(404).json({ message: "Draw not found" });
    updates.forEach(u => {
      let row;
      // Navigate through GROUPS to find the ROW
      for (const group of draw.schemes) {
        if (group.rows && Array.isArray(group.rows)) {
          // Find by ID or by matching scheme/pos
          row = group.rows.find(r =>
            (u._id && r._id && r._id.toString() === u._id.toString()) ||
            (r.scheme === u.scheme && r.pos === Number(u.pos))
          );
          if (row) {
            row.super = Number(u.super);
            console.log(`Updated Row [${row.scheme} ${row.pos}] to ${u.super}`);
            break;
          }
        }
      }
    });
    doc.markModified('draws');
    await doc.save();
    res.json({ message: "Super updated successfully" });
  } catch (err) {
    console.error("Error updating super:", err);
    res.status(500).json({ message: err.message });
  }
};









const addUserAmount = async (req, res) => {
  try {
    const { fromUser, toUser, amount, drawTime = "ALL" } = req.body;

    if (!fromUser || !toUser || amount === undefined) {
      return res.status(400).json({ message: "fromUser, toUser, amount required" });
    }

    // optional safety check
    const userExists = await MainUser.findOne({ username: toUser });
    if (!userExists) {
      return res.status(404).json({ message: "Selected user not found" });
    }

    // Upsert the limit: update if existing (toUser + drawTime), else create new
    const updatedLimit = await UserAmount.findOneAndUpdate(
      { toUser, drawTime },
      { fromUser, amount, date: new Date() },
      { new: true, upsert: true }
    );

    res.status(201).json({
      message: "Amount set successfully",
      data: updatedLimit
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getUserAmounts = async (req, res) => {
  try {
    const { toUser } = req.query;
    const filter = {};
    if (toUser) filter.toUser = toUser;

    const data = await UserAmount.find(filter).sort({ drawTime: 1 });

    res.status(200).json({
      message: "User amount data fetched successfully",
      data
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
const updateAmountOnly = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ message: "amount is required" });
    }

    const updatedData = await UserAmount.findByIdAndUpdate(
      id,
      { amount },
      { new: true }
    );

    if (!updatedData) {
      return res.status(404).json({ message: "Record not found" });
    }

    res.status(200).json({
      message: "Amount updated successfully",
      data: updatedData
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const syncSummaries = async (req, res) => {
  try {
    const { fromDate, toDate } = req.body;
    if (!fromDate || !toDate) {
      return res.status(400).json({ message: "fromDate and toDate required (YYYY-MM-DD)" });
    }

    const start = parseDateISTStart(fromDate);
    const end = parseDateISTEnd(toDate);

    console.log(`🔄 [syncSummaries] Syncing from ${fromDate} to ${toDate}`);

    // 0. Cleanup: Delete existing summaries in this range to avoid duplicates
    await SalesReportSummary.deleteMany({
      date: { $gte: fromDate, $lte: toDate }
    });
    console.log(`🧹 [syncSummaries] Cleaned up existing summaries for the range`);

    // 1. Fetch entries
    const entries = await Entry.find({
      createdAt: { $gte: start, $lte: end },
      isValid: { $ne: false }
    });

    console.log(`📊 [syncSummaries] Found ${entries.length} valid entries`);

    if (entries.length === 0) {
      return res.json({ message: "No entries found to sync", processedEntries: 0 });
    }

    // 2. Fetch all users to get IDs and Parents
    const allUsers = await MainUser.find().select("username _id createdBy");
    const userMap = {};
    const parentMap = {};
    allUsers.forEach(u => {
      const uname = normalizeName(u.username);
      userMap[uname] = u._id;
      parentMap[uname] = normalizeName(u.createdBy);
    });

    // 3. Grouping logic (Hierarchical)
    const groups = {}; // key: date|user|drawTime

    entries.forEach(e => {
      const dateStr = formatDateIST(e.createdAt);
      const seller = normalizeName(e.createdBy);
      const draw = e.timeLabel || "unknown";

      // Extract scheme (e.g., SUPER, BOX, AB, A)
      const drawCode = (e.timeCode || "").toUpperCase();
      let scheme = (e.type || "SUPER").toUpperCase().replace(drawCode, '').replace(/-/g, '').trim();
      if (!scheme) scheme = "SUPER";

      const entryCount = (Number(e.count) || 1);

      // Propagate up the hierarchy
      let currentPathName = seller;
      const visited = new Set();
      const normalizedDraw = summaryDrawMap[draw] || draw;
      while (currentPathName && !visited.has(currentPathName)) {
        visited.add(currentPathName);
        const key = `${dateStr}|${currentPathName}|${normalizedDraw}`;

        if (!groups[key]) {
          groups[key] = {
            userId: userMap[currentPathName],
            createdBy: currentPathName,
            date: dateStr,
            drawTime: draw,
            selfCount: 0,
            childCount: 0,
            totalCount: 0,
            selfSchemes: {},
            childSchemes: {}
          };
        }

        const isSeller = (currentPathName === seller);
        if (isSeller) {
          groups[key].selfCount += entryCount;
          groups[key].selfSchemes[scheme] = (groups[key].selfSchemes[scheme] || 0) + entryCount;
        } else {
          groups[key].childCount += entryCount;
          groups[key].childSchemes[scheme] = (groups[key].childSchemes[scheme] || 0) + entryCount;
        }
        groups[key].totalCount += entryCount;

        currentPathName = parentMap[currentPathName];
      }
    });

    // 4. Fetch RateMasters for relevant users
    const summaryDrawMap = {
      "DEAR 1 PM": "DEAR 1 PM",
      "KERALA 3 PM": "KERALA 3 PM",
      "LSK 3 PM": "KERALA 3 PM",
      "DEAR 6 PM": "DEAR 6 PM",
      "DEAR 8 PM": "DEAR 8 PM"
    };

    const drawVariantSets = new Set();
    Object.values(groups).forEach(g => {
      const u = normalizeName(g.createdBy);
      const d = summaryDrawMap[g.drawTime] || g.drawTime;
      drawVariantSets.add(`${u}|${d}`);
      drawVariantSets.add(`${u}|All`);
    });

    const rateMasters = await RateMaster.find({
      $or: Array.from(drawVariantSets).map(ug => {
        const [user, draw] = ug.split('|');
        return { user, draw };
      })
    });

    const rateMap = {}; // key: user|draw
    // Sort rateMasters so "All" comes first, then specific draws (which will overwrite "All")
    rateMasters.sort((a, b) => (a.draw === "All" ? -1 : 1)).forEach(rm => {
      const lookup = {};
      (rm.rates || []).forEach(r => {
        const key = (r.label || r.name || "").toUpperCase();
        if (key) lookup[key] = Number(r.rate) || 10;
      });
      rateMap[`${normalizeName(rm.user)}|${rm.draw}`] = lookup;
    });

    // Helper to get rate with fallback
    const getSyncRate = (user, draw, type) => {
      const u = normalizeName(user);
      const d = summaryDrawMap[draw] || draw;
      const specific = rateMap[`${u}|${d}`]?.[type];
      if (specific !== undefined) return specific;
      return rateMap[`${u}|All`]?.[type] ?? getRateForType(type);
    };

    // 5. Transform and Save (Bulk Upsert)
    const ops = [];
    for (const data of Object.values(groups)) {
      if (!data.userId) continue;

      const summaryDrawTime = data.drawTime;
      const lookup = rateMap[`${normalizeName(data.createdBy)}|${summaryDrawTime}`] || {};

      let selfAmount = 0;
      let childAmount = 0;

      // Calculate amounts
      Object.entries(data.selfSchemes).forEach(([scheme, count]) => {
        selfAmount += count * getSyncRate(data.createdBy, data.drawTime, scheme);
      });
      Object.entries(data.childSchemes).forEach(([scheme, count]) => {
        childAmount += count * getSyncRate(data.createdBy, data.drawTime, scheme);
      });

      // Combined scheme rows for the document
      const allSchemes = {};
      Object.entries(data.selfSchemes).forEach(([s, c]) => {
        if (!allSchemes[s]) allSchemes[s] = { count: 0, amount: 0 };
        allSchemes[s].count += c;
        allSchemes[s].amount += c * (lookup[s] ?? 10);
      });
      Object.entries(data.childSchemes).forEach(([s, c]) => {
        if (!allSchemes[s]) allSchemes[s] = { count: 0, amount: 0 };
        allSchemes[s].count += c;
        allSchemes[s].amount += c * (lookup[s] ?? 10);
      });

      const summaryRows = Object.entries(allSchemes).map(([scheme, val]) => ({
        scheme,
        count: val.count,
        amount: val.amount
      }));

      ops.push({
        updateOne: {
          filter: { createdBy: data.createdBy, date: data.date, drawTime: summaryDrawTime },
          update: {
            $set: {
              userId: data.userId,
              selfCount: data.selfCount,
              selfAmount: selfAmount,
              childCount: data.childCount,
              childAmount: childAmount,
              totalCount: data.totalCount,
              totalAmount: selfAmount + childAmount,
              schemes: [{ rows: summaryRows }]
            }
          },
          upsert: true
        }
      });
    }

    if (ops.length > 0) {
      console.log(`💾 [syncSummaries] Hierarchical upserting ${ops.length} summaries...`);
      await SalesReportSummary.bulkWrite(ops);
    }

    console.log(`✅ [syncSummaries] Sync completed successfully`);
    res.json({
      message: "Sync completed successfully",
      processedEntries: entries.length,
      summariesUpdated: ops.length
    });

  } catch (err) {
    console.error("❌ [syncSummaries] Error:", err);
    res.status(500).json({ message: err.message });
  }
};


// ✅ Automatically update SalesReportSummary when new entries are saved
// async function updateAutomaticSummary(username, dateStr, timeLabel, timeCode, newEntries) {
//   try {
//     const normUsername = normalizeName(username);
//     const allUsers = await MainUser.find().select("username _id createdBy");
//     const userMap = {};
//     allUsers.forEach(u => userMap[normalizeName(u.username)] = u._id);

//     const drawLabel = summaryLabelMap[timeLabel.trim()] || timeLabel.trim().toUpperCase();

//     // Group newEntries by scheme
//     const schemeCounts = {};
//     newEntries.forEach(e => {
//       let scheme = extractBaseType(e.type);
//       const count = Number(e.count) || 1;
//       schemeCounts[scheme] = (schemeCounts[scheme] || 0) + count;
//     });

//     const totalCount = Object.values(schemeCounts).reduce((a, b) => a + b, 0);

//     // 1. Build the ancestral path (Seller -> Parent -> Grandparent...)
//     const path = [];
//     let currentName = normUsername;
//     const visited = new Set(); // Prevent potential cycles

//     while (currentName && !visited.has(currentName)) {
//       visited.add(currentName);
//       path.push(currentName);
//       const user = allUsers.find(u => normalizeName(u.username) === currentName);
//       currentName = normalizeName(user?.createdBy);
//     }

//     // 2. Process each level in the hierarchy
//     for (const currentUser of path) {
//       const isSeller = (currentUser === normUsername);
//       const userId = userMap[currentUser];
//       if (!userId) continue;

//       // Calculate total amount for this specific user based on their rates
//       const rateMaster = await RateMaster.findOne({
//         user: { $regex: new RegExp(`^${currentUser}$`, 'i') },
//         draw: drawLabel
//       });
//       const rateLookup = {};
//       (rateMaster?.rates || []).forEach(r => {
//         const key = (r.label || r.name || "").toUpperCase();
//         if (key) {
//           rateLookup[key] = Number(r.rate) || getRateForType(key);
//         }
//       });

//       let batchAmount = 0;
//       const schemeBatchAmounts = {};
//       Object.entries(schemeCounts).forEach(([scheme, count]) => {
//         const rate = rateLookup[scheme] ?? getRateForType(scheme);
//         const amt = count * rate;
//         batchAmount += amt;
//         schemeBatchAmounts[scheme] = amt;
//       });

//       // 1. Ensure a summary document exists for this (user, date, draw)
//       const summary = await SalesReportSummary.findOneAndUpdate(
//         { createdBy: currentUser, date: dateStr, drawTime: drawLabel },
//         {
//           $setOnInsert: { userId: userId, schemes: [{ rows: [] }] },
//           $inc: {
//             totalCount: totalCount,
//             totalAmount: batchAmount,
//             [isSeller ? "selfCount" : "childCount"]: totalCount,
//             [isSeller ? "selfAmount" : "childAmount"]: batchAmount
//           }
//         },
//         { upsert: true, new: true }
//       );

//       // 2. Identify which schemes in this batch are already in the document
//       const existingRows = summary.schemes?.[0]?.rows || [];
//       const existingSchemeNames = existingRows.map(r => r.scheme);

//       const rowsToUpdate = Object.keys(schemeCounts).filter(s => existingSchemeNames.includes(s));
//       const rowsToPush = Object.keys(schemeCounts).filter(s => !existingSchemeNames.includes(s));

//       // 3. Update existing rows using positional operator
//       const levelOps = rowsToUpdate.map(scheme => {
//         return SalesReportSummary.updateOne(
//           { _id: summary._id, "schemes.0.rows.scheme": scheme },
//           {
//             $inc: {
//               "schemes.0.rows.$.count": schemeCounts[scheme],
//               "schemes.0.rows.$.amount": schemeBatchAmounts[scheme]
//             }
//           }
//         );
//       });

//       // 4. Push new rows
//       if (rowsToPush.length > 0) {
//         const newRows = rowsToPush.map(s => ({
//           scheme: s,
//           count: schemeCounts[s],
//           amount: schemeBatchAmounts[s]
//         }));
//         levelOps.push(
//           SalesReportSummary.updateOne(
//             { _id: summary._id },
//             { $push: { "schemes.0.rows": { $each: newRows } } }
//           )
//         );
//       }

//       if (levelOps.length > 0) {
//         await Promise.all(levelOps);
//       }
//     }

//     console.log(`✅ [updateAutomaticSummary] Recursively updated summaries for ${username} tree (${drawLabel})`);
//   } catch (err) {
//     console.error("❌ [updateAutomaticSummary] Error:", err);
//   }
// }

async function updateAutomaticSummary(username, dateStr, timeLabel, timeCode, newEntries) {
  try {
    const normUsername = normalizeName(username);
    const allUsers = await MainUser.find().select("username _id createdBy");

    const userMap = {};
    allUsers.forEach(u => {
      userMap[normalizeName(u.username)] = u._id;
    });

    const drawKey = (timeLabel || "").trim().toUpperCase();
    const drawLabel = summaryLabelMap[drawKey] || drawKey;

    /* -------------------------------
       1️⃣ Group entries by scheme
    -------------------------------- */
    const schemeCounts = {};
    newEntries.forEach(e => {
      const scheme = extractBaseType(e.type);
      const count = Number(e.count) || 1;
      schemeCounts[scheme] = (schemeCounts[scheme] || 0) + count;
    });

    const totalCount = Object.values(schemeCounts).reduce((a, b) => a + b, 0);

    /* -------------------------------
       2️⃣ Build hierarchy path
    -------------------------------- */
    const path = [];
    let currentName = normUsername;
    const visited = new Set();

    while (currentName && !visited.has(currentName)) {
      visited.add(currentName);
      path.push(currentName);
      const user = allUsers.find(u => normalizeName(u.username) === currentName);
      currentName = normalizeName(user?.createdBy);
    }

    /* -------------------------------
       3️⃣ CALCULATE CHILD RATES ONCE
    -------------------------------- */
    const labelsToSearch = [drawLabel];
    if (drawKey !== drawLabel) labelsToSearch.push(drawKey);
    if (!labelsToSearch.includes("All")) labelsToSearch.push("All");

    const childRateMaster = await RateMaster.findOne({
      user: { $regex: new RegExp(`^${normUsername}$`, "i") },
      draw: { $in: labelsToSearch.map(d => new RegExp(`^${d}$`, "i")) }
    }).sort({ draw: -1 }); // Specific draw > "All"

    const childRateLookup = {};
    (childRateMaster?.rates || []).forEach(r => {
      const key = (r.label || r.name || "").toUpperCase();
      if (key) childRateLookup[key] = Number(r.rate);
    });

    // 🔥 CHILD RATE SOURCE (USED BY ALL LEVELS)
    const schemeRates = {};
    Object.keys(schemeCounts).forEach(scheme => {
      schemeRates[scheme] =
        childRateLookup[scheme] ?? getRateForType(scheme);
    });

    /* -------------------------------
       4️⃣ Update each level
    -------------------------------- */
    for (const currentUser of path) {
      const isSeller = currentUser === normUsername;
      const userId = userMap[currentUser];
      if (!userId) continue;

      let batchAmount = 0;
      const schemeBatchAmounts = {};

      Object.entries(schemeCounts).forEach(([scheme, count]) => {
        const rate = schemeRates[scheme]; // ✅ SAME RATE FOR CHILD & PARENT
        const amt = count * rate;
        batchAmount += amt;
        schemeBatchAmounts[scheme] = amt;
      });

      const summary = await SalesReportSummary.findOneAndUpdate(
        { createdBy: currentUser, date: dateStr, drawTime: drawLabel },
        {
          $setOnInsert: { userId, schemes: [{ rows: [] }] },
          $inc: {
            totalCount,
            totalAmount: batchAmount,
            [isSeller ? "selfCount" : "childCount"]: totalCount,
            [isSeller ? "selfAmount" : "childAmount"]: batchAmount
          }
        },
        { upsert: true, new: true }
      );

      const existingRows = summary.schemes?.[0]?.rows || [];
      const existingSchemeNames = existingRows.map(r => r.scheme);

      const rowsToUpdate = Object.keys(schemeCounts).filter(s => existingSchemeNames.includes(s));
      const rowsToPush = Object.keys(schemeCounts).filter(s => !existingSchemeNames.includes(s));

      const ops = [];

      rowsToUpdate.forEach(scheme => {
        ops.push(
          SalesReportSummary.updateOne(
            { _id: summary._id, "schemes.0.rows.scheme": scheme },
            {
              $inc: {
                "schemes.0.rows.$.count": schemeCounts[scheme],
                "schemes.0.rows.$.amount": schemeBatchAmounts[scheme]
              }
            }
          )
        );
      });

      if (rowsToPush.length > 0) {
        ops.push(
          SalesReportSummary.updateOne(
            { _id: summary._id },
            {
              $push: {
                "schemes.0.rows": {
                  $each: rowsToPush.map(s => ({
                    scheme: s,
                    count: schemeCounts[s],
                    amount: schemeBatchAmounts[s]
                  }))
                }
              }
            }
          )
        );
      }

      if (ops.length) await Promise.all(ops);
    }

    console.log(`✅ updateAutomaticSummary FIXED for ${username} (${drawLabel})`);
  } catch (err) {
    console.error("❌ updateAutomaticSummary error:", err);
  }
}

const createSalesReportSummary = async (req, res) => {
  try {
    const { userId, createdBy, date, drawTime, schemes } = req.body;

    if (!userId || !createdBy || !date || !drawTime || !schemes) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    /* 1️⃣ CALCULATE TOTAL COUNT */
    let totalCount = 0;

    schemes.forEach(block => {
      block.rows.forEach(row => {
        totalCount += Number(row.count) || 0;
      });
    });

    /* 2️⃣ SAVE SUMMARY (NO CALCULATION, NO ENTRY, NO RATE) */
    const summary = await SalesReportSummary.create({
      userId,
      createdBy,
      date,
      drawTime,
      totalCount,
      totalAmount: 0, // explicitly zero
      schemes
    });

    res.status(201).json({
      message: "Sales summary saved",
      data: summary
    });

  } catch (err) {
    console.error("❌ createSalesReportSummary error:", err);
    res.status(500).json({ error: err.message });
  }
};







const getSalesReportSummary = async (req, res) => {
  try {
    const { fromDate, toDate, drawTime, userId, createdBy } = req.query;

    const filter = {};

    if (userId) filter.userId = userId;
    if (createdBy) filter.createdBy = createdBy;
    if (drawTime && drawTime !== "ALL") {
      filter.drawTime = drawTime.toUpperCase();
    }

    if (fromDate && toDate) {
      filter.createdAt = {
        $gte: new Date(`${fromDate}T00:00:00.000Z`),
        $lte: new Date(`${toDate}T23:59:59.999Z`)
      };
    }

    const summaries = await SalesReportSummary
      .find(filter)
      .sort({ createdAt: -1 });

    const totalCount = summaries.reduce((s, r) => s + (r.totalCount || 0), 0);
    const totalAmount = summaries.reduce((s, r) => s + (r.totalAmount || 0), 0);

    res.json({
      count: totalCount,
      amount: totalAmount,
      records: summaries.length,
      data: summaries
    });

  } catch (err) {
    console.error("❌ getSalesReportSummary error:", err);
    res.status(500).json({ message: err.message });
  }
};







const deleteUserAmount = async (req, res) => {
  try {
    const { id } = req.params;
    await UserAmount.findByIdAndDelete(id);
    res.status(200).json({ message: "Limit deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createUser,
  addEntries,
  getAllUsers,
  saveTicketLimit,
  saveRateMaster,
  saveResult,
  getResult,
  loginUser,
  getEntries,
  getNextBillNumber,
  invalidateEntry,
  deleteEntryById, // ✅ add this
  deleteEntriesByBillNo,
  updateEntryCount,
  getCountReport,
  getRateMaster,
  setBlockTime,
  getBlockTime,
  getBlockTimeByType,
  deleteUser,
  updateUser,
  countByNumber,
  getLatestTicketLimit,
  toggleLoginBlock,
  toggleSalesBlock,
  updatePasswordController,
  netPayMultiday,
  getUserRates,
  getWinningReport,
  saveValidEntries,
  getSalesReport, getBlockedDates, addBlockDate, deleteBlockDate,
  getAllBlockTimes,
  getusersByid,
  // Block Number functions
  getBlockedNumbers,
  addBlockedNumbers,
  updateBlockedNumber,
  deleteBlockedNumber,
  getBlockedNumbersByUser,
  bulkDeleteBlockedNumbers,
  getEntriesWithTimeBlock,
  getOverflowLimit,
  saveOverflowLimit,
  getOverflowLimitByDrawTime,
  getDrawByTabAndName,
  addDrawToTab,
  updateSuperForDraw,
  addUserAmount,
  getUserAmounts,
  updateAmountOnly,
  deleteUserAmount,
  createSalesReportSummary,
  getSalesReportSummary,
  syncSummaries
};
