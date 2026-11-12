const test = require("node:test");
const assert = require("node:assert");
const { sanitizeName, MAX_NAME_LENGTH } = require("../lib/sanitize");
const { names } = require("./adversarial-names.json");

test("trims and collapses whitespace", () => {
  assert.strictEqual(sanitizeName("  Son   Goku \n"), "Son Goku");
});

test("non-strings become empty", () => {
  for (const value of [undefined, null, 42, {}, []]) assert.strictEqual(sanitizeName(value), "");
});

test("control characters become spaces, invisible characters are removed", () => {
  assert.strictEqual(sanitizeName("Goku\u0000\u0007Vegeta"), "Goku Vegeta");
  assert.strictEqual(sanitizeName("Go​ku‮﻿"), "Goku");
});

test("keeps legitimate characters, including joined emoji", () => {
  assert.strictEqual(sanitizeName("AT&T <3"), "AT&T <3");
  assert.strictEqual(sanitizeName("\u{1F468}‍\u{1F469}‍\u{1F467} family"), "\u{1F468}‍\u{1F469}‍\u{1F467} family");
});

test("caps length without splitting characters", () => {
  const long = "\u{1F600}".repeat(200);
  const out = sanitizeName(long);
  assert.strictEqual(Array.from(out).length, MAX_NAME_LENGTH);
  assert.ok(!/[\uD800-\uDBFF]$/.test(out), "must not end on a lone surrogate");
});

for (const { label, name } of names) {
  test(`adversarial name "${label}" sanitizes to a short, clean single line`, () => {
    const out = sanitizeName(name);
    assert.ok(Array.from(out).length <= MAX_NAME_LENGTH);
    assert.ok(!/[\p{Cc}\p{Zl}\p{Zp}]/u.test(out), "no control or line separator characters");
    assert.ok(!/(?!‍)\p{Cf}/u.test(out), "no invisible formatting characters");
    assert.strictEqual(out, out.trim());
  });
}
