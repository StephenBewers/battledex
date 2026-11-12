// Tests getVerdict() with a fake Anthropic client. No network, no API key.
const test = require("node:test");
const assert = require("node:assert");
const { getVerdict, VerdictError } = require("../lib/verdict");
const { InvalidFighterError } = require("../lib/sanitize");
const { SYSTEM_PROMPT, MAX_TOKENS } = require("../lib/judge-prompt");

const good = {
  winner: "B",
  reasoning: "Vegeta wins on sheer pride. Goku gets distracted by snacks.",
  energyA: 0,
  energyB: 44,
};

// A fake client that returns each queued response (or throws it, if an Error).
function fakeClient(...responses) {
  const calls = [];
  return {
    calls,
    messages: {
      async parse(params) {
        calls.push(params);
        const next = responses.shift();
        if (next instanceof Error) throw next;
        return next;
      },
    },
  };
}
const reply = (parsed_output, stop_reason = "end_turn") => ({ parsed_output, stop_reason });

test("returns a validated verdict and sends the judge prompt, message and cap", async () => {
  const client = fakeClient(reply(good));
  const verdict = await getVerdict("Goku", "Vegeta", { client });
  assert.deepStrictEqual(verdict, good);

  const [params] = client.calls;
  assert.strictEqual(params.system, SYSTEM_PROMPT);
  assert.strictEqual(params.max_tokens, MAX_TOKENS);
  assert.ok(params.messages[0].content.includes("<fighter_a>\nGoku\n</fighter_a>"));
  assert.ok(params.output_config.format);
});

test("bad input throws InvalidFighterError and makes no API call", async () => {
  const client = fakeClient(reply(good));
  for (const [a, b] of [["", "Vegeta"], ["Goku", "  "], [null, "x"]]) {
    await assert.rejects(getVerdict(a, b, { client }), InvalidFighterError);
  }
  assert.strictEqual(client.calls.length, 0);
});

test("names over 50 characters are rejected (not cut short), with their own code, and make no API call", async () => {
  const client = fakeClient(reply(good));
  for (const [a, b] of [["x".repeat(51), "Vegeta"], ["Goku", "y".repeat(200)], ["\u{1F600}".repeat(51), "Vegeta"]]) {
    await assert.rejects(getVerdict(a, b, { client }), (e) => e instanceof InvalidFighterError && e.code === "name_too_long");
  }
  assert.strictEqual(client.calls.length, 0);
});

test("a name of exactly 50 characters is fine", async () => {
  const client = fakeClient(reply(good));
  await getVerdict("x".repeat(50), "\u{1F600}".repeat(50), { client });
  assert.strictEqual(client.calls.length, 1);
});

test("a mirror match is allowed and tells the judge so", async () => {
  const client = fakeClient(reply({ ...good, winner: "A", energyA: 3, energyB: 0 }));
  const verdict = await getVerdict("Goku", " goku ", { client });
  assert.strictEqual(verdict.winner, "A");
  assert.ok(client.calls[0].messages[0].content.includes("mirror match"));
});

test("retries once when the output fails validation", async () => {
  const bad = { ...good, winner: "A" }; // loser B has energy
  const client = fakeClient(reply(bad), reply(good));
  assert.deepStrictEqual(await getVerdict("Goku", "Vegeta", { client }), good);
  assert.strictEqual(client.calls.length, 2);
});

test("gives up with invalid_output after two bad responses", async () => {
  const client = fakeClient(reply({ winner: "tie" }), reply(null));
  await assert.rejects(getVerdict("Goku", "Vegeta", { client }), (e) => e instanceof VerdictError && e.code === "invalid_output");
  assert.strictEqual(client.calls.length, 2);
});

test("a refusal is reported as refused, without retrying", async () => {
  const client = fakeClient(reply(null, "refusal"), reply(good));
  await assert.rejects(getVerdict("Goku", "Vegeta", { client }), (e) => e.code === "refused");
  assert.strictEqual(client.calls.length, 1);
});

test("API failures become model_error and do not leak details", async () => {
  const secret = "sk-ant-SECRET";
  const error = Object.assign(new Error(`401 invalid key ${secret}`), { status: 401 });
  const client = fakeClient(error);
  await assert.rejects(getVerdict("Goku", "Vegeta", { client }), (e) => {
    assert.ok(e instanceof VerdictError && e.code === "model_error");
    assert.ok(!e.message.includes(secret));
    return true;
  });
  assert.strictEqual(client.calls.length, 1);
});
