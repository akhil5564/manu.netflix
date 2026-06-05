const { calculateWinAmountFull, computeWinType } = require('./utils/winningUtils');

const mockResults = {
    "1": "001",
    "2": "001",
    "3": "888",
    "4": "999",
    "5": "001",
    "others": ["001", "123"]
};

const mockEntry = {
    number: "001",
    type: "SUPER", // or D-1-SUPER, etc.
    count: 1
};

const mockSchemeData = {
    schemes: [
        {
            group: "Group 3-SUPER",
            rows: [
                { pos: 1, amount: 5000, super: 0 },
                { pos: 2, amount: 500, super: 0 },
                { pos: 3, amount: 250, super: 0 },
                { pos: 4, amount: 100, super: 0 },
                { pos: 5, amount: 50, super: 0 },
                { pos: 6, amount: 20, super: 0 }
            ]
        }
    ]
};

console.log("--- Testing computeWinType ---");
const winTypes = computeWinType(mockEntry, mockResults);
console.log("Win Types found:", winTypes);

console.log("\n--- Testing calculateWinAmountFull ---");
const fullWins = calculateWinAmountFull(mockEntry, mockResults, mockSchemeData);
console.log("Full Wins details:", JSON.stringify(fullWins, null, 2));

const expectedTypes = ["SUPER 1", "SUPER 2", "SUPER 5", "SUPER other"];
const allFound = expectedTypes.every(t => winTypes.includes(t));
const countCorrect = winTypes.length === 4;

if (allFound && countCorrect) {
    console.log("\n✅ SUCCESS: All expected prizes found!");
} else {
    console.log("\n❌ FAILURE: Missing some prizes or count mismatch.");
}
