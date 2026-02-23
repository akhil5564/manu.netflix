const express = require('express');
const dotenv = require('dotenv');
dotenv.config();

const connectDB = require('./database/model/ConnectToDb');
const Controller = require('./controller/Controller');

const MainUser = require('./model/MainUser');
const Entry = require('./model/Entry');
const RateMaster = require('./model/RateMaster');


const app = express();
connectDB();

async function ensureIndexes() {
  try {
    await Entry.syncIndexes();
    await MainUser.syncIndexes();
    await RateMaster.syncIndexes();
    console.log("✅ MongoDB indexes ensured");
  } catch (err) {
    console.error("❌ Index creation failed:", err);
  }
}

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
app.get('/get-entries-with-timeblock', Controller.getEntriesWithTimeBlock);
app.post('/login', Controller.loginUser);
app.get('/next-bill', Controller.getNextBillNumber);
app.patch('/invalidateEntry/:id', Controller.invalidateEntry);
app.delete('/deleteEntryById/:id/:userType', Controller.deleteEntryById);
app.delete('/deleteEntriesByBillNo/:billNo', Controller.deleteEntriesByBillNo);
app.put('/updateEntryCount/:id', Controller.updateEntryCount);
app.get('/report/count', Controller.getCountReport);
app.get('/ratemaster', Controller.getRateMaster);
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

// Block Number Routes
app.get('/block-numbers', Controller.getBlockedNumbers);
app.post('/block-numbers', Controller.addBlockedNumbers);
app.put('/block-numbers/:id', Controller.updateBlockedNumber);
app.delete('/block-numbers/:id', Controller.deleteBlockedNumber);
app.get('/block-numbers/:createdBy/:drawTime', Controller.getBlockedNumbersByUser);
app.delete('/block-numbers/bulk', Controller.bulkDeleteBlockedNumbers);

app.get('/overflow-limit', Controller.getOverflowLimit);
app.post('/overflow-limit', Controller.saveOverflowLimit);
app.get('/overflow-limit/by-drawtime', Controller.getOverflowLimitByDrawTime);
// ADD new draw scheme (admin)
app.post("/draw-scheme", Controller.addDrawToTab);
// GET draw scheme by time
app.get('/draw-scheme', Controller.getDrawByTabAndName);
// UPDATE super value only
app.put("/draw-scheme/super", Controller.updateSuperForDraw);
app.post('/add-amount', Controller.addUserAmount);
app.get('/get-amount', Controller.getUserAmounts);
app.patch('/user-amount/:id/amount', Controller.updateAmountOnly);
app.delete('/user-amount/:id', Controller.deleteUserAmount);

app.post('/sales-report-summary', Controller.createSalesReportSummary);
app.get('/sales-report-summary', Controller.getSalesReportSummary);
app.put('/sales-report-summary/:id', Controller.updateSalesReportSummary);
// app.delete('/sales-report-summary/:id', Controller.deleteSalesReportSummary);

app.post('/report/sync-summaries', Controller.syncSummaries);

app.get("/debug/rateMasters", async (req, res) => {
  const rates = await RateMaster.find({});
  res.json(rates);
});





const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`📦 MONGO_URI: ${process.env.MONGO_URI ? "Loaded ✅" : "Missing ❌"}`);
});
