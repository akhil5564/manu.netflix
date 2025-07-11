const MainUser = require('./model/MainUser');
const Result = require('./model/Result');
const Entry = require('./model/Entry');
const bcrypt = require('bcryptjs');

// ✅ Create New User
const createUser = async (req, res) => {
  try {
    const {
      name = '',
      username,
      password,
      scheme = '',
      createdBy = '',
      usertype = 'sub',
    } = req.body;

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
      usertype,
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
        usertype: newUser.usertype,
      },
    });
  } catch (error) {
    console.error('[CREATE USER ERROR]', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ✅ Add Entries
const addEntries = async (req, res) => {
  try {
    const { entries, timeLabel, timeCode, createdBy } = req.body;

    if (!entries || entries.length === 0) {
      return res.status(400).json({ message: 'No entries provided' });
    }

    const toSave = entries.map(e => ({
      ...e,
      timeLabel,
      timeCode,
      createdBy,
    }));

    await Entry.insertMany(toSave);

    res.status(200).json({ message: 'Entries saved successfully' });
  } catch (error) {
    console.error('[SAVE ENTRY ERROR]', error);
    res.status(500).json({ message: 'Server error saving entries' });
  }
};

// ✅ Get Result (by date and time)
const getresult = async (req, res) => {
  try {
    const { date, time } = req.query;

    if (!date || !time) {
      return res.status(400).json({ message: 'Date and time are required' });
    }

    const results = await Result.find({ date, time });
    res.status(200).json({ results });
  } catch (error) {
    console.error('[GET RESULT ERROR]', error);
    res.status(500).json({ message: 'Internal server error' });
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
  getresult,
  getAllUsers,
};
