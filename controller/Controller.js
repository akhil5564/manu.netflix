const MainUser = require('./model/MainUser');
const Entry = require('./model/Entry');
const bcrypt = require('bcryptjs');
const RateMaster = require('./model/RateMaster');
const Result = require('./model/ResultModel');
const BlockTime = require('./model/BlockTime');

const TicketLimit = require('./model/TicketLimit'); // create this model
const BillCounter = require('./model/BillCounter');
const User = require('./model/MainUser'); // adjust the path to where your MainUser.js is

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
    const { numbers, date, timeLabel } = req.body;

    if (!Array.isArray(numbers) || !date || !timeLabel) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Convert date string to start and end of the day
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);

    const results = await Entry.aggregate([
      {
        $match: {
          number: { $in: numbers },
          timeLabel,
          createdAt: { $gte: start, $lte: end }, // ✅ correct date filtering
        },
      },
      {
        $group: {
          _id: '$number',
          total: { $sum: '$count' },
        },
      },
    ]);

    const countMap = {};
    results.forEach((item) => {
      countMap[item._id] = item.total;
    });

    console.log('✅ Returning countMap:', countMap);
    res.json(countMap);
  } catch (err) {
    console.error('❌ Error in countByNumber:', err);
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
      blocks.map(({ draw, timeblock }) => {
        if (!draw || !timeblock) {
          throw new Error('Both draw and timeblock are required.');
        }
        return BlockTime.findOneAndUpdate(
          { drawLabel: draw },
          { blockTime: timeblock },
          { upsert: true, new: true }
        );
      })
    );

    return res.status(200).json({
      message: 'Block times saved',
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
    if (number) query['entries.number'] = number;
    if (count) query['entries.count'] = parseInt(count);
    if (billNo) query.billNo = billNo;

    // Handle single date
    if (date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const dEnd = new Date(date);
      dEnd.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: d, $lte: dEnd };
    }

    // Handle date range
    else if (fromDate && toDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0); // Start of day
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999); // End of day
      query.createdAt = { $gte: from, $lte: to };
    }

    const entries = await Entry.find(query).sort({ createdAt: -1 });
    res.status(200).json(entries);
  } catch (error) {
    console.error('[GET ENTRIES ERROR]', error);
    res.status(500).json({ message: 'Failed to fetch entries' });
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
  const { date, time } = req.query;

  try {
    const result = await Result.findOne({ date, time });

    if (!result) {
      return res.status(404).json({ message: 'No result found' });
    }

    const response = {
      results: {
        [date]: [
          {
            [time]: {
              prizes: result.prizes,
              entries: result.entries,
            },
          },
        ],
      },
    };

    res.json(response);
  } catch (error) {
    console.error('Fetch Error:', error);
    res.status(500).json({ message: 'Failed to get result' });
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

    const newResult = new Result({
      date,
      time,
      prizes,
      entries,
    });

    await newResult.save();
    res.status(200).json({ message: 'Result saved successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error saving result', error: err.message });
  }
};


// ✅ Add Entries

const addEntries = async (req, res) => {
  try {
    const { entries, timeLabel, timeCode, createdBy, toggleCount } = req.body;

    if (!entries || entries.length === 0) {
      return res.status(400).json({ message: 'No entries provided' });
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
    }));

    await Entry.insertMany(toSave);

    res.status(200).json({ message: 'Entries saved successfully', billNo });
  } catch (error) {
    console.error('[SAVE ENTRY ERROR]', error);
    res.status(500).json({ message: 'Server error saving entries' });
  }
};



// ✅ Get Result (by date and time)


const saveRateMaster = async (req, res) => {
  try {
    const { user, draw, rates } = req.body;

    if (!user || !draw || !Array.isArray(rates)) {
      return res.status(400).json({ message: 'Missing user, draw, or rates' });
    }

    // Optional: Check each rate has label & rate
    for (const item of rates) {
      if (!item.label || typeof item.rate !== 'number') {
        return res.status(400).json({ message: 'Each rate must have a label and rate' });
      }
    }

    const newRate = new RateMaster({ user, draw, rates });
    await newRate.save();

    res.status(201).json({ message: 'Rate master saved successfully', data: newRate });
  } catch (error) {
    console.error('[SAVE RATE MASTER ERROR]', error);
    res.status(500).json({ message: 'Server error saving rate master' });
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
  countByNumber,
   getLatestTicketLimit ,
   toggleLoginBlock,
   toggleSalesBlock

};
