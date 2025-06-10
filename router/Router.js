const express = require('express');
const { postAddData, getAllData,getData,postAddResult,deleteContainer,getResult,createUser } = require('./controller/Controller');
const { loginUser } = require('../controller/Controller');

const app = express();

// Middleware to parse incoming JSON requests
app.use(express.json());

// Routes to handle adding and fetching data

app.post('/loginUser', loginUser);
app.post('/addData', authenticateUser, postAddData);
app.get('/getData', authenticateUser, getAllData);

router.get('/data', getData);
app.post('/addResult', postAddResult);
// Correct DELETE route to delete data by ID
app.delete('/deleteData/:id', deleteContainer);
app.get('/getresult',getResult );    // To get all the stored data
app.get('/getCounts',getCounts );    // To get all the stored data
// Ensure the route is /api/getCounts and not just /getCounts
router.get('/getCounts', getCounts);
app.post('/newuser',createUser );








const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

