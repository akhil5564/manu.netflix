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
  const { username, password } = req.body;

  try {
    // Find user by username
    const user = await MainUser.findOne({ username });

    if (!user) {
      return res.status(404).json({ message: 'Invalid username' });
    }

    // Compare the provided password with the hashed password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    // ✅ If both username and password match, return user info
    res.status(200).json({
      username: user.username,
      usertype: user.usertype,
      name: user.name,
      createdBy: user.createdBy,
    });

  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    res.status(500).json({ message: 'Server error' });
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
      billNo, // ✅ ADD THIS
    } = req.query;

    const query = {};
    if (createdBy) query.createdBy = createdBy;
    if (timeCode) query.timeCode = timeCode;
    if (timeLabel) query.timeLabel = timeLabel;
    if (number) query['entries.number'] = number;
    if (count) query['entries.count'] = parseInt(count);
    if (date) query.date = date;
    if (billNo) query.billNo = billNo; // ✅ FILTER BY BILL NUMBER

    const entries = await Entry.find(query).sort({ createdAt: -1 });
    res.status(200).json(entries);
  } catch (error) {
    console.error('[GET ENTRIES ERROR]', error);
    res.status(500).json({ message: 'Failed to fetch entries' });
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
        getNextBillNumber // ✅ Add this



};
