const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./database/model/ConnectToDb');
const { createUser,getresult,addEntries,getAllUsers} = require('./controller/Controller');
const app = express();

dotenv.config();
connectDB();
app.use(express.json());


app.get('/users', getAllUsers); // 👈 this is the GET route
app.post('/newuser', createUser); // Direct route
app.post('/addEntries', addEntries);
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
