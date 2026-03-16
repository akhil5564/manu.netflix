/**
 * Shared logic for calculating winning types and amounts.
 */

const extractBaseType = (type) => {
    if (!type) return "SUPER";
    const upper = type.toString().toUpperCase();
    if (upper.includes("SUPER")) return "SUPER";
    if (upper.includes("BOX")) return "BOX";
    if (upper.includes("AB")) return "AB";
    if (upper.includes("BC")) return "BC";
    if (upper.includes("AC")) return "AC";
    if (upper.endsWith("A") || upper.includes("-A")) return "A";
    if (upper.endsWith("B") || upper.includes("-B")) return "B";
    if (upper.endsWith("C") || upper.includes("-C")) return "C";
    const parts = type.toString().split("-");
    return parts[parts.length - 1] || "SUPER";
};

const computeWinType = (entry, results) => {
    if (!results) return [];
    const baseType = extractBaseType(entry.type);
    const num = entry.number;
    const first = results["1"];
    const others = results.others || [];
    const wins = [];

    if (baseType === "SUPER") {
        if (num === results["1"]) wins.push("SUPER 1");
        if (num === results["2"]) wins.push("SUPER 2");
        if (num === results["3"]) wins.push("SUPER 3");
        if (num === results["4"]) wins.push("SUPER 4");
        if (num === results["5"]) wins.push("SUPER 5");
        if (others.includes(num)) wins.push("SUPER other");
        return wins;
    }

    if (baseType === "BOX") {
        const sortStr = (s) => s.split("").sort().join("");
        const numSorted = sortStr(num);
        const firstPrize = results["1"];

        if (!firstPrize) return [];

        if (num === firstPrize) {
            wins.push("BOX perfect"); // Maps to Pos 1
        } else if (numSorted === sortStr(firstPrize)) {
            wins.push("BOX permutation"); // Maps to Pos 6
        }
        return wins;
    }

    if (["AB", "BC", "AC", "A", "B", "C"].includes(baseType)) {
        if (!first || first.length < 3) return [];
        const [d1, d2, d3] = first.split("");
        if (baseType === "A" && num === d1) wins.push("A");
        if (baseType === "B" && num === d2) wins.push("B");
        if (baseType === "C" && num === d3) wins.push("C");
        if (baseType === "AB" && num === (d1 + d2)) wins.push("AB");
        if (baseType === "BC" && num === (d2 + d3)) wins.push("BC");
        if (baseType === "AC" && num === (d1 + d3)) wins.push("AC");
        return wins;
    }
    return wins;
};

const calculateWinAmountFull = (entry, results, schemeData, fallbackPrizes = {}) => {
    if (!results || !results["1"]) return [];

    const baseType = extractBaseType(entry.type);
    const winTypes = computeWinType(entry, results);
    if (!winTypes || winTypes.length === 0) return [];

    // Find the group in schemeData that matches this baseType
    let targetGroup = "";
    if (baseType === "A" || baseType === "B" || baseType === "C") {
        targetGroup = "Group 1";
    } else if (["AB", "BC", "AC"].includes(baseType)) {
        targetGroup = "Group 2";
    } else if (baseType === "SUPER") {
        targetGroup = "Group 3-SUPER";
    } else if (baseType === "BOX") {
        targetGroup = "Group 3-BOX";
    }

    const group = (schemeData?.schemes || []).find(g => g.group === targetGroup);
    // If group is missing, we can't find rows, but we can still return fallback if provided

    const allWins = [];
    for (const winType of winTypes) {
        let row;
        if (group) {
            if (baseType === "SUPER" || baseType === "BOX") {
                const match = winType.match(/(\d+)/); // Extracts 1, 2, 3...
                const pos = match
                    ? parseInt(match[1], 10)
                    : (winType.toLowerCase().includes("other") || winType.toLowerCase().includes("permutation") ? 6 : 1);
                row = group.rows.find(r => r.pos === pos);

                // Box fallback for non-doubles if pos > 1
                if (!row && baseType === "BOX" && pos <= 1) {
                    row = group.rows[0]; // Default to first row
                }
            } else {
                row = group.rows.find(r => r.scheme === baseType);
            }
        }

        const count = entry.count || 0;
        const fallbackSuper = fallbackPrizes[winType] || 0;

        // 🔑 THE FIX: Use fallbackSuper if row missing
        const finalSuper = row ? (row.super || 0) : fallbackSuper;

        allWins.push({
            prize: (row ? (row.amount || 0) : 0) * count,
            superPrize: finalSuper * count,
            winType: winType
        });
    }

    return allWins;
};

const calculateWinAmount = (entry, results, schemeData) => {
    const wins = calculateWinAmountFull(entry, results, schemeData);
    return wins.reduce((sum, w) => sum + w.prize, 0);
};

module.exports = {
    extractBaseType,
    computeWinType,
    calculateWinAmount,
    calculateWinAmountFull
};