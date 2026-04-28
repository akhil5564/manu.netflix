const express = require('express');
const router = express.Router();
const { 
  createUser, addEntries, getAllUsers, deleteUser, saveTicketLimit, 
  saveRateMaster, saveResult, getEntries, getNextBillNumber, 
  loginUser, invalidateEntry, deleteEntryById, deleteEntriesByBillNo, 
  updateEntryCount, getCountReport, getRateMaster, getBlockTime, 
  setBlockTime, countByNumber, getLatestTicketLimit, toggleLoginBlock, 
  toggleSalesBlock, updatePasswordController, getResult 
} = require('../controller/Controller');

const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');

// User Management (Admin only)
router.post('/newuser', authMiddleware, adminMiddleware, createUser);
router.delete('/users/:id', authMiddleware, adminMiddleware, deleteUser);
router.get('/users', authMiddleware, getAllUsers);
router.patch("/user/blockLogin/:id", authMiddleware, adminMiddleware, toggleLoginBlock);

// Configuration & Results (Admin only)
router.post('/ticket-limit', authMiddleware, adminMiddleware, saveTicketLimit);
router.post('/ratemaster', authMiddleware, adminMiddleware, saveRateMaster);
router.put('/addResult', authMiddleware, adminMiddleware, saveResult);
router.post('/setBlockTime', authMiddleware, adminMiddleware, setBlockTime);

// Entries & Reports (Auth required)
router.post('/addEntries', authMiddleware, addEntries);
router.get('/getResult', authMiddleware, getResult);
router.get('/next-bill', authMiddleware, getNextBillNumber);
router.get('/entries', authMiddleware, getEntries);
router.patch('/invalidateEntry/:id', authMiddleware, invalidateEntry);
router.delete('/deleteEntryById/:id', authMiddleware, deleteEntryById);
router.delete('/deleteEntriesByBillNo/:billNo', authMiddleware, deleteEntriesByBillNo);
router.put('/updateEntryCount/:id', authMiddleware, updateEntryCount);
router.get('/report/count', authMiddleware, getCountReport);
router.get('/rateMaster', authMiddleware, getRateMaster);
router.get('/getBlockTime/:drawLabel', authMiddleware, getBlockTime);
router.post('/countByNumber', authMiddleware, countByNumber);
router.get('/getticketLimit', authMiddleware, getLatestTicketLimit);
router.patch('/blockSales/:id', authMiddleware, toggleSalesBlock);
router.put('/users/:username', authMiddleware, updatePasswordController);

// Login (Public)
router.post('/login', loginUser);

module.exports = router;
