const express = require('express');
const router = express.Router();
const { createUser,getresult,addEntries,getAllUsers,saveTicketLimit,saveRateMaster,saveResult,getEntries,  loginUser,  getNextBill // ✅ Add this

 } = require('../controller/Controller');

router.post('/newuser', createUser);
router.post('/addEntries', addEntries);
router.get('/users', getAllUsers); // 👈 this is the GET route
router.post('/ticket-limit', saveTicketLimit);
router.post('/ratemaster', saveRateMaster);
router.post('/addResult', saveResult);
router.get('/getResult', getResult);
router.post('/login', loginUser);
router.get('/next-bill', getNextBill); // ✅ Add this
router.get('/entries', getEntries); // 👈 Add this


module.exports = router;
