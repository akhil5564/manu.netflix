const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const BlockTime = require('./model/BlockNumber'); // Careful, index.js says Controller.getBlockTime uses BlockTime model, let's verify model name

async function checkBlockTimes() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");

    // I need to find which model is used for BlockTime.
    // Controller.js uses 'BlockTime' but it's not in the 'model' directory listing I saw earlier.
    // Wait, I saw 'BlockNumber.js' in 'model'.
    // Let's check Controller.js for the require.

    // Actually, I can just query the collection directly if I know the name.
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("Collections:", collections.map(c => c.name));

    const blockTimes = await mongoose.connection.db.collection('blocktimes').find({}).toArray();
    console.log("BlockTimes in 'blocktimes' collection:");
    console.log(JSON.stringify(blockTimes, null, 2));

    await mongoose.disconnect();
}

checkBlockTimes().catch(console.error);
