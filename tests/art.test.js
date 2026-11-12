// Tests getArt() with a fake OpenAI client. No network, no API key.
const test = require("node:test");
const assert = require("node:assert");
const { getArt, ArtError } = require("../lib/art");
const { InvalidFighterError } = require("../lib/sanitize");
const { STYLE_PROMPT } = require("../lib/art-prompt");

function fakeClient(result) {
  const calls = [];
  return {
    calls,
    images: {
      async generate(params) {
        calls.push(params);
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
}

test("returns a data URI and sends the fixed style prompt", async () => {
  const client = fakeClient({ data: [{ b64_json: "QUJD" }] });
  const uri = await getArt("Goku", { client });
  assert.strictEqual(uri, "data:image/webp;base64,QUJD");
  const [params] = client.calls;
  assert.ok(params.prompt.startsWith(STYLE_PROMPT));
  assert.ok(params.prompt.endsWith('Name: "Goku"'));
  assert.strictEqual(params.n, 1);
});

test("an empty name throws InvalidFighterError and makes no call", async () => {
  const client = fakeClient({ data: [{ b64_json: "QUJD" }] });
  await assert.rejects(getArt("  ", { client }), InvalidFighterError);
  assert.strictEqual(client.calls.length, 0);
});

test("safety blocks become their own moderation_blocked error", async () => {
  for (const error of [
    Object.assign(new Error("Your request was rejected by the safety system."), { status: 400 }),
    Object.assign(new Error("blocked"), { code: "content_policy_violation" }),
    Object.assign(new Error("blocked"), { code: "moderation_blocked" }),
  ]) {
    await assert.rejects(getArt("x", { client: fakeClient(error) }), (e) => e instanceof ArtError && e.code === "moderation_blocked");
  }
});

test("other failures become art_error and do not leak details", async () => {
  const secret = "sk-SECRET-KEY";
  const client = fakeClient(Object.assign(new Error(`401 bad key ${secret}`), { status: 401 }));
  await assert.rejects(getArt("x", { client }), (e) => {
    assert.ok(e instanceof ArtError && e.code === "art_error");
    assert.ok(!e.message.includes(secret));
    return true;
  });
});

test("an empty or malformed response is an art_error", async () => {
  for (const result of [{}, { data: [] }, { data: [{}] }, { data: [{ b64_json: "" }] }, null]) {
    await assert.rejects(getArt("x", { client: fakeClient(result) }), (e) => e instanceof ArtError && e.code === "art_error");
  }
});
