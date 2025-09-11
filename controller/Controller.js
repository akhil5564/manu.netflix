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
      loggedInUser
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
    console.log('entries===========', entries)
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
    console.log('req.body', req.body)

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
    let RateMasterQuery={}
    if(user){
      RateMasterQuery.user = user
    }
    if(draw){
      RateMasterQuery.draw = draw
    }if(draw === "LSK 3 PM"){
      RateMasterQuery.draw = "KERALA 3 PM"
    }
    console.log('RateMasterQuery', RateMasterQuery)
    // const allDocs = await RateMaster.find({}).sort({ _id: -1 }).limit(2);
    const allDocs = await RateMaster.find({})
    console.log('All documents:', allDocs);
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

const netPayMultiday = async (req, res) => {
  const { fromDate, toDate, time, agent } = req.body;

  try {
    // 1️⃣ Fetch all users once
    const users = await MainUser.find().select("-password");

    // Recursive helper
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

    // 2️⃣ Determine target agent(s)
    const agentUsers = agent
      ? [agent, ...getAllDescendants(agent, users)]
      : users.map(u => u.username);

    // 3️⃣ Date range query
    const start = new Date(fromDate + "T00:00:00.000Z");
    const end = new Date(toDate + "T23:59:59.999Z");

    // 4️⃣ Fetch all entries in one go (instead of looping per day)
    const entries = await Entry.find({
      createdBy: { $in: agentUsers },
      timeLabel: time,
      createdAt: { $gte: start, $lte: end }
    });

    // 5️⃣ Fetch all results for the same range
    const results = await Result.find({
      time,
      date: { $gte: start, $lte: end }
    }).lean();

    // Make result lookup by date
    const resultByDate = {};
    results.forEach(r => {
      const dateStr = new Date(r.date).toISOString().slice(0, 10); // "YYYY-MM-DD"
      resultByDate[dateStr] = r;
    });

    // 6️⃣ Process entries with result of that day
    const processedEntries = entries.map(entry => {
      const entryDateStr = entry.createdAt.toISOString().slice(0, 10);
      const dayResult = resultByDate[entryDateStr] || null;

      return {
        ...entry.toObject(),
        winAmount: calculateWinAmount(entry, dayResult),
        date: entryDateStr
      };
    });
const userRates = await getUserRates(agentUsers, time, req.body.fromAccountSummary, req.body.loggedInUser);
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
async function getUserRates(usernames, time, fromAccountSummary, loggedInUser) {
  const encodedDraw = time;

  if (fromAccountSummary) {
    // Only fetch loggedInUser rate once
    const adminRateDoc = await RateMaster.findOne({
      user: loggedInUser,
      draw: encodedDraw
    });

    const adminRates = {};
    (adminRateDoc?.rates || []).forEach(r => {
      adminRates[r.label] = r.rate;
    });

    // Apply same rates to all users
    const ratesMap = {};
    usernames.forEach(u => (ratesMap[u] = adminRates));
    return ratesMap;
  } else {
    // Fetch each user’s rate
    const rateDocs = await RateMaster.find({
      user: { $in: usernames },
      draw: encodedDraw
    });

    const ratesMap = {};
    rateDocs.forEach(doc => {
      const map = {};
      doc.rates.forEach(r => (map[r.label] = r.rate));
      ratesMap[doc.user] = map;
    });
    return ratesMap;
  }
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
  console.log('typeStr', typeStr);
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

// ---- helper functions ----
// --- Normalize results from multiple docs into one object ---
function normalizeResultDocs(resultDocs) {
  const grouped = {};

  for (const doc of resultDocs) {
    const ds = new Date(doc.date).toISOString().slice(0, 10);
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

  if (["AB","BC","AC","A","B","C"].includes(baseType)) return baseType;
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
  return date.toISOString().slice(0, 10);
}
const getWinningReport = async (req, res) => {
  try {
    const { fromDate, toDate, time, agent } = req.body;
    console.log("\n==============================");
    console.log("📥 getWinningReport request:", req.body);

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
    console.log("👥 Agent Users:", agentUsers);

    // build user->scheme map
    const userSchemeMap = {};
    users.forEach(u => { userSchemeMap[u.username] = u.scheme || "N/A"; });

    // --- 2) Date range ---
    const start = new Date(fromDate + "T00:00:00.000Z");
    const end   = new Date(toDate   + "T23:59:59.999Z");
    console.log("📅 Date Range:", start, "to", end);

    // --- 3) Entries ---
    const entryQuery = {
      createdBy: { $in: agentUsers },
      isValid: true,
      createdAt: { $gte: start, $lte: end },   // ✅ use createdAt instead of date
    };
    if (time !== "ALL") entryQuery.timeLabel = time;

    const entries = await Entry.find(entryQuery).lean();
    console.log("📝 Entries fetched:", entries.length);
    if (entries.length > 0) {
      console.log("🔹 Example entry:", entries[0]);
    }

    if (entries.length === 0) {
      console.log("⚠️ No entries found.");
      return res.json({ message: "No entries found", bills: [], grandTotal: 0 });
    }

    // --- 4) Results ---
    const allDates = getDatesBetween(new Date(fromDate), new Date(toDate))
    .map(d => d.toISOString().slice(0, 10)); // ['2025-08-20', '2025-08-21', ...]
  
  const resultQuery = { date: { $in: allDates } };
  if (time !== "ALL") resultQuery.time = time;
  
  const resultDocs = await Result.find(resultQuery).lean();
  console.log("🏆 Results fetched:==", resultDocs.length);
  

    // Group results by time
    const resultsByTime = {};
    for (const r of resultDocs) {
      if (!resultsByTime[r.time]) resultsByTime[r.time] = [];
      resultsByTime[r.time].push(r);
    }
    for (const t in resultsByTime) {
      resultsByTime[t].sort((a, b) => new Date(a.date) - new Date(b.date));
    }
    console.log("🕒 Results grouped by time:", Object.keys(resultsByTime));

    function findDayResult(dateStr, timeLabel) {
      const list = resultsByTime[timeLabel] || [];
      const found = [...list].reverse().find(r => {
        const rd = new Date(r.date).toISOString().slice(0, 10);
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
      const dateObj = new Date(e.createdAt); // ✅ match frontend behavior
      const ds = dateObj.toISOString().slice(0, 10);

      const dayResult = findDayResult(ds, e.timeLabel);
      console.log(`\n➡️ Checking entry bill:${e.billNo}, num:${e.number}, type:${e.type}, date:${ds}, time:${e.timeLabel}`);
      if (!dayResult) {
        console.log("   ❌ No matching result found for this entry.");
        continue;
      }

      const amount = calculateWinAmount(e, dayResult);
      const winType = computeWinType(e, dayResult);
      console.log("   ✅ Found result, winAmount:", amount, "winType:", winType);

      if (amount > 0) {
        winningEntries.push({
          ...e,
          date: ds,
          winAmount: amount,
          baseType: extractBetType(e.type),
          winType,
        });
      }
    }

    console.log("✅ Total winning entries:", winningEntries.length);

    if (winningEntries.length === 0) {
      console.log("⚠️ No winning entries after evaluation.");
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
      });
      billsMap[w.billNo].total += w.winAmount;
    }

    const bills = Object.values(billsMap);
    const grandTotal = bills.reduce((acc, bill) => acc + bill.total, 0);

    console.log("📦 Bills grouped:", bills.length, "GrandTotal:", grandTotal);

    return res.json({ fromDate, toDate, time, agent: agent || "All Agents", grandTotal, bills, usersList: users.map(u => u.username) });
  } catch (err) {
    console.error("[getWinningReport ERROR]", err);
    res.status(500).json({ error: err.message });
  }
};



async function getBlockTimeF(drawLabel) {
  if (!drawLabel) return null;
  const record = await BlockTime.findOne({ drawLabel });
  
  if (!record) return null;

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
    }else{
      return latest
    }
  } catch (err) {
    console.log("sssssssssss",err);
    return null
    
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
        date,
      };
    });

    // Run aggregation
    const results = await Entry.aggregate([
      { $match: { $or: matchConditions } },
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
  console.log('date=============', date)
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
    const { entries, timeLabel, timeCode, selectedAgent, createdBy, toggleCount } = req.body;
    console.log('req.body;', req.body)
    if (!entries || entries.length === 0) {
      return res.status(400).json({ message: 'No entries provided' });
    }
    // 1️⃣ Get block/unblock time
    const blockTimeData = await getBlockTimeF(timeLabel);
    console.log('blockTimeData===========', blockTimeData);
    if (!blockTimeData) {
      return res.status(400).json({ message: `No block time configuration found for draw: ${timeLabel}` });
    }
    const { blockTime, unblockTime } = blockTimeData;
    if (!blockTime || !unblockTime) return res.status(400).json({ message: 'Block or unblock time missing' });

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    // const block = new Date(`${todayStr}T${blockTime}:00`);
    // const unblock = new Date(`${todayStr}T${unblockTime}:00`);
    const [bh, bm] = blockTime.split(':').map(Number);
const [uh, um] = unblockTime.split(':').map(Number);

const block = new Date(now.getFullYear(), now.getMonth(), now.getDate(), bh, bm);
console.log('block', block)
const unblock = new Date(now.getFullYear(), now.getMonth(), now.getDate(), uh, um);
console.log('unblock', unblock)
console.log('unblock', now >= block );
console.log('unblock', now < unblock)

    if (now >= block && now < unblock) {
      return res.status(403).json({ message: 'Entry time is blocked for this draw' });
    }
    // Decide target date: after unblock -> next day, else today
    const targetDateObj = new Date(now);
    if (now >= unblock) {
      targetDateObj.setDate(targetDateObj.getDate() + 1);
    }
    const targetDateStr = targetDateObj.toISOString().split('T')[0];

    // 2️⃣ Fetch ticket limits
    const limits = await getTicketLimits();
    if (!limits) {
      return res.status(400).json({ message: 'No ticket limits configuration found. Please set up ticket limits first.' });
    }
    const allLimits = { ...limits.group1, ...limits.group2, ...limits.group3 };

    // 3️⃣ Sum counts per type-number for new entries
    const newTotalByNumberType ={};
    entries.forEach((entry) => {
      const rawType = entry.type.replace(timeCode, '').replace(/-/g, '').toUpperCase();
      const key = `${rawType}-${entry.number}`;
      newTotalByNumberType[key] = (newTotalByNumberType[key] || 0) + (entry.count || 1);
    });

    // 4️⃣ Fetch existing counts
    const keys = Object.keys(newTotalByNumberType);
    const existingCounts = await countByNumberF(targetDateStr, timeLabel, keys);

    // 5️⃣ Validate entries
    const totalSoFar = { ...existingCounts };
    const validEntries= [];
    const exceededEntries= [];

    for (const entry of entries) {
      const count = entry.count || 1;
      const rawType = entry.type.replace(timeCode, '').replace(/-/g, '').toUpperCase();
      const key = `${rawType}-${entry.number}`;
      const maxLimit = parseInt(allLimits[rawType] || '9999', 10);
      const currentTotal = totalSoFar[key] || 0;
      const allowedCount = maxLimit - currentTotal;

      if (allowedCount <= 0) {
        exceededEntries.push({ key, attempted: count, limit: maxLimit, existing: currentTotal, added: 0 });
        continue;
      }

      if (count <= allowedCount) {
        validEntries.push(entry);
        totalSoFar[key] = currentTotal + count;
      } else {
        validEntries.push({ ...entry, count: allowedCount });
        totalSoFar[key] = currentTotal + allowedCount;
        exceededEntries.push({ key, attempted: count, limit: maxLimit, existing: currentTotal, added: allowedCount });
      }
    }

    if (validEntries.length === 0) {
      return res.status(400).json({ message: 'All entries exceed allowed limits', exceeded: exceededEntries });
    }
    console.log("aaaaaaaaaaaaaaaaaa", validEntries,
      timeLabel,
      timeCode,
      selectedAgent,
      createdBy,
      toggleCount,);
    
    // 6️⃣ Save valid entries
    const savedBill = await addEntriesF({
      entries: validEntries,
      timeLabel,
      timeCode,
      selectedAgent,
      createdBy,
      toggleCount,
      date: targetDateStr
    });
    console.log('savedBill', savedBill)

    return res.json({ billNo: savedBill.billNo, exceeded: exceededEntries });

  } catch (err) {
    console.error('Error saving entries:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// 🆕 New endpoint: Sales Report
const getSalesReport = async (req, res) => {
  try {
    const { fromDate, toDate, createdBy, timeLabel, loggedInUser } = req.query;

    console.log("📥 getSalesReport request:", req.query);

    // 1️⃣ Build agent list (loggedInUser or createdBy + descendants)
    const allUsers = await MainUser.find().select("username createdBy");
    let agentList = [];
    if (!createdBy) {
      agentList = [loggedInUser, ...getDescendants(loggedInUser, allUsers)];
    } else {
      agentList = [createdBy, ...getDescendants(createdBy, allUsers)];
    }
    console.log("👥 Agent Users (backend):", agentList);

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
    console.log("entrie===========11", entryQuery)
    console.log("entrie===========12", last10Entries)
    console.log("entrie===========13", entries);
    console.log("📝 Entries fetched (backend):", entries.length);
    if (entries.length > 0) console.log("🔹 Example entry:", entries[0]);

    // 3️⃣ Fetch RateMaster for each draw
    const userForRate = loggedInUser;
    
    console.log('userForRate===========', userForRate)
    console.log('timeLabel===========', timeLabel)
    
    // Get unique draws from entries
    const uniqueDraws = [...new Set(entries.map(entry => entry.timeLabel))];
    console.log('uniqueDraws===========', uniqueDraws);
    
    // Fetch rate masters for each draw
    const rateMastersByDraw = {};
    for (const draw of uniqueDraws) {
      let rateMasterQuery = { user: userForRate };
      
      if (draw === "LSK 3 PM") {
        rateMasterQuery.draw = "KERALA 3 PM";
      } else {
        rateMasterQuery.draw = draw;
      }
      
      console.log(`rateMasterQuery for ${draw}:`, rateMasterQuery);
      const rateMaster = await RateMaster.findOne(rateMasterQuery);
      console.log(`rateMaster for ${draw}:`, rateMaster);
      
      const rateLookup = {};
      (rateMaster?.rates || []).forEach(r => {
        rateLookup[r.label] = Number(r.rate) || 10;
      });
      rateMastersByDraw[draw] = rateLookup;
    }
    
    console.log("💰 Rate masters by draw:", rateMastersByDraw);

    // Helper: extract bet type
    const extractBetType = (typeStr) => {
      console.log('typeStr', typeStr);
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
      
      console.log(`Entry: ${entry.type}, Draw: ${draw}, BetType: ${betType}, Rate: ${rate}, Count: ${count}`);
      
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

    console.log("✅ Final Sales Report (backend):", report);
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
  updatePasswordController,
  netPayMultiday,
  getUserRates,
  getWinningReport,
  saveValidEntries,
  getSalesReport
};
