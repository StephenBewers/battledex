const test = require("node:test");
const assert = require("node:assert");
const { validateFighters, normalizeName } = require("../validation");

test("two different names are valid", () => {
  const result = validateFighters("Goku", "Vegeta");
  assert.ok(result.valid);
  assert.deepStrictEqual(result.fighters.a, { id: "goku", name: "Goku" });
});

test("both names are required", () => {
  for (const [a, b, keys] of [["", "x", ["a"]], ["x", "   ", ["b"]], ["", "", ["a", "b"]]]) {
    const result = validateFighters(a, b);
    assert.ok(!result.valid);
    assert.deepStrictEqual(Object.keys(result.errors), keys);
    for (const key of keys) assert.strictEqual(result.errors[key].type, "required");
  }
});

test("mirror matches are valid: the same fighter on both sides, in any case or spacing", () => {
  for (const [a, b] of [["Goku", "Goku"], ["Goku", " goku "], ["GOKU", "goku"], ["Son  Goku", "son goku"]]) {
    const result = validateFighters(a, b);
    assert.ok(result.valid, `${a} / ${b}`);
    assert.deepStrictEqual(result.errors, {});
    assert.strictEqual(result.fighters.a.id, result.fighters.b.id);
  }
});

test("identity is still the normalized name, so Goku and Son Goku differ", () => {
  assert.notStrictEqual(normalizeName("Goku"), normalizeName("Son Goku"));
});
