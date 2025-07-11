const express = require('express');
const router = express.Router();
const { createUser,getresult,addEntries,getAllUsers } = require('../controller/Controller');

router.post('/newuser', createUser);
router.post('/getresult', getresult);
router.post('/addEntries', addEntries);
router.get('/users', getAllUsers); // 👈 this is the GET route



module.exports = router;
