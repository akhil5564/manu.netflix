const MainUser = require('./model/MainUser');
const Entry = require('./model/Entry');
const bcrypt = require('bcryptjs');
const RateMaster = require('./model/RateMaster');
const Result = require('./model/ResultModel');

const TicketLimit = require('./model/TicketLimit'); // create this model
const BillCounter = require('./model/BillCounter');




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

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    // Return structured login response
    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user._id,
        username: user.username,
        userType: user.usertype,  // ✅ use `usertype` from schema
        scheme: user.scheme || null,
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

    if (date) {
      query.date = new Date(date);
    } else if (fromDate && toDate) {
      const from = new Date(fromDate);
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999); // end of day
      query.date = { $gte: from, $lte: to };
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

    const newRate = new RateMaster({ user, draw, rates });
    await newRate.save();

    res.status(201).json({ message: 'Rate master saved successfully', data: newRate });
  } catch (error) {
    console.error('[SAVE RATE MASTER ERROR]', error);
    res.status(500).json({ message: 'Server error saving rate master' });
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
    const entries = await Entry.find({ isValid: true }); // Only valid entries

    const countMap = {};

    entries.forEach(entry => {
      const num = entry.number;
      if (!countMap[num]) {
        countMap[num] = {
          number: num,
          count: 0,
        };
      }
      countMap[num].count += entry.count;
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

};
