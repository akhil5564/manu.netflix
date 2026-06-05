const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Entry = require('./model/Entry');
const MainUser = require('./model/MainUser');

async function debugSubUserEntries() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");

    const subUsers = await MainUser.find({ usertype: { $in: ['sub', 'agent'] } }).select('username').lean();
    const subUsernames = subUsers.map(u => u.username);

    console.log("Sub-users found:", subUsernames);

    const entries = await Entry.find({
        createdBy: { $in: subUsernames },
        timeLabel: { $regex: /6 PM|8 PM/i }
    }).sort({ createdAt: -1 }).limit(20).lean();

    console.log("\nRecent 6PM/8PM entries for sub-users:");
    entries.forEach(e => {
        console.log(`User: ${e.createdBy}, Time: ${e.timeLabel}, CreatedAt: ${e.createdAt.toISOString()}, EntryDate: ${e.date.toISOString()}`);
    });

    await mongoose.disconnect();
}

debugSubUserEntries().catch(console.error);
