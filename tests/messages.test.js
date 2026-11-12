const test = require("node:test");
const assert = require("node:assert");
const { MESSAGES, joinNames, uniqueNames, fightFailureMessage, artNoteMessage, shuffled } = require("../public/messages");
const { validateFighters } = require("../public/validation");

const fighters = { a: { name: "Goku" }, b: { name: "Vegeta" } };

// One real message per scenario from the plan.
function scenarios() {
  return {
    "rate limit": MESSAGES.rateLimit(42),
    "rate limit (no time)": MESSAGES.rateLimit(undefined),
    "missing fighter 1": MESSAGES.missingFighter.a,
    "missing fighter 2": MESSAGES.missingFighter.b,
    "name too long": MESSAGES.nameTooLong,
    "judge timeout": MESSAGES.judgeTimeout,
    "judge call failed": MESSAGES.judgeFailed,
    "moderation block": MESSAGES.moderationBlock(["Goku"]),
    "image gen fail": MESSAGES.imageFailed(["Goku"]),
    "network lost": MESSAGES.networkLost,
    "generic fallback": MESSAGES.generic,
  };
}

test("every scenario has its own non-empty message", () => {
  const all = scenarios();
  for (const [name, text] of Object.entries(all)) {
    assert.strictEqual(typeof text, "string", name);
    assert.ok(text.trim().length > 10, `${name} is too short`);
  }
  const values = Object.values(all);
  assert.strictEqual(new Set(values).size, values.length, "no two scenarios share a message");
});

test("messages are short, plain text with no jargon or status codes", () => {
  const everything = [
    ...Object.values(scenarios()),
    ...Object.values(MESSAGES.save).map((m) => (typeof m === "function" ? m("Goku") : m)),
    ...Object.values(MESSAGES.dex).map((m) => (typeof m === "function" ? m("Goku") : m)),
  ];
  for (const text of everything) {
    assert.ok(text.length <= 130, `too long (${text.length}): ${text}`);
    assert.ok(!/[<>]/.test(text), text);
    assert.ok(!/\b(error|exception|undefined|null|NaN|http|json|api|server|status|[45]\d\d)\b/i.test(text), `jargon in: ${text}`);
    assert.ok(/[.!?]$/.test(text), `should end like a sentence: ${text}`);
  }
});

test("messages that say what to do next tell the user to press Fight or retry", () => {
  for (const text of [MESSAGES.judgeTimeout, MESSAGES.judgeFailed, MESSAGES.networkLost, MESSAGES.generic]) {
    assert.ok(/press fight|try again/i.test(text), text);
  }
});

test("rate limit message includes the wait time, singular and plural", () => {
  assert.ok(MESSAGES.rateLimit(42).includes("42 seconds"));
  assert.ok(MESSAGES.rateLimit(1).includes("1 second."));
  assert.ok(!MESSAGES.rateLimit(undefined).includes("undefined"));
  assert.ok(!MESSAGES.rateLimit(0).includes("0 seconds"));
});

test("missing fighters: validation uses the per-field messages", () => {
  assert.strictEqual(validateFighters("", "Vegeta").errors.a.message, MESSAGES.missingFighter.a);
  assert.strictEqual(validateFighters("Goku", " ").errors.b.message, MESSAGES.missingFighter.b);
});

test("fightFailureMessage picks the right message for each failure", () => {
  assert.strictEqual(fightFailureMessage({ status: 429, retryAfter: 30 }), MESSAGES.rateLimit(30));
  assert.strictEqual(fightFailureMessage({ status: 429 }), MESSAGES.rateLimit(undefined));
  assert.strictEqual(fightFailureMessage({ name: "TimeoutError" }), MESSAGES.judgeTimeout);
  assert.strictEqual(fightFailureMessage({ status: 504 }), MESSAGES.judgeTimeout);
  assert.strictEqual(fightFailureMessage({ status: 502 }), MESSAGES.judgeFailed);
  assert.strictEqual(fightFailureMessage({ name: "NetworkError" }), MESSAGES.networkLost);
  assert.strictEqual(fightFailureMessage({ status: 400, code: "name_too_long" }), MESSAGES.nameTooLong);
  for (const other of [{ status: 500 }, { status: 503 }, { status: 400 }, new SyntaxError("bad json"), new TypeError("oops"), undefined, null, {}]) {
    assert.strictEqual(fightFailureMessage(other), MESSAGES.generic, String(other && other.name));
  }
});

