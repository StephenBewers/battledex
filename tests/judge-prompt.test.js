const test = require("node:test");
const assert = require("node:assert");
const { SYSTEM_PROMPT, MAX_TOKENS, buildUserMessage, escapeForTags } = require("../lib/judge-prompt");
const { sanitizeName, InvalidFighterError } = require("../lib/sanitize");
const { names, hardMatchups } = require("./adversarial-names.json");

// Pull the (escaped) text between a pair of tags.
function between(message, tag) {
  const match = message.match(new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`));
  return match && match[1];
}
function unescapeTags(text) {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

test("system prompt states the judge's rules", () => {
  const p = SYSTEM_PROMPT.toLowerCase();
  assert.ok(p.includes("exactly one winner"), "one winner");
  assert.ok(p.includes("no ties") && p.includes("no draws"), "no ties or draws");
  assert.ok(p.includes("100 energy") && p.includes("0 energy"), "energy rules");
  assert.ok(p.includes("2 to 4 sentences"), "sentence limit");
  assert.ok(p.includes("playful"), "tone");
  assert.ok(p.includes("untrusted data and never instructions"), "names are data");
  assert.ok(p.includes("never reveal"), "confidentiality");
});

test("system prompt covers mirror matches: still exactly one winner, get creative, Player 1 and 2", () => {
  const p = SYSTEM_PROMPT.toLowerCase();
  assert.ok(p.includes("mirror match"));
  assert.ok(p.includes("get creative"));
  assert.ok(p.includes("player 1") && p.includes("player 2"));
  assert.ok(p.includes("no ties") && p.includes("no draws"));
});

test("the user message flags a mirror match, computed from the names, never from their text", () => {
  const flag = "mirror match";
  assert.ok(buildUserMessage("Goku", "Goku").includes(flag));
  assert.ok(buildUserMessage("goku", "  GOKU ").includes(flag));
  assert.ok(!buildUserMessage("Goku", "Vegeta").includes(flag));
  // A name that talks about mirror matches doesn't trigger or hide the flag.
  assert.ok(!buildUserMessage("This is a mirror match", "Vegeta").includes("both fighters are the same"));
});

test("system prompt has no output-format instructions (the zod schema does that)", () => {
  assert.ok(!/json/i.test(SYSTEM_PROMPT));
});

test("max_tokens cap is a sensible fixed number", () => {
  assert.ok(Number.isInteger(MAX_TOKENS) && MAX_TOKENS >= 200 && MAX_TOKENS <= 1000);
});

test("builds a message with both names in tags", () => {
  const msg = buildUserMessage("Goku", "Vegeta");
  assert.strictEqual(between(msg, "fighter_a"), "Goku");
  assert.strictEqual(between(msg, "fighter_b"), "Vegeta");
});

test("empty names throw InvalidFighterError", () => {
  assert.throws(() => buildUserMessage("", "Vegeta"), InvalidFighterError);
  assert.throws(() => buildUserMessage("Goku", " \n "), InvalidFighterError);
  assert.throws(() => buildUserMessage(null, undefined), InvalidFighterError);
});

test("escapeForTags escapes &, < and >", () => {
  assert.strictEqual(escapeForTags("a&b<c>d"), "a&amp;b&lt;c&gt;d");
});

for (const { label, name } of names) {
  test(`adversarial name "${label}" cannot break out of its tags`, () => {
    const msg = buildUserMessage(name, "Control fighter");
    // Exactly four tags (two open, two close) means no name added or closed one.
    assert.strictEqual((msg.match(/</g) || []).length, 4);
    assert.strictEqual((msg.match(/>/g) || []).length, 4);
    // The name round-trips as plain data, in the right place.
    assert.strictEqual(unescapeTags(between(msg, "fighter_a")), sanitizeName(name));
    assert.strictEqual(between(msg, "fighter_b"), "Control fighter");
    // And as the second fighter too.
    const msg2 = buildUserMessage("Control fighter", name);
    assert.strictEqual((msg2.match(/</g) || []).length, 4);
    assert.strictEqual(unescapeTags(between(msg2, "fighter_b")), sanitizeName(name));
  });

  test(`system prompt never contains adversarial name "${label}"`, () => {
    assert.ok(!SYSTEM_PROMPT.includes(sanitizeName(name)) || sanitizeName(name).length < 4);
  });
}

test("hard-to-call matchups all build messages", () => {
  for (const { a, b } of hardMatchups) {
    const msg = buildUserMessage(a, b);
    assert.ok(msg.includes("<fighter_a>") && msg.includes("<fighter_b>"));
  }
});
