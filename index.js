const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const bodyParser = require('body-parser');
const connectDB = require('./database/model/ConnectToDb'); // Import DB connection function
const { postAddData, getAllData,postAddResult,deleteContainer,getResult,getCounts,createUser, loginUser  } = require('./controller/Controller'); // Import controller
const Result = require('./controller/model/Result');


// Initialize dotenv for environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors()); // Allow cross-origin requests from frontend
app.use(bodyParser.json()); // Parse incoming JSON requests

// Connect to MongoDB
connectDB();

// Routes to handle adding and fetching data
app.post('/addData', postAddData);  // To add data entered by the user
app.get('/getData', getAllData);    // To get all the stored data
app.post('/addResult', postAddResult);
// Correct DELETE route to delete data by ID
app.delete('/deleteData/:id', deleteContainer);
app.get('/getresult',getResult );  
app.get('/getCounts',getCounts );    // To get all the stored data
app.post('/newuser',createUser );
app.post('/login',loginUser );


// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
