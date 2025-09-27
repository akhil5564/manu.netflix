const express = require('express');
const dotenv = require('dotenv');
dotenv.config();

const connectDB = require('./database/model/ConnectToDb');
const Controller = require('./controller/Controller');

const app = express();
connectDB();
app.use(express.json());




// Routes
app.get("/get-blocked-dates", Controller.getBlockedDates);
app.post("/add-blockdate", Controller.addBlockDate);
app.delete("/delete-blockdate/:id", Controller.deleteBlockDate);


app.get('/users', Controller.getAllUsers);
app.post('/getusersByid', Controller.getusersByid);
app.post('/newuser', Controller.createUser);
app.post('/addEntries', Controller.addEntries);
app.post('/ticket-limit', Controller.saveTicketLimit);
app.post('/ratemaster', Controller.saveRateMaster);
app.post('/addResult', Controller.saveResult);
app.get('/getResult', Controller.getResult);
app.get('/entries', Controller.getEntries);
app.post('/login', Controller.loginUser);
app.get('/next-bill', Controller.getNextBillNumber);
app.patch('/invalidateEntry/:id', Controller.invalidateEntry);
app.delete('/deleteEntryById/:id', Controller.deleteEntryById);
app.delete('/deleteEntriesByBillNo/:billNo', Controller.deleteEntriesByBillNo);
app.put('/updateEntryCount/:id', Controller.updateEntryCount);
app.get('/report/count', Controller.getCountReport);
app.get('/rateMaster', Controller.getRateMaster);
app.post('/setBlockTime', Controller.setBlockTime);
app.get('/getBlockTime/:drawLabel', Controller.getBlockTime);
app.get('/blockTime/:drawLabel/:type', Controller.getBlockTimeByType);
app.get('/blockTimes', Controller.getAllBlockTimes);
app.post('/countByNumber', Controller.countByNumber);
app.get('/getticketLimit', Controller.getLatestTicketLimit);
app.patch("/user/blockLogin/:id", Controller.toggleLoginBlock);
app.patch('/blockSales/:id', Controller.toggleSalesBlock);
app.put('/users/:username', Controller.updatePasswordController);
app.put('/users/update/:id', Controller.updateUser);
app.delete('/users/:id', Controller.deleteUser);
app.post('/report/netpay-multiday', Controller.netPayMultiday);
app.post('/report/winningReport', Controller.getWinningReport);
app.get('/report/salesReport', Controller.getSalesReport);
app.post('/entries/saveValidated', Controller.saveValidEntries);

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`📦 MONGO_URI: ${process.env.MONGO_URI ? "Loaded ✅" : "Missing ❌"}`);
});
