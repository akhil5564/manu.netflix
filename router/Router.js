const express = require('express');
const router = express.Router();
const { createUser,getresult,addEntries,getAllUsers,deleteUser,saveTicketLimit,saveRateMaster,saveResult,getEntries,getNextBillNumber,  loginUser, invalidateEntry,deleteEntryById,deleteEntriesByBillNo,updateEntryCount,  getCountReport,getRateMaster,getBlockTime,setBlockTime,countByNumber, getLatestTicketLimit ,toggleLoginBlock,toggleSalesBlock,updatePasswordController
// ✅ Add this

 } = require('../controller/Controller');
router.delete('/users/:id', deleteUser);

router.post('/newuser', createUser);
router.post('/addEntries', addEntries);
router.get('/users', getAllUsers); // 👈 this is the GET route
router.post('/ticket-limit', saveTicketLimit);
router.post('/ratemaster', saveRateMaster);
router.put('/addResult', saveResult);
router.get('/getResult', getResult);
router.post('/login', loginUser);
router.get('/next-bill', getNextBillNumber); // ✅ Add this
router.get('/entries', getEntries); // 👈 Add this
router.post('/addEntries', addEntries);
router.patch('/invalidateEntry/:id', invalidateEntry);
router.delete('/deleteEntryById/:id', deleteEntryById);
router.delete('/deleteEntriesByBillNo/:billNo', deleteEntriesByBillNo);
router.put('/updateEntryCount/:id',updateEntryCount); // if added
router.get('/report/count', getCountReport); // ✅ Set route
router.get('/rateMaster', getRateMaster);
router.post('/setBlockTime', setBlockTime);
router.get('/getBlockTime/:drawLabel', getBlockTime);
router.post('/countByNumber', countByNumber);
router.get('/getticketLimit', getLatestTicketLimit);
router.patch("/user/blockLogin/:id", toggleLoginBlock);
router.patch('/blockSales/:id', toggleSalesBlock); // ✅ New route
router.put('/users/:username', updatePasswordController);

module.exports = router;
