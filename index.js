const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./database/model/ConnectToDb');
const { createUser,addEntries,getAllUsers,saveTicketLimit,saveRateMaster,saveResult,getResult, loginUser,getNextBillNumber,getEntries // ✅ Add this

} = require('./controller/Controller');
const app = express();

dotenv.config();
connectDB();
app.use(express.json());


app.get('/users', getAllUsers); // 👈 this is the GET route
app.post('/newuser', createUser); // Direct route
app.post('/addEntries', addEntries);
app.post('/ticket-limit', saveTicketLimit);
app.post('/ratemaster', saveRateMaster);
app.post('/addResult', saveResult);
app.get('/getResult', getResult);
app.get('/entries', getEntries); // 👈 Add this
app.post('/login', loginUser);
app.get('/next-bill', getNextBillNumber); // ✅ Add this
app.post('/addEntries', addEntries);

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
