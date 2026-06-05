const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Entry = require('./model/Entry');
const SalesReportSummary = require('./model/Summary');

async function checkData() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");

    const entries = await Entry.find({
        timeLabel: { $regex: /6 PM|8 PM/i }
    }).limit(10).lean();

    console.log("Samples of 6PM/8PM entries:");
    console.log(JSON.stringify(entries, null, 2));

    const summaries = await SalesReportSummary.find({
        drawTime: { $regex: /6 PM|8 PM/i }
    }).limit(10).lean();

    console.log("Samples of 6PM/8PM summaries:");
    console.log(JSON.stringify(summaries, null, 2));

    await mongoose.disconnect();
}

checkData().catch(console.error);
