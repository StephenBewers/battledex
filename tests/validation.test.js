const test = require("node:test");
const assert = require("node:assert");
const { MAX_FIGHTER_NAME_LENGTH, validateFighters, normalizeName, nameLength, checkNameLength } = require("../validation");
const { MESSAGES } = require("../messages");

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

// ---- Name length limit ----

test("the limit is 50 characters", () => {
  assert.strictEqual(MAX_FIGHTER_NAME_LENGTH, 50);
});

test("a name of exactly 50 passes and 51 fails", () => {
  assert.ok(validateFighters("a".repeat(50), "Vegeta").valid);
  const result = validateFighters("a".repeat(51), "Vegeta");
  assert.ok(!result.valid);
  assert.strictEqual(result.errors.a.type, "too_long");
  assert.strictEqual(result.errors.a.message, MESSAGES.nameTooLong);
  assert.strictEqual(result.errors.b, undefined);
});

test("both fields can be too long at once, and each is checked on its own", () => {
  const result = validateFighters("a".repeat(51), "b".repeat(80));
  assert.deepStrictEqual(Object.keys(result.errors), ["a", "b"]);
  assert.strictEqual(result.errors.a.type, "too_long");
  assert.strictEqual(result.errors.b.type, "too_long");
});

test("whitespace is trimmed and collapsed before counting", () => {
  assert.ok(validateFighters("   " + "a".repeat(50) + "   ", "x").valid, "padding doesn't count");
  assert.strictEqual(nameLength("a    b"), 3, "a run of spaces counts once");
  // 25 words separated by 5 spaces each would be over 50 raw, but is 49 once collapsed.
  const spaced = Array(25).fill("a").join("     ");
  assert.ok(spaced.length > 50 && nameLength(spaced) === 49);
  assert.ok(validateFighters(spaced, "x").valid);
});

test("each character counts once, so an emoji is 1 and not 2", () => {
  assert.strictEqual(nameLength("\u{1F600}"), 1);
  assert.ok(validateFighters("\u{1F600}".repeat(50), "x").valid);
  assert.ok(!validateFighters("\u{1F600}".repeat(51), "x").valid);
});

test("a missing name is reported as missing, not as too long", () => {
  const result = validateFighters("", "b".repeat(60));
  assert.strictEqual(result.errors.a.type, "required");
  assert.strictEqual(result.errors.b.type, "too_long");
});

test("checkNameLength returns null for names that fit", () => {
  assert.strictEqual(checkNameLength("Goku"), null);
  assert.strictEqual(checkNameLength("  " + "a".repeat(50)), null);
  assert.strictEqual(checkNameLength("a".repeat(51)).type, "too_long");
});
