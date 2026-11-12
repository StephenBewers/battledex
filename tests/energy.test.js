const test = require("node:test");
const assert = require("node:assert");
const { hasValidEnergy, energyLevel } = require("../energy");

const v = (winner, energyA, energyB) => ({ winner, energyA, energyB });

test("a valid verdict has the loser at 0 and the winner at 1-100", () => {
  assert.ok(hasValidEnergy(v("A", 72, 0)));
  assert.ok(hasValidEnergy(v("B", 0, 1)));
  assert.ok(hasValidEnergy(v("B", 0, 100)));
});

test("anything else hides the bars", () => {
  for (const bad of [
    v("A", 0, 0), // winner at 0
    v("A", 50, 10), // loser above 0
    v("B", 10, 50),
    v("A", 101, 0),
    v("A", -1, 0),
    v("A", 50.5, 0),
    v("A", "50", 0),
    v("A", undefined, 0),
    v("A", 50, null),
    { winner: "A" },
    null,
    undefined,
  ]) {
    assert.ok(!hasValidEnergy(bad), JSON.stringify(bad));
  }
});

test("levels: high above 50, mid 21-50, low 20 and under", () => {
  assert.strictEqual(energyLevel(100), "high");
  assert.strictEqual(energyLevel(51), "high");
  assert.strictEqual(energyLevel(50), "mid");
  assert.strictEqual(energyLevel(21), "mid");
  assert.strictEqual(energyLevel(20), "low");
  assert.strictEqual(energyLevel(0), "low");
});
