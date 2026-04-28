const express = require('express');
const dotenv = require('dotenv');
dotenv.config();
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const connectDB = require('./database/model/ConnectToDb');
const Controller = require('./controller/Controller');

const MainUser = require('./model/MainUser');
const Entry = require('./model/Entry');
const RateMaster = require('./model/RateMaster');
const { authMiddleware, adminMiddleware } = require('./middleware/authMiddleware');


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
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Apply limiter to all routes
app.use(limiter);

// Specific limiter for login to prevent brute force
const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 login attempts per hour
  message: 'Too many login attempts from this IP, please try again after an hour'
});
app.post('/login', loginLimiter, Controller.loginUser);




// Routes
app.get("/get-blocked-dates", authMiddleware, Controller.getBlockedDates);
app.post("/add-blockdate", authMiddleware, adminMiddleware, Controller.addBlockDate);
app.delete("/delete-blockdate/:id", authMiddleware, adminMiddleware, Controller.deleteBlockDate);

app.get('/users', authMiddleware, Controller.getAllUsers);
app.post('/getusersByid', authMiddleware, Controller.getusersByid);
app.post('/newuser', authMiddleware, adminMiddleware, Controller.createUser);
app.post('/addEntries', authMiddleware, Controller.addEntries);
app.post('/ticket-limit', authMiddleware, adminMiddleware, Controller.saveTicketLimit);
app.post('/ratemaster', authMiddleware, adminMiddleware, Controller.saveRateMaster);
app.post('/addResult', authMiddleware, adminMiddleware, Controller.saveResult);
app.get('/getResult', authMiddleware, Controller.getResult);
app.get('/entries', authMiddleware, Controller.getEntries);
app.get('/get-entries-with-timeblock', authMiddleware, Controller.getEntriesWithTimeBlock);
app.get('/next-bill', authMiddleware, Controller.getNextBillNumber);
app.patch('/invalidateEntry/:id', authMiddleware, Controller.invalidateEntry);
app.delete('/deleteEntryById/:id/:userType', authMiddleware, adminMiddleware, Controller.deleteEntryById);
app.delete('/deleteEntriesByBillNo/:billNo', authMiddleware, adminMiddleware, Controller.deleteEntriesByBillNo);
app.put('/updateEntryCount/:id', authMiddleware, Controller.updateEntryCount);
app.get('/report/count', authMiddleware, Controller.getCountReport);
app.get('/ratemaster', authMiddleware, Controller.getRateMaster);
app.get('/rateMaster', authMiddleware, Controller.getRateMaster);

app.post('/setBlockTime', authMiddleware, adminMiddleware, Controller.setBlockTime);
app.get('/getBlockTime/:drawLabel', authMiddleware, Controller.getBlockTime);
app.get('/blockTime/:drawLabel/:type', authMiddleware, Controller.getBlockTimeByType);
app.get('/blockTimes', authMiddleware, adminMiddleware, Controller.getAllBlockTimes);
app.post('/countByNumber', authMiddleware, Controller.countByNumber);
app.get('/getticketLimit', authMiddleware, Controller.getLatestTicketLimit);
app.patch("/user/blockLogin/:id", authMiddleware, adminMiddleware, Controller.toggleLoginBlock);
app.patch('/blockSales/:id', authMiddleware, authMiddleware, Controller.toggleSalesBlock); // 👈 Corrected double middleware if accidental, but ensured auth
app.put('/users/:username', authMiddleware, Controller.updatePasswordController);
app.put('/users/update/:id', authMiddleware, Controller.updateUser);
app.delete('/users/:id', authMiddleware, adminMiddleware, Controller.deleteUser);
app.post('/report/netpay-multiday', authMiddleware, Controller.netPayMultiday);
app.post('/report/winningReport', authMiddleware, Controller.getWinningReport);
app.get('/report/salesReport', authMiddleware, Controller.getSalesReport);
app.post('/entries/saveValidated', authMiddleware, Controller.saveValidEntries);

// Block Number Routes
app.get('/block-numbers', authMiddleware, Controller.getBlockedNumbers);
app.post('/block-numbers', authMiddleware, adminMiddleware, Controller.addBlockedNumbers);
app.put('/block-numbers/:id', authMiddleware, adminMiddleware, Controller.updateBlockedNumber);
app.delete('/block-numbers/:id', authMiddleware, adminMiddleware, Controller.deleteBlockedNumber);
app.get('/block-numbers/:createdBy/:drawTime', authMiddleware, Controller.getBlockedNumbersByUser);
app.delete('/block-numbers/bulk', authMiddleware, adminMiddleware, Controller.bulkDeleteBlockedNumbers);

app.get('/overflow-limit', authMiddleware, Controller.getOverflowLimit);
app.post('/overflow-limit', authMiddleware, adminMiddleware, Controller.saveOverflowLimit);
app.get('/overflow-limit/by-drawtime', authMiddleware, Controller.getOverflowLimitByDrawTime);
// ADD new draw scheme (admin)
app.post("/draw-scheme", authMiddleware, adminMiddleware, Controller.addDrawToTab);
// GET draw scheme by time
app.get('/draw-scheme', authMiddleware, Controller.getDrawByTabAndName);
// UPDATE super value only
app.put("/draw-scheme/super", authMiddleware, adminMiddleware, Controller.updateSuperForDraw);
app.post('/add-amount', authMiddleware, adminMiddleware, Controller.addUserAmount);
app.get('/get-amount', authMiddleware, Controller.getUserAmounts);
app.patch('/user-amount/:id/amount', authMiddleware, adminMiddleware, Controller.updateAmountOnly);
app.delete('/user-amount/:id', authMiddleware, adminMiddleware, Controller.deleteUserAmount);

app.post('/sales-report-summary', authMiddleware, Controller.createSalesReportSummary);
app.get('/sales-report-summary', authMiddleware, Controller.getSalesReportSummary);
app.put('/sales-report-summary/:id', authMiddleware, adminMiddleware, Controller.updateSalesReportSummary);

app.post('/report/sync-summaries', authMiddleware, adminMiddleware, Controller.syncSummaries);

app.get("/debug/rateMasters", authMiddleware, adminMiddleware, async (req, res) => {
  const rates = await RateMaster.find({});
  res.json(rates);
});

// 🔹 SAVE / UPDATE winning summary (called internally after result save)
app.post("/winning/summary/save", authMiddleware, adminMiddleware, Controller.saveWinningReport);

// 🔹 GET winning summary (frontend uses this)
app.post("/winning/summary", authMiddleware, Controller.getWinningReportSummary);




const port = process.env.PORT || 6000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`📦 MONGO_URI: ${process.env.MONGO_URI ? "Loaded ✅" : "Missing ❌"}`);
});
