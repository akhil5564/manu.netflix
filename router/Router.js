const express = require('express');
const router = express.Router();
const { createUser,getresult,addEntries,getAllUsers,saveTicketLimit,saveRateMaster,saveResult,getEntries,getNextBillNumber,  loginUser, invalidateEntry,deleteEntryById// ✅ Add this

 } = require('../controller/Controller');

router.post('/newuser', createUser);
router.post('/addEntries', addEntries);
router.get('/users', getAllUsers); // 👈 this is the GET route
router.post('/ticket-limit', saveTicketLimit);
router.post('/ratemaster', saveRateMaster);
router.post('/addResult', saveResult);
router.get('/getResult', getResult);
router.post('/login', loginUser);
router.get('/next-bill', getNextBillNumber); // ✅ Add this
router.get('/entries', getEntries); // 👈 Add this
router.post('/addEntries', addEntries);
router.patch('/invalidateEntry/:id', invalidateEntry);
router.delete('/deleteEntryById/:id', deleteEntryById);


module.exports = router;