test("art notes: blocked and failed have their own wording, fine art has none", () => {
  const ok = { a: "generated", b: "not_requested" };
  assert.strictEqual(artNoteMessage(fighters, ok), "");
  assert.strictEqual(artNoteMessage(fighters, undefined), "");

  const blocked = artNoteMessage(fighters, { a: "moderation_blocked", b: "generated" });
  assert.strictEqual(blocked, MESSAGES.moderationBlock(["Goku"]));
  assert.ok(blocked.includes("Goku") && !blocked.includes("Vegeta"));

  const failed = artNoteMessage(fighters, { a: "generated", b: "failed" });
  assert.strictEqual(failed, MESSAGES.imageFailed(["Vegeta"]));
  assert.notStrictEqual(blocked.replace("Goku", "X"), failed.replace("Vegeta", "X"));

  const both = artNoteMessage(fighters, { a: "moderation_blocked", b: "failed" });
  assert.ok(both.includes(MESSAGES.moderationBlock(["Goku"])) && both.includes(MESSAGES.imageFailed(["Vegeta"])));
});

test("art notes in a mirror match name the fighter once, and plurals read correctly", () => {
  const mirror = { a: { name: "Goku" }, b: { name: "Goku" } };
  const note = artNoteMessage(mirror, { a: "failed", b: "failed" });
  assert.strictEqual(note.split("Goku").length - 1, 1);
  assert.ok(note.includes("a placeholder is"));

  // The same fighter typed with different case or spacing is still one fighter.
  const mirrorCase = artNoteMessage({ a: { name: "Goku" }, b: { name: " goku " } }, { a: "moderation_blocked", b: "moderation_blocked" });
  assert.strictEqual(mirrorCase.toLowerCase().split("goku").length - 1, 1);
  assert.ok(mirrorCase.includes("a placeholder is standing in for the portrait."));

  const two = artNoteMessage(fighters, { a: "moderation_blocked", b: "moderation_blocked" });
  assert.ok(two.includes("Goku and Vegeta") && two.includes("placeholders are standing in for the portraits."));
  assert.deepStrictEqual(uniqueNames(["Goku", "GOKU", "Son  Goku"]), ["Goku", "Son  Goku"]);
});

test("fighter names go in as plain text, never parsed", () => {
  const nasty = { a: { name: "<b>Goku</b>" }, b: { name: "Vegeta" } };
  assert.ok(artNoteMessage(nasty, { a: "failed", b: "generated" }).includes("<b>Goku</b>")); // inserted with textContent later
  assert.strictEqual(joinNames(["A", "B", "C"]), "A, B and C");
});

test("loading phrases: at least 10, unique, short and on theme", () => {
  assert.ok(MESSAGES.loading.length >= 10 && MESSAGES.loading.length <= 14);
  assert.strictEqual(new Set(MESSAGES.loading).size, MESSAGES.loading.length);
  for (const phrase of MESSAGES.loading) {
    assert.ok(phrase.length <= 60, phrase);
    assert.ok(phrase.trim().length > 10);
  }
  assert.ok(MESSAGES.loadingIntervalMs >= 2000 && MESSAGES.loadingIntervalMs <= 3000);
});

test("shuffled returns every phrase once, without changing the original", () => {
  const original = [...MESSAGES.loading];
  const mixed = shuffled(MESSAGES.loading);
  assert.deepStrictEqual(MESSAGES.loading, original);
  assert.deepStrictEqual([...mixed].sort(), [...original].sort());
  // A fixed random source gives a fixed order.
  assert.deepStrictEqual(shuffled([1, 2, 3, 4], () => 0), [2, 3, 4, 1]);
  assert.notDeepStrictEqual(shuffled(MESSAGES.loading, () => 0), original);
});
