// Pure helpers for the energy bars. No DOM access, so they can be tested in Node.

// Both fighters start at 100. The loser must end at exactly 0 and the winner at
// 1-100. The server already checks this; if the values are still missing or
// wrong, the bars are hidden rather than showing something misleading.
function hasValidEnergy(verdict) {
  if (!verdict) return false;
  const { energyA, energyB } = verdict;
  if (!Number.isInteger(energyA) || !Number.isInteger(energyB)) return false;
  const winnerEnergy = verdict.winner === "A" ? energyA : energyB;
  const loserEnergy = verdict.winner === "A" ? energyB : energyA;
  return loserEnergy === 0 && winnerEnergy >= 1 && winnerEnergy <= 100;
}

// Colour is only an extra cue (the number is always shown as text).
function energyLevel(value) {
  if (value > 50) return "high";
  if (value > 20) return "mid";
  return "low";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { hasValidEnergy, energyLevel };
}
