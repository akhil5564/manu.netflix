const MainUser = require("../model/MainUser");
const Entry = require("../model/Entry");
const WinningSummary = require("../model/winningsummmary");
const Result = require("../model/ResultModel");
const Schema = require("../model/Schema");
const { calculateWinAmountFull, computeWinType } = require("../utils/winningUtils");

function parseDateISTStart(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function parseDateISTEnd(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

const summaryLabelMap = {
  "DEAR 1 PM": "DEAR 1 PM",
  "DEAR 1PM": "DEAR 1 PM",
  "KERALA 3 PM": "KERALA 3 PM",
  "KERALA 3PM": "KERALA 3 PM",
  "LSK 3 PM": "KERALA 3 PM",
  "LSK 3PM": "KERALA 3 PM",
  "DEAR 6 PM": "DEAR 6 PM",
  "DEAR 6PM": "DEAR 6 PM",
  "DEAR 8 PM": "DEAR 8 PM",
  "DEAR 8PM": "DEAR 8 PM"
};

const LABEL_GROUPS = [
  ["DEAR 1 PM", "DEAR 1PM", "D-1", "D-1-", "DEAR1"],
  ["KERALA 3 PM", "KERALA 3PM", "LSK 3 PM", "LSK 3PM", "LSK", "LSK3"],
  ["DEAR 6 PM", "DEAR 6PM", "D-6", "D-6-", "DEAR6"],
  ["DEAR 8 PM", "DEAR 8PM", "D-8", "D-8-", "DEAR8"]
];

const getSearchLabels = (label) => {
  if (!label) return [];
  const normalized = label.toString().toUpperCase().trim();
  const normalizedNoSpace = normalized.replace(/\s+/g, "");

  const group = LABEL_GROUPS.find(g =>
    g.some(alias => {
      const a = alias.toUpperCase();
      return a === normalized || a.replace(/\s+/g, "") === normalizedNoSpace;
    })
  );

  if (group) return group;
  return [label];
};

const saveWinningSummaryInternal = async ({ date, timeLabel, agent }) => {
  try {
    const searchLabels = getSearchLabels(timeLabel);
    const normalizedLabel = summaryLabelMap[timeLabel.toUpperCase()] || timeLabel;

    const users = await MainUser.find().select("username createdBy scheme").lean();
    const userMap = {};
    users.forEach(u => (userMap[u.username] = u));

    function getAllDescendants(username, visited = new Set()) {
      if (visited.has(username)) return [];
      visited.add(username);
      const children = users.filter(u => u.createdBy === username).map(u => u.username);
      let all = [...children];
      children.forEach(c => { all = all.concat(getAllDescendants(c, visited)); });
      return all;
    }

    const agentUsers = [agent, ...getAllDescendants(agent)];

    function getPath(username) {
      const path = [];
      let curr = userMap[username];
      while (curr && curr.createdBy) {
        path.unshift(curr.createdBy);
        curr = userMap[curr.createdBy];
      }
      return path;
    }

    const createdByPath = getPath(agent);
    const agentSchemeOrig = userMap[agent]?.scheme || "N/A";
    let activeTab = 1;
    if (agentSchemeOrig.toUpperCase() !== "N/A") {
      activeTab = parseInt(agentSchemeOrig.replace(/[^0-9]/g, ""), 10) || 1;
    }

    // 1. Fetch Result
    const resultDoc = await Result.findOne({ date, time: { $in: searchLabels } }).lean();
    if (!resultDoc) {
      console.log(`⚠️ No result found for ${date} in ${searchLabels}, skipping summary update for ${agent}`);
      return;
    }

    const normalizedResult = {
      "1": resultDoc.prizes?.[0] || null,
      "2": resultDoc.prizes?.[1] || null,
      "3": resultDoc.prizes?.[2] || null,
      "4": resultDoc.prizes?.[3] || null,
      "5": resultDoc.prizes?.[4] || null,
      others: (resultDoc.entries || []).map(e => e.result).filter(Boolean)
    };

    // 2. Fetch Scheme (Schema)
    const schemaDoc = await Schema.findOne(
      { activeTab, "draws.drawName": { $in: searchLabels } },
      { draws: { $elemMatch: { drawName: { $in: searchLabels } } } }
    ).lean();
    const drawSchemeData = schemaDoc?.draws?.[0];

    // 3. Fetch Entries (Direct entries only for this agent)
    const start = parseDateISTStart(date);
    const end = parseDateISTEnd(date);
    const entries = await Entry.find({
      createdBy: agent, // 🔑 Filter strictly to the agent to avoid hierarchy duplication
      isValid: true,
      timeLabel: { $in: searchLabels },
      date: { $gte: start, $lte: end }
    }).lean();

    // 4. Calculate Totals
    const billSet = new Set();
    const winCounts = {};
    let totalPrize = 0;
    let totalSuper = 0;
    let totalWinningEntries = 0;
    let totalBillAmount = 0;

    for (const e of entries) {
      const wins = calculateWinAmountFull(e, normalizedResult, drawSchemeData);
      if (wins && wins.length > 0) {
        billSet.add(e.billNo);
        totalWinningEntries++;
        totalBillAmount += (Number(e.total) || 0);

        for (const win of wins) {
          totalPrize += win.prize;
          totalSuper += win.superPrize;

          const winType = win.winType;
          if (winType) {
            winCounts[winType] = (winCounts[winType] || 0) + (e.count || 0);

            // 🔑 Store the ORIGINAL prize per win type as fallback for reports
            const unitSuper = (win.superPrize || 0) / (e.count || 1);
            winPrizes[winType] = unitSuper;
          }
        }
      }
    }

    // 5. Save Summary (Update even if 0 to clear old data)
    await WinningSummary.findOneAndUpdate(
      { date, timeLabel: normalizedLabel, agent },
      {
        date,
        timeLabel: normalizedLabel,
        agent,
        createdByPath,
        scheme: agentSchemeOrig,
        totalBills: billSet.size,
        totalWinningEntries,
        totalBillAmount,
        totalWinningAmount: totalPrize,
        superTotalAmount: totalPrize + totalSuper,
        winCounts: winCounts,
        winPrizes: winPrizes
      },
      { upsert: true, new: true }
    );

    console.log(`✅ [Summary Update] ${agent} - Prize: ${totalPrize}, Super: ${totalSuper}`);
  } catch (err) {
    console.error(`❌ Error updating winning summary for ${agent}:`, err);
  }
};

module.exports = { saveWinningSummaryInternal };
