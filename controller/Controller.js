const DataModel = require('../model/User'); // MongoDB model for data
const MainUser = require('../model/MainUser'); // MongoDB model for data
const SubUser = require('../model/SubUser'); // MongoDB model for data
const Counter = require('../model/CounterModel'); // MongoDB model for counter
const bcrypt = require('bcryptjs');

const Result = require('../model/Result');


// Controller function to handle saving data
const postAddData = async (req, res) => {
    try {
      const { selectedTime, tableRows } = req.body;
  
      // Validate selectedTime is not empty or null
      if (!selectedTime || selectedTime.trim() === "") {
        return res.status(400).json({ message: 'selectedTime is required and cannot be empty' });
      }
  
      if (!tableRows || !Array.isArray(tableRows) || tableRows.length === 0) {
        return res.status(400).json({ message: 'tableRows must be a non-empty array' });
      }
  
      // Fetch the counter for generating a custom ID (starting from 4000)
      const counter = await Counter.findOneAndUpdate(
        { name: 'dataCounter' },
        { $inc: { currentId: 1 } },
        { new: true, upsert: true }
      );
  
      const customId = counter.currentId;
  
      const newData = new DataModel({
        customId,
        selectedTime,
        tableRows,
        createdAt: new Date(),
      });
  
      await newData.save();
      res.status(200).json({ message: 'Data saved successfully', customId });
    } catch (error) {
      console.error('Error saving data:', error);
      res.status(500).json({ message: 'Error saving data', error: error.message });
    }
  };
  

// Controller function to fetch all stored data
// Controller.js
const getAllData = async (req, res) => {
    try {
      // Fetch all documents from the DataModel
      const data = await DataModel.find(); // This returns all data
      res.status(200).json(data); // Send the data as JSON
    } catch (error) {
      console.error('Error fetching data:', error);
      res.status(500).json({ message: 'Error fetching data', error: error.message });
    }
  };
  

  
  const createUser = async (req, res) => {
    try {
      const { name, username, password, userType } = req.body;
  
      // Validate input
      if (!name || !username || !password || !userType) {
        return res.status(400).json({ message: 'Name, username, password, and userType are required' });
      }
  
      const hashedPassword = await bcrypt.hash(password, 10); // Hash password
  
      let newUser;
      if (userType === 'main') {
        newUser = new MainUser({ name, username, password: hashedPassword });
      } else if (userType === 'sub') {
        newUser = new SubUser({ name, username, password: hashedPassword });
      } else {
        return res.status(400).json({ message: 'Invalid user type' });
      }

      // Check if the username already exists
      const existingUser = await (userType === 'main' ? MainUser : SubUser).findOne({
        username
      });
  
      if (existingUser) {
        return res.status(400).json({ message: 'Username already exists' });
      }
  
      await newUser.save();
      res.status(201).json({ message: 'User created successfully', user: newUser });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ message: 'Error creating user', error: error.message });
    }
  };
  
  


  // Controller function to fetch data based on result, date, and time
const getResult = async (req, res) => {
  try {
    const { result, date, time } = req.query; // Extract query parameters for result, date, and time

    // Build the query object dynamically based on the query params
    let query = {};

    // If a result is provided, add it to the query filter
    if (result) {
      query.result = result;
    }

    // If a date is provided, filter by the specific date
    if (date) {
      query.date = date;
    }

    // If a time is provided, filter by the specific time
    if (time) {
      query.time = time;
    }

    // Fetch the data that matches the query
    const data = await Result.find(query);

    // If no data is found, return a 404 response
    if (data.length === 0) {
      return res.status(404).json({ message: 'No results found' });
    }

    // Return the data as JSON
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ message: 'Error fetching data', error: error.message });
  }
};
const getCounts = async (req, res) => {
  try {
    // Fetch all documents from the DataModel or Result model
    const data = await DataModel.find(); // or Result.find() depending on where you want to fetch the data from

    // Filter the data based on the 'count' value greater than 5
    const filteredData = data.filter(row => parseInt(row.count, 10) > 5);
    
    // Send the filtered data back as JSON
    res.json(filteredData);
  } catch (error) {
    console.error('Error fetching counts:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// Controller function for deleting data
const deleteContainer = async (req, res) => {
  const { id } = req.params;  // Access the id from the URL parameter

  try {
    // Attempt to delete data from the database by its ID
    const deletedData = await DataModel.findByIdAndDelete(id);

    if (!deletedData) {
      return res.status(404).json({ message: 'Data not found' });
    }

    // Send a success response back to the frontend
    res.status(200).json({ message: 'Data deleted successfully' });
  } catch (error) {
    console.error('Error deleting data:', error);
    res.status(500).json({ message: 'Error deleting data', error: error.message });
  }
};
const postAddResult = async (req, res) => {
  try {
    const { results } = req.body;

    // Validate that `results` is an object with dates as keys
    if (!results || typeof results !== 'object') {
      return res.status(400).json({ message: 'Results must be an object with dates as keys.' });
    }

    // Validate that each date contains valid time slots
    const invalidDates = Object.keys(results).filter(
      (date) => !results[date] || !Array.isArray(results[date])
    );
    if (invalidDates.length > 0) {
      return res.status(400).json({ message: `Invalid or missing time slots for dates: ${invalidDates.join(', ')}` });
    }

    // Validate individual result objects
    const invalidResults = [];
    Object.keys(results).forEach((date) => {
      results[date].forEach((timeSlotObj) => {
        Object.keys(timeSlotObj).forEach((timeSlot) => {
          timeSlotObj[timeSlot].forEach(({ ticket, result }) => {
            if (!ticket || !result || !/^[0-9]{3}$/.test(result)) {
              invalidResults.push({ ticket, result, date, time: timeSlot });
            }
          });
        });
      });
    });

    if (invalidResults.length > 0) {
      return res.status(400).json({ message: 'Invalid data in results array', invalidResults });
    }

    // Save valid results
    const resultsToSave = [];
    Object.keys(results).forEach((date) => {
      results[date].forEach((timeSlotObj) => {
        Object.keys(timeSlotObj).forEach((timeSlot) => {
          timeSlotObj[timeSlot].forEach(({ ticket, result }) => {
            resultsToSave.push({ ticket, result, date, time: timeSlot });
          });
        });
      });
    });

    // Log the results before saving
    console.log('Saving results:', resultsToSave);

    // Proceed with saving the results (ensure the Result model is properly set up)
    await Result.insertMany(resultsToSave); // Save all results into the database

    res.status(200).json({ message: 'Results saved successfully', results: resultsToSave });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};




module.exports = { postAddData, getAllData,postAddResult,deleteContainer,getResult,getCounts,createUser 
};
