const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = "mongodb+srv://sharjina:sharj@cluster0.siovpga.mongodb.net/betapp?retryWrites=true&w=majority&appName=Cluster0";

const MainUser = require('./model/MainUser');
const DrawScheme = require('./model/Schema');

async function check() {
  try {
    await mongoose.connect(MONGO_URI);
    
    const bit = await MainUser.findOne({ username: "bit" }).lean();
    if (bit) {
        const tab = parseInt((bit.scheme || "1").replace(/[^0-9]/g, ""), 10) || 1;
        const schema = await DrawScheme.findOne({ activeTab: tab }).lean();
        if (schema) {
            console.log(`Scheme for 'bit' (Tab ${tab}):`);
            const draw = schema.draws[0]; // Just check the first draw as example
            if (draw) {
                const group1 = draw.schemes.find(g => g.group === "Group 1");
                console.log("Group 1 Config:", JSON.stringify(group1, null, 2));
            }
        }
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
