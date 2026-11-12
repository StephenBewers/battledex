const test = require("node:test");
const assert = require("node:assert");
const { STYLE_PROMPT, buildArtPrompt } = require("../lib/art-prompt");
const { sanitizeName, InvalidFighterError, MAX_NAME_LENGTH } = require("../lib/sanitize");
const { names } = require("./adversarial-names.json");

test("style prompt describes the fixed house style", () => {
  const s = STYLE_PROMPT.toLowerCase();
  for (const word of ["16-bit", "character select", "pixel-art bust", "flat", "outline"]) {
    assert.ok(s.includes(word), word);
  }
});

test("the style prompt comes first and the name is a quoted string", () => {
  const prompt = buildArtPrompt("Goku");
  assert.ok(prompt.startsWith(STYLE_PROMPT));
  assert.ok(prompt.endsWith('Name: "Goku"'));
});

test("empty names throw InvalidFighterError", () => {
  assert.throws(() => buildArtPrompt("   "), InvalidFighterError);
  assert.throws(() => buildArtPrompt(undefined), InvalidFighterError);
});

for (const { label, name } of names) {
  test(`adversarial name "${label}" stays inside the quoted name`, () => {
    const prompt = buildArtPrompt(name);
    assert.ok(prompt.startsWith(STYLE_PROMPT));

    // Everything after "Name: " is one JSON string holding the sanitized name.
    const quoted = prompt.slice(prompt.lastIndexOf("\nName: ") + "\nName: ".length);
    assert.strictEqual(JSON.parse(quoted), sanitizeName(name));
    assert.ok(!quoted.includes("\n"), "name is a single line");
    assert.ok(Array.from(JSON.parse(quoted)).length <= MAX_NAME_LENGTH);
    // The prompt has exactly one "Name:" line, so the name can't add another section.
    assert.strictEqual(prompt.split("\nName: ").length, 2);
  });
}
