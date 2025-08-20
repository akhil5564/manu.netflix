const MainUser = require('./model/MainUser');
const Entry = require('./model/Entry');
const bcrypt = require('bcryptjs');
const RateMaster = require('./model/RateMaster');
const Result = require('./model/ResultModel');
const BlockTime = require('./model/BlockTime');

const TicketLimit = require('./model/TicketLimit'); // create this model
const BillCounter = require('./model/BillCounter');
const User = require('./model/MainUser'); // adjust the path to where your MainUser.js is



// Delete user controller
const deleteUser = async (req, res) => {
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

    console.log('✅ Returning counts for date', date, countMap);
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
const setBlockTime = async (req, res) => {
  const { blocks } = req.body;

  if (!Array.isArray(blocks)) {
    return res.status(400).json({ message: 'blocks must be an array' });
  }

  try {
    const results = await Promise.all(
      blocks.map(({ draw, blockTime, unblockTime }) => {
        if (!draw || !blockTime || !unblockTime) {
          throw new Error('draw, blockTime, and unblockTime are all required.');
        }
        return BlockTime.findOneAndUpdate(
          { drawLabel: draw },
          { blockTime, unblockTime },
          { upsert: true, new: true }
        );
      })
    );

    return res.status(200).json({
      message: 'Block and Unblock times saved',
      results,
    });
  } catch (error) {
    console.error('Error saving block time:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
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
    } = req.query;

    const query = { isValid: true };

    if (createdBy) query.createdBy = createdBy;
    if (timeCode) query.timeCode = timeCode;
    if (timeLabel) query.timeLabel = timeLabel;
    if (number) query.number = number;
    if (count) query.count = parseInt(count);
    if (billNo) query.billNo = billNo;

    // Single date filter
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: start, $lte: end };
    }
    // Date range filter
    else if (fromDate && toDate) {
      const start = new Date(fromDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: start, $lte: end };
    }

    const entries = await Entry.find(query).sort({ createdAt: -1 });
    res.status(200).json(entries);
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
    const { id } = req.params;

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

    if (!group1 || !group2 || !group3 || !createdBy) {
      return res.status(400).json({ message: 'Missing data' });
    }

    const saved = new TicketLimit({
      group1,
      group2,
      group3,
      createdBy,
      date: new Date().toLocaleDateString('en-GB'), // Optional
    });

    await saved.save();

    res.status(201).json({ message: 'Ticket limit saved successfully' });
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
    const { fromDate, toDate, time } = req.query;

    if (!time) {
      return res.status(400).json({ message: 'Missing time parameter' });
    }

    // Validate dates: If fromDate and toDate are provided, use them; else fallback to single date query
    if ((!fromDate || !toDate) && !req.query.date) {
      return res.status(400).json({ message: 'Missing date or date range parameters' });
    }

    let query = { time };

    if (fromDate && toDate) {
      // Query for all results between fromDate and toDate (inclusive)
      query.date = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      };
    } else if (req.query.date) {
      query.date = req.query.date;
    }

    // Find all matching result documents
    const resultDocs = await Result.find(query).lean();

    if (!resultDocs || resultDocs.length === 0) {
      return res.status(404).json({ message: 'No results found for given parameters' });
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

    res.json(results); // returns array of result objects for each date
  } catch (error) {
    console.error('[GET RESULT ERROR]', error);
    res.status(500).json({ message: 'Failed to fetch result' });
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

    const billNo = await getNextBillNumber(); // e.g., '00001', '00002' 

    const toSave = entries.map(e => ({
      ...e,
      timeLabel,
      timeCode,
      createdBy,
      billNo,
      toggleCount,
      createdAt: new Date(),
      date: new Date(date), // ✅ save the computed entry date
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

    const rateDoc = await RateMaster.findOne({ user, draw });
    if (!rateDoc) {
      return res.status(404).json({ message: 'No rate found' });
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
    const { count } = req.body;
    if (!count || isNaN(count)) return res.status(400).json({ message: 'Invalid count' });

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
    const { date, time, agent, group } = req.query;

    const query = { isValid: true };

    if (date) {
      const start = new Date(date + 'T00:00:00.000Z');
      const end = new Date(date + 'T23:59:59.999Z');
      query.createdAt = { $gte: start, $lte: end };
    }

    if (agent) {
      query.createdBy = agent;
    }

    if (time && time !== 'ALL') {
      query.timeLabel = time;
    }

    const entries = await Entry.find(query);

    const countMap = {};

    entries.forEach(entry => {
      const key = group === 'true'
        ? entry.number // Group only by number
        : `${entry.number}_${entry.ticket}`; // Group by number + ticket name

      if (!countMap[key]) {
        countMap[key] = {
          number: entry.number,
          ticketName: group === 'true' ? null : entry.ticket,
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

    const users = await MainUser.find(query).select('-password');
    res.status(200).json(users);
  } catch (error) {
    console.error('[GET USERS ERROR]', error);
    res.status(500).json({ message: 'Failed to fetch users' });
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
  deleteUser,
  countByNumber,
  getLatestTicketLimit,
  toggleLoginBlock,
  toggleSalesBlock,
  updatePasswordController

};
