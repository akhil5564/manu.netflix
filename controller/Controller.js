
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

  // Normalize different time formats to standard format
  if (time === 'DEAR 1PM' || time === 'DEAR 1 PM' || time === 'DEAR1PM') {
    return 'DEAR 1PM';
  } else if (time === 'DEAR 8PM' || time === 'DEAR 8 PM' || time === 'DEAR8PM') {
    return 'DEAR 8PM';
  } else if (time === 'DEAR 6PM' || time === 'DEAR 6 PM' || time === 'DEAR6PM') {
    return 'DEAR 6PM';
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
    // If loggedInUser exists → adjust rates
    if (loggedInUser && entries.length > 0) {
      // Get unique draws
      const uniqueDraws = [...new Set(entries.map(e => e.timeLabel))];

      // Fetch rate masters for this user
      const rateMastersByDraw = {};
      for (const draw of uniqueDraws) {
        let rateMasterQuery = { user: loggedInUser, draw };
        if (draw === "LSK 3 PM") {
          rateMasterQuery.draw = "KERALA 3 PM"; // your special case
        }

        const rateMaster = await RateMaster.findOne(rateMasterQuery);
        const rateLookup = {};
        (rateMaster?.rates || []).forEach(r => {
          rateLookup[r.label] = Number(r.rate) || 10;
        });
        rateMastersByDraw[draw] = rateLookup;
      }

      // Apply rates to entries
      const extractBetType = (typeStr) => {
        if (!typeStr) return "SUPER";
        if (typeStr.toUpperCase().includes("SUPER")) return "SUPER";
        if (typeStr.toUpperCase().includes("BOX")) return "BOX";
        if (typeStr.toUpperCase().includes("AB")) return "AB";
        if (typeStr.toUpperCase().includes("BC")) return "BC";
        if (typeStr.toUpperCase().includes("AC")) return "AC";
        if (typeStr.includes("-A") || typeStr.endsWith("A")) return "A";
        if (typeStr.includes("-B") || typeStr.endsWith("B")) return "B";
        if (typeStr.includes("-C") || typeStr.endsWith("C")) return "C";
        return typeStr.split("-").pop();
      };

      entries.forEach(e => {
        const betType = extractBetType(e.type);
        const rateLookup = rateMastersByDraw[e.timeLabel] || {};
        const rate = rateLookup[betType] ?? 10; // fallback default
        e.rate = rate * (Number(e.count) || 0);
      });
    }
    res.status(200).json(entries);
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
    // If loggedInUser exists → adjust rates
    if (loggedInUser && entries.length > 0) {
      // Get unique draws
      const uniqueDraws = [...new Set(entries.map(e => e.timeLabel))];

      // Fetch rate masters for this user
      const rateMastersByDraw = {};
      for (const draw of uniqueDraws) {
        let rateMasterQuery = { user: loggedInUser, draw };
        if (draw === "LSK 3 PM") {
          rateMasterQuery.draw = "KERALA 3 PM"; // your special case
        }

        const rateMaster = await RateMaster.findOne(rateMasterQuery);
        const rateLookup = {};
        (rateMaster?.rates || []).forEach(r => {
          rateLookup[r.label] = Number(r.rate) || 10;
        });
        rateMastersByDraw[draw] = rateLookup;
      }

      // Apply rates to entries
      const extractBetType = (typeStr) => {
        if (!typeStr) return "SUPER";
        if (typeStr.toUpperCase().includes("SUPER")) return "SUPER";
        if (typeStr.toUpperCase().includes("BOX")) return "BOX";
        if (typeStr.toUpperCase().includes("AB")) return "AB";
        if (typeStr.toUpperCase().includes("BC")) return "BC";
        if (typeStr.toUpperCase().includes("AC")) return "AC";
        if (typeStr.includes("-A") || typeStr.endsWith("A")) return "A";
        if (typeStr.includes("-B") || typeStr.endsWith("B")) return "B";
        if (typeStr.includes("-C") || typeStr.endsWith("C")) return "C";
        return typeStr.split("-").pop();
      };

      entries.forEach(e => {
        const betType = extractBetType(e.type);
        const rateLookup = rateMastersByDraw[e.timeLabel] || {};
        const rate = rateLookup[betType] ?? 10; // fallback default
        e.rate = rate * (Number(e.count) || 0);
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

    const toSave = entries.map(e => ({
      ...e,
      rate: e.rate || Number(e?.total || (e.number.length === 1 ? 12 : 10) * e.count).toFixed(2),
      timeLabel,
      timeCode,
      createdBy,
      billNo,
      toggleCount,
      createdAt: new Date(),
      date: new Date(date),
    }));

    await Entry.insertMany(toSave);
    res.status(200).json({ message: 'Entries saved successfully', billNo });
  } catch (error) {
    console.error('[SAVE ENTRY ERROR]', error);
    res.status(500).json({ message: 'Server error saving entries' });
  }
};




// ✅ Get Result (by date and time)
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

    // ✅ Update existing document OR create new if not exists
    const updatedRate = await RateMaster.findOneAndUpdate(
      { user, draw },                     // match user + draw
      { $set: { rates } },                // update rates only
      { new: true, upsert: true }         // return new doc, create if missing
    );

    res.status(200).json({
      message: "✅ Rate master saved/updated successfully",
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



// ✅ New: Get total count grouped by number
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
      let ticket = extractBetType(entry.type)
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



// ✅ Get All Users (optionally filter by createdBy)
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
const calculateWinAmount = (entry, results) => {
  if (!results || !results["1"]) return 0;

  const firstPrize = results["1"];
  const others = Array.isArray(results.others) ? results.others : [];
  const allPrizes = [
    results["1"],
    results["2"],
    results["3"],
    results["4"],
    results["5"],
    ...others,
  ].filter(Boolean);

  const num = entry.number;
  const count = entry.count || 0;
  const baseType = extractBetType(entry.type);

  let winAmount = 0;

  if (baseType === "SUPER") {
    const prizePos = allPrizes.indexOf(num) + 1;
    if (prizePos > 0) {
      winAmount = (payouts.SUPER[prizePos] || payouts.SUPER.other) * count;
    }
  } else if (baseType === "BOX") {
    if (num === firstPrize) {
      winAmount = isDoubleNumber(firstPrize)
        ? payouts.BOX.double.perfect * count
        : payouts.BOX.normal.perfect * count;
    } else if (
      num.split("").sort().join("") === firstPrize.split("").sort().join("")
    ) {
      winAmount = isDoubleNumber(firstPrize)
        ? payouts.BOX.double.permutation * count
        : payouts.BOX.normal.permutation * count;
    }
  } else if (baseType === "AB" && num === firstPrize.slice(0, 2)) {
    winAmount = payouts.AB_BC_AC * count;
  } else if (baseType === "BC" && num === firstPrize.slice(1, 3)) {
    winAmount = payouts.AB_BC_AC * count;
  } else if (baseType === "AC" && num === firstPrize[0] + firstPrize[2]) {
    winAmount = payouts.AB_BC_AC * count;
  } else if (baseType === "A" && num === firstPrize[0]) {
    winAmount = payouts.A_B_C * count;
  } else if (baseType === "B" && num === firstPrize[1]) {
    winAmount = payouts.A_B_C * count;
  } else if (baseType === "C" && num === firstPrize[2]) {
    winAmount = payouts.A_B_C * count;
  }

  return winAmount;
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
  const { fromDate, toDate, time, agent,fromAccountSummary,loggedInUser } = req.body;
  // console.log('req.body=>>>>>>>>>>>>>>>>', req.body);

  try {
    const users = await MainUser.find().select("-password -nonHashedPassword");

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
      date: { $gte: start, $lte: end }
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

    let resultQuery = { date: { $gte: fromDate, $lte: toDate } };

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
      const entryDateStr = formatDateIST(new Date(entry.date));
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

      const betType = extractBetType(entry.type); 
      // console.log('drawRateMap', drawRateMap)
      // console.log('betType', betType)
      const rate = drawRateMap[betType] ?? 10;
      // console.log('rate', rate)
      const winAmount = calculateWinAmount(entry, normalizedResult);
      // console.log('winAmount', winAmount)

      return {
        ...entry.toObject(),
        winAmount,
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

// function extractBetType(typeStr) {
//   if (!typeStr) return "";
//   const parts = typeStr.split("-");
//   return parts[parts.length - 1]; // Get the last part (SUPER, BOX, etc.)
// }
const extractBetType = (typeStr) => {
  // console.log('typeStr', typeStr);
  if (!typeStr) return "SUPER";

  // Handle different patterns: LSK3SUPER, D-1-A, etc.
  if (typeStr.toUpperCase().includes("SUPER")) {
    return "SUPER";
  } else if (typeStr.toUpperCase().includes("BOX")) {
    return "BOX";
  } else if (typeStr.toUpperCase().includes("AB")) {
    return "AB";
  } else if (typeStr.toUpperCase().includes("BC")) {
    return "BC";
  } else if (typeStr.toUpperCase().includes("AC")) {
    return "AC";
  } else if (typeStr.includes("-A") || typeStr.endsWith("A")) {
    return "A";
  } else if (typeStr.includes("-B") || typeStr.endsWith("B")) {
    return "B";
  } else if (typeStr.includes("-C") || typeStr.endsWith("C")) {
    return "C";
  }

  // Fallback: extract from parts
  const parts = typeStr.split("-");
  return parts[parts.length - 1];
};
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
  const baseType = extractBetType(entry.type);
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
const getWinningReport = async (req, res) => {
  try {
    const { fromDate, toDate, time, agent } = req.body;
    // console.log("\n==============================");
    // console.log("📥 getWinningReport request:", req.body);

    if (!fromDate || !toDate || !time) {
      return res.status(400).json({ message: "fromDate, toDate, and time are required" });
    }

    // --- 1) Users + descendants ---
    const users = await MainUser.find().select("-password");

    function getAllDescendants(username, usersList, visited = new Set()) {
      if (visited.has(username)) return [];
      visited.add(username);
      const children = usersList.filter(u => u.createdBy === username).map(u => u.username);
      let all = [...children];
      children.forEach(child => {
        all = all.concat(getAllDescendants(child, usersList, visited));
      });
      return all;
    }

    const agentUsers = agent ? [agent, ...getAllDescendants(agent, users)] : users.map(u => u.username);
    // console.log("👥 Agent Users:", agentUsers);

    // build user->scheme map
    const userSchemeMap = {};
    users.forEach(u => { userSchemeMap[u.username] = u.scheme || "N/A"; });

    // --- 2) Date range ---
    const start = parseDateISTStart(fromDate);
    const end = parseDateISTEnd(toDate);
    // console.log("📅 Date Range (IST):", { 
    //   start: formatDateIST(start) + ' 00:00:00 IST', 
    //   end: formatDateIST(end) + ' 23:59:59 IST',
    //   startUTC: start.toISOString(),
    //   endUTC: end.toISOString()
    // });

    // --- 3) Entries ---
    const entryQuery = {
      createdBy: { $in: agentUsers },
      isValid: true,
      createdAt: { $gte: start, $lte: end },   // ✅ use createdAt instead of date
    };
    if (time !== "ALL") entryQuery.timeLabel = time;

    const entries = await Entry.find(entryQuery).lean();
    // console.log("📝 Entries fetched:", entries.length);
    // if (entries.length > 0) {
    //   console.log("🔹 Example entry:", entries[0]);
    // }

    if (entries.length === 0) {
      // console.log("⚠️ No entries found.");
      return res.json({ message: "No entries found", bills: [], grandTotal: 0 });
    }

    // --- 4) Results ---
    const allDates = getDatesBetween(new Date(fromDate), new Date(toDate))
      .map(d => formatDateIST(d)); // ['2025-08-20', '2025-08-21', ...]

    const resultQuery = { date: { $in: allDates } };
    const normalizedTime = parseTimeValue(time);
    if (normalizedTime) {
      resultQuery.time = normalizedTime;
    }
    const resultDocs = await Result.find(resultQuery).lean();
    // console.log('resultQuery', resultQuery)
    // console.log("🏆 Results fetched:==", resultDocs.length);
    // console.log("🏆 Results fetched:==", resultDocs);


    // Group results by time
    const resultsByTime = {};
    for (const r of resultDocs) {
      if (!resultsByTime[r.time]) resultsByTime[r.time] = [];
      resultsByTime[r.time].push(r);
    }
    for (const t in resultsByTime) {
      resultsByTime[t].sort((a, b) => new Date(a.date) - new Date(b.date));
    }
    // console.log("🕒 Results grouped by time:", Object.keys(resultsByTime));

    function findDayResult(dateStr, timeLabel) {
      const normalizedTime = parseTimeValue(timeLabel);
      const list = resultsByTime[normalizedTime] || [];
      // console.log('list==========', list);
      const found = [...list].reverse().find(r => {
        const rd = formatDateIST(new Date(r.date));
        return rd === dateStr;
      });
      if (!found) return null;
      const firstFive = Array.isArray(found.prizes) ? found.prizes : [];
      const othersRaw = Array.isArray(found.entries) ? found.entries : [];
      const others = othersRaw.map(e => e.result).filter(Boolean);
      return {
        "1": firstFive[0] || null,
        "2": firstFive[1] || null,
        "3": firstFive[2] || null,
        "4": firstFive[3] || null,
        "5": firstFive[4] || null,
        others
      };
    }

    // --- 5) Evaluate wins ---
    const winningEntries = [];
    for (const e of entries) {
      // console.log('entries============', e)
      const dateObj = new Date(e.date); // ✅ match frontend behavior
      const ds = formatDateIST(dateObj);

      const dayResult = findDayResult(ds, e.timeLabel);
      // console.log(`\n➡️ Checking entry bill:${e.billNo}, num:${e.number}, type:${e.type}, date:${ds}, time:${e.timeLabel}`);
      if (!dayResult) {
        // console.log("   ❌ No matching result found for this entry.");
        continue;
      }

      const amount = calculateWinAmount(e, dayResult);
      const winType = computeWinType(e, dayResult);
      // console.log("   ✅ Found result, winAmount:", amount, "winType:", winType);

      if (amount > 0) {
        // console.log('entries============', e)
        winningEntries.push({
          ...e,
          date: ds,
          winAmount: amount,
          baseType: extractBetType(e.type),
          winType,
          name: e.name || "-", 
        });
      }
    }

    // console.log("✅ Total winning entries:", winningEntries.length);

    if (winningEntries.length === 0) {
      // console.log("⚠️ No winning entries after evaluation.");
      return res.json({ message: "No winning entries found", bills: [], grandTotal: 0 });
    }

    // --- 6) Group into bills ---
    const billsMap = {};
    for (const w of winningEntries) {
      if (!billsMap[w.billNo]) {
        billsMap[w.billNo] = {
          billNo: w.billNo,
          createdBy: w.createdBy,
          scheme: userSchemeMap[w.createdBy] || "N/A",
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
        name: w.name || "-",
      });
      billsMap[w.billNo].total += w.winAmount;
    }

    const bills = Object.values(billsMap);
    const grandTotal = bills.reduce((acc, bill) => acc + bill.total, 0);

    // console.log("📦 Bills grouped:", bills.length, "GrandTotal:", grandTotal);

    return res.json({ fromDate, toDate, time, agent: agent || "All Agents", grandTotal, bills, usersList: users.map(u => u.username) });
  } catch (err) {
    console.error("[getWinningReport ERROR]", err);
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
// Pure function, no req/res
const addEntriesF = async ({ entries, timeLabel, timeCode, createdBy, toggleCount, date }) => {
  if (!entries || entries.length === 0) {
    throw new Error("No entries provided");
  }
  // console.log('date=============', date)
  if (!date) {
    throw new Error("Date is required");
  }

  const billNo = await getNextBillNumber();

  const toSave = entries.map((e) => ({
    ...e,
    rate:
      e.rate ||
      Number(
        e?.total || (e.number.length === 1 ? 12 : 10) * e.count
      ).toFixed(2),
      timeLabel,
    timeCode,
    createdBy,
    billNo,
    toggleCount,
    createdAt: new Date(),
    date: new Date(date),
  }));
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
    // console.log('todayStr==============', todayStr)
    // const datesss = await BlockDate.find({});
    // console.log('exists1=============', datesss)
    const blockedDates = await BlockDate.findOne({ date: todayStr, ticket: normalizedLabel });
    // console.log('blockedDates==============', blockedDates)

    if (blockedDates) {
      return res.status(400).json({ message: 'Today is blocked for this ticket ' });
    }
    // 1️⃣ Get block/unblock time
    const blockTimeData = await getBlockTimeF(timeLabel, loggedInUserType);
    if (!blockTimeData) {
      return res.status(400).json({ message: `No block time configuration found for draw: ${timeLabel}` });
    }
    const { blockTime, unblockTime } = blockTimeData;
    if (!blockTime || !unblockTime) return res.status(400).json({ message: 'Block or unblock time missing' });


    // const block = new Date(`${todayStr}T${blockTime}:00`);
    // const unblock = new Date(`${todayStr}T${unblockTime}:00`);
    const [bh, bm] = blockTime.split(':').map(Number);
    const [uh, um] = unblockTime.split(':').map(Number);

    const block = new Date(now.getFullYear(), now.getMonth(), now.getDate(), bh, bm);
    // console.log('block', block)
    const unblock = new Date(now.getFullYear(), now.getMonth(), now.getDate(), uh, um);
    // console.log('unblock', unblock)
    // console.log('unblock', now >= block );
    // console.log('unblock', now < unblock)

    if (now >= block && now < unblock) {
      return res.status(403).json({ message: 'Entry time is blocked for this draw' });
    }
    // Decide target date: after unblock -> next day, else today
    const targetDateObj = new Date(now);
    if (now >= unblock) {
      targetDateObj.setDate(targetDateObj.getDate() + 1);
    }
    const targetDateStr = formatDateIST(targetDateObj);

    // 2️⃣ Fetch ticket limits
    const limits = await getTicketLimits();
    if (!limits) {
      return res.status(400).json({ message: 'No ticket limits configuration found. Please set up ticket limits first.' });
    }
    const allLimits = { ...limits.group1, ...limits.group2, ...limits.group3 };

    // 3️⃣ Sum counts per type-number for new entries
    const newTotalByNumberType = {};
    entries.forEach((entry) => {
      const rawType = entry.type.replace(timeCode, '').replace(/-/g, '').toUpperCase();
      const key = `${rawType}-${entry.number}`;
      newTotalByNumberType[key] = (newTotalByNumberType[key] || 0) + (entry.count || 1);
    });

    // 4️⃣ Fetch remaining from DailyLimitUsage (per-day persisted remaining)
    const keys = Object.keys(newTotalByNumberType);
    const remainingMap = await countByUsageF(targetDateStr, keys);

    // 5️⃣ Validate entries
    const validEntries = [];
    const exceededEntries = [];

    for (const entry of entries) {
      const count = entry.count || 1;
      const rawType = entry.type.replace(timeCode, '').replace(/-/g, '').toUpperCase();
      const number = entry.number;
      const key = `${rawType}-${number}`;

      const maxLimit = parseInt(allLimits[rawType] || '9999', 10);
      const remainingFromDb = remainingMap[key]?.remaining;  // <-- use key including number
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
      const rawTypes = await extractBetType(entry.type)
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
      const rawTypes = await extractBetType(entry.type);
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
        const rawType = await extractBetType(entry.type);
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
const getSalesReport = async (req, res) => {
  try {
    const { fromDate, toDate, createdBy, timeLabel, loggedInUser } = req.query;

    // console.log("📥 getSalesReport request:", req.query);

    // 1️⃣ Build agent list (loggedInUser or createdBy + descendants)
    const allUsers = await MainUser.find().select("username createdBy");
    let agentList = [];
    if (!createdBy) {
      agentList = [loggedInUser, ...getDescendants(loggedInUser, allUsers)];
    } else {
      agentList = [createdBy, ...getDescendants(createdBy, allUsers)];
    }
    // console.log("👥 Agent Users (backend):", agentList);

    // 2️⃣ Build query for entries
    const entryQuery = {
      createdBy: { $in: agentList },
      date: { $gte: new Date(fromDate), $lte: new Date(toDate) },
    };
    if (timeLabel && timeLabel !== "all") {
      entryQuery.timeLabel = timeLabel;
    }

    const entries = await Entry.find(entryQuery);
    const last10Entries = await Entry.find({}).sort({ _id: -1 }).limit(2);
    // console.log("entrie===========11", entryQuery)
    // console.log("entrie===========12", last10Entries)
    // console.log("entrie===========13", entries);
    // console.log("📝 Entries fetched (backend):", entries.length);
    // if (entries.length > 0) console.log("🔹 Example entry:", entries[0]);

    // 3️⃣ Fetch RateMaster for each draw
    const userForRate = loggedInUser;

    // console.log('userForRate===========', userForRate)
    // console.log('timeLabel===========', timeLabel)

    // Get unique draws from entries
    const uniqueDraws = [...new Set(entries.map(entry => entry.timeLabel))];
    // console.log('uniqueDraws===========', uniqueDraws);

    // Fetch rate masters for each draw
    const rateMastersByDraw = {};
    for (const draw of uniqueDraws) {
      let rateMasterQuery = { user: userForRate };

      if (draw === "LSK 3 PM") {
        rateMasterQuery.draw = "KERALA 3 PM";
      } else {
        rateMasterQuery.draw = draw;
      }

      // console.log(`rateMasterQuery for ${draw}:`, rateMasterQuery);
      const rateMaster = await RateMaster.findOne(rateMasterQuery);
      // console.log(`rateMaster for ${draw}:`, rateMaster);

      const rateLookup = {};
      (rateMaster?.rates || []).forEach(r => {
        rateLookup[r.label] = Number(r.rate) || 10;
      });
      rateMastersByDraw[draw] = rateLookup;
    }

    // console.log("💰 Rate masters by draw:", rateMastersByDraw);

    // Helper: extract bet type
    const extractBetType = (typeStr) => {
      // console.log('typeStr', typeStr);
      if (!typeStr) return "SUPER";

      // Handle different patterns: LSK3SUPER, D-1-A, etc.
      if (typeStr.toUpperCase().includes("SUPER")) {
        return "SUPER";
      } else if (typeStr.toUpperCase().includes("BOX")) {
        return "BOX";
      } else if (typeStr.toUpperCase().includes("AB")) {
        return "AB";
      } else if (typeStr.toUpperCase().includes("BC")) {
        return "BC";
      } else if (typeStr.toUpperCase().includes("AC")) {
        return "AC";
      } else if (typeStr.includes("-A") || typeStr.endsWith("A")) {
        return "A";
      } else if (typeStr.includes("-B") || typeStr.endsWith("B")) {
        return "B";
      } else if (typeStr.includes("-C") || typeStr.endsWith("C")) {
        return "C";
      }

      // Fallback: extract from parts
      const parts = typeStr.split("-");
      return parts[parts.length - 1];
    };

    // 4️⃣ Calculate totals
    let totalCount = 0;
    let totalSales = 0;

    entries.forEach(entry => {
      const count = Number(entry.count) || 0;
      const betType = extractBetType(entry.type);
      const draw = entry.timeLabel;
      const rateLookup = rateMastersByDraw[draw] || {};
      const rate = rateLookup[betType] ?? 10;

      // console.log(`Entry: ${entry.type}, Draw: ${draw}, BetType: ${betType}, Rate: ${rate}, Count: ${count}`);

      totalCount += count;
      totalSales += count * rate;
      entry.rate = count * rate;
    });

    // 5️⃣ Build optional per-agent summary
    const perAgentMap = {};
    entries.forEach((entry) => {
      const agent = entry.createdBy || "unknown";
      if (!perAgentMap[agent]) {
        perAgentMap[agent] = { agent, count: 0, amount: 0 };
      }
      perAgentMap[agent].count += Number(entry.count) || 0;
      perAgentMap[agent].amount += Number(entry.rate) || 0;
    });
    const byAgent = Object.values(perAgentMap).sort((a, b) => b.amount - a.amount);

    const report = {
      count: totalCount,
      amount: totalSales,
      date: `${fromDate} to ${toDate} (${timeLabel || "all"})`,
      fromDate,
      toDate,
      createdBy,
      timeLabel,
      entries,
      byAgent,
    };

    // console.log("✅ Final Sales Report (backend):", report);
    res.json(report);

  } catch (err) {
    console.error("❌ Error in getSalesReport:", err);
    res.status(500).json({ error: err.message });
  }
};

// Helper (same logic as frontend getDescendants)
function getDescendants(user, allUsers = []) {
  const descendants = [];
  const stack = [user];
  while (stack.length) {
    const current = stack.pop();
    const children = allUsers.filter(u => u.createdBy === current);
    children.forEach(c => {
      descendants.push(c.username);
      stack.push(c.username);
    });
  }
  return descendants;
}


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
  getEntriesWithTimeBlock
};
