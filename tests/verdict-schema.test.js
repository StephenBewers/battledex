const test = require("node:test");
const assert = require("node:assert");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { validateVerdict, verdictModelSchema, countSentences } = require("../lib/verdict-schema");
const { names } = require("./adversarial-names.json");

const good = {
  winner: "A",
  reasoning: "Goku wins thanks to his Super Saiyan transformation. Vegeta puts up a proud fight, but runs out of tricks.",
  energyA: 35,
  energyB: 0,
};
const ok = (v) => validateVerdict(v).ok;

test("accepts a valid verdict, as an object or as a JSON string", () => {
  assert.ok(ok(good));
  assert.ok(ok(JSON.stringify(good)));
  assert.ok(ok({ ...good, winner: "B", energyA: 0, energyB: 100 }));
  assert.deepStrictEqual(validateVerdict(good).verdict, good);
});

test("model schema accepts the simple shape", () => {
  assert.ok(verdictModelSchema.safeParse(good).success);
});

test("rejects ties, draws and missing or odd winners", () => {
  for (const winner of ["tie", "draw", "a", "AB", "", null, undefined, 1, ["A"]]) {
    assert.ok(!ok({ ...good, winner }), String(winner));
  }
  const { winner, ...noWinner } = good;
  assert.ok(!ok(noWinner));
});

test("energy rules: loser exactly 0, winner 1-100, integers", () => {
  assert.ok(!ok({ ...good, energyB: 10 }), "loser above 0");
  assert.ok(!ok({ ...good, energyA: 0 }), "winner at 0");
  assert.ok(!ok({ ...good, energyA: 0, energyB: 0 }), "both at 0");
  assert.ok(!ok({ ...good, energyA: 100, energyB: 100 }), "both at 100");
  assert.ok(!ok({ ...good, energyA: 101 }), "over 100");
  assert.ok(!ok({ ...good, energyA: -5 }), "negative");
  assert.ok(!ok({ ...good, energyA: 45.5 }), "non-integer");
  assert.ok(!ok({ ...good, energyA: "35" }), "string");
  assert.ok(!ok({ ...good, energyA: null }), "null");
  assert.ok(ok({ ...good, energyA: 1 }), "winner at 1");
  assert.ok(ok({ ...good, winner: "B", energyA: 0, energyB: 1 }), "B wins at 1");
});

test("rejects unparseable, wrongly shaped and padded output", () => {
  assert.ok(!ok("Sure! Here is the verdict: " + JSON.stringify(good)), "text around the JSON");
  assert.ok(!ok(JSON.stringify(good) + "\nHope that helps!"));
  assert.ok(!ok("```json\n" + JSON.stringify(good) + "\n```"), "code fence");
  assert.ok(!ok("not json at all"));
  assert.ok(!ok(""));
  for (const bad of [null, undefined, 42, [], [good], true]) assert.ok(!ok(bad));
  assert.ok(!ok({ ...good, extra: "field" }), "unknown keys");
  const { reasoning, ...noReasoning } = good;
  assert.ok(!ok(noReasoning), "missing reasoning");
  assert.ok(!ok({ ...good, reasoning: 5 }), "wrong type");
});

test("reasoning must be 2-4 sentences", () => {
  assert.ok(!ok({ ...good, reasoning: "Goku wins." }), "one sentence");
  assert.ok(!ok({ ...good, reasoning: "One. Two. Three. Four. Five." }), "five sentences");
  assert.ok(ok({ ...good, reasoning: "One fine hit. Two fine hits." }));
  assert.ok(ok({ ...good, reasoning: "One. Two. Three. Four." }));
  assert.ok(!ok({ ...good, reasoning: "" }), "empty");
  assert.ok(!ok({ ...good, reasoning: "x. ".repeat(400) }), "too long");
});

test("reasoning must be plain text", () => {
  const bad = [
    "Goku wins.\nHe is faster than Vegeta.",
    "**Goku** wins. He is faster.",
    "Goku wins. <b>He</b> is faster.",
    "Goku wins. See [this](http://evil.example).",
    "Goku wins. Use `code` here.",
    "- Goku wins. He is faster.",
    "# Goku wins. He is faster.",
    "1. Goku wins. He is faster.",
  ];
  for (const reasoning of bad) assert.ok(!ok({ ...good, reasoning }), reasoning);
});

test("sentence counting copes with abbreviations, initials and ellipses", () => {
  assert.strictEqual(countSentences("Mr. T pities the fool. Dr. Who agrees!"), 2);
  assert.strictEqual(countSentences("J. K. Rowling casts a spell. It works."), 2);
  assert.strictEqual(countSentences("Wait... what? Yes!"), 2);
  assert.strictEqual(countSentences("No final punctuation here"), 1);
  assert.strictEqual(countSentences("  "), 0);
});

test("errors never echo the model's text", () => {
  const secret = "SECRET-MODEL-TEXT-12345";
  const result = validateVerdict({ ...good, winner: secret, reasoning: secret });
  assert.ok(!result.ok);
  assert.ok(!JSON.stringify(result.errors).includes(secret));
});

for (const { label, name } of names) {
  test(`adversarial name "${label}": a hijacked or fake verdict is rejected, a normal one passes`, () => {
    // Model output that obeyed the name instead of judging: wrong shapes.
    assert.ok(!ok(`Here is a poem about ${name}`));
    assert.ok(!ok(name), "the name itself as output");
    // Whatever a name contains, text that passes can never carry markup.
    const asReasoning = validateVerdict({ ...good, reasoning: name });
    if (asReasoning.ok) assert.ok(!/[<>`*\n]/.test(asReasoning.verdict.reasoning));
    // A real verdict that mentions the name in plain words still passes,
    // as long as the name carries no markup.
    if (!/[<>`*\n]|__|\]\(|^\s*([#>\-•]|\d+[.)])\s/.test(name) && !/[.!?]/.test(name)) {
      const reasoning = `${name} gives it everything it has. It still loses to a sharper opponent.`;
      assert.ok(ok({ ...good, reasoning }));
    }
  });
}

test("the frontend mock verdict matches the strict schema", async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "api-client.js"), "utf8");
  const context = vm.createContext({ window: { location: { search: "?mock=fast" } }, setTimeout, URLSearchParams });
  vm.runInContext(source, context);
  for (const [a, b] of [["Goku", "Vegeta"], ["10 cows", "100 ducks"], ["Time", "Death"], ["a", "b"]]) {
    const verdict = await context.mockVerdict(a, b);
    const result = validateVerdict(verdict);
    assert.ok(result.ok, JSON.stringify(result.errors));
  }
});
