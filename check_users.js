const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MainUser = require('./model/MainUser');

async function checkUsers() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");

    const users = await MainUser.find().limit(10).lean();
    console.log("Samples of MainUser:");
    console.log(JSON.stringify(users, null, 2));

    await mongoose.disconnect();
}

checkUsers().catch(console.error);
