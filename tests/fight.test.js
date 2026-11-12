// Tests handleFight() (POST /api/fight) with fake verdict and art modules.
const test = require("node:test");
const assert = require("node:assert");
const { handleFight } = require("../lib/fight");
const { VerdictError } = require("../lib/verdict");
const { ArtError } = require("../lib/art");

const verdict = { winner: "A", reasoning: "Goku wins. Vegeta sulks.", energyA: 40, energyB: 0 };
const body = { fighterA: "Goku", fighterB: "Vegeta", needArtA: true, needArtB: true };
const { createRateLimiter, MemoryStore } = require("../lib/rate-limit");

// Tests get a roomy limiter of their own, so they never trip the real limit.
const roomy = () => createRateLimiter({ limit: 1000 });
const post = (b, deps) => handleFight({ method: "POST", body: b, ip: "1.1.1.1" }, { rateLimiter: roomy(), ...deps });

function fakes({ verdictImpl, artImpl } = {}) {
  const calls = { verdict: [], art: [] };
  return {
    calls,
    getVerdict: async (a, b) => {
      calls.verdict.push([a, b]);
      return verdictImpl ? verdictImpl(a, b) : verdict;
    },
    getArt: async (name) => {
      calls.art.push(name);
      return artImpl ? artImpl(name) : `data:image/webp;base64,${name}`;
    },
  };
}

test("returns the verdict and art for both fighters", async () => {
  const deps = fakes();
  const res = await post(body, deps);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, {
    verdict,
    art: { a: "data:image/webp;base64,Goku", b: "data:image/webp;base64,Vegeta" },
    artStatus: { a: "generated", b: "generated" },
  });
  assert.strictEqual(res.headers["Cache-Control"], "no-store");
});

test("only generates art for fighters that need it", async () => {
  const deps = fakes();
  const res = await post({ ...body, needArtA: false }, deps);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.art.a, null);
  assert.ok(res.body.art.b);
  assert.deepStrictEqual(res.body.artStatus, { a: "not_requested", b: "generated" });
  assert.deepStrictEqual(deps.calls.art, ["Vegeta"]);

  const none = fakes();
  const res2 = await post({ ...body, needArtA: false, needArtB: false }, none);
  assert.deepStrictEqual(res2.body.art, { a: null, b: null });
  assert.deepStrictEqual(res2.body.artStatus, { a: "not_requested", b: "not_requested" });
  assert.strictEqual(none.calls.art.length, 0);
});

test("failed or blocked art still returns the verdict, with null art and a distinct status", async () => {
  const deps = fakes({
    artImpl: (name) => {
      if (name === "Goku") throw new ArtError("moderation_blocked", "no");
      throw new Error("boom");
    },
  });
  const res = await post(body, deps);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, {
    verdict,
    art: { a: null, b: null },
    artStatus: { a: "moderation_blocked", b: "failed" },
  });
});

test("a generic ArtError is 'failed', not 'moderation_blocked'", async () => {
  const deps = fakes({ artImpl: () => { throw new ArtError("art_error", "x"); } });
  const res = await post(body, deps);
  assert.deepStrictEqual(res.body.artStatus, { a: "failed", b: "failed" });
});

test("a failed verdict is a 502 with a fixed message", async () => {
  const deps = fakes({ verdictImpl: () => { throw new VerdictError("model_error", "secret detail sk-123"); } });
  const res = await post(body, deps);
  assert.strictEqual(res.status, 502);
  assert.strictEqual(res.body.error.code, "verdict_failed");
  assert.ok(!JSON.stringify(res.body).includes("sk-123"));
  assert.strictEqual(res.body.verdict, undefined);
});

test("bad input is a 400 and makes no model calls", async () => {
  const cases = [
    undefined, null, "string", [], {},
    { ...body, fighterA: 5 },
    { ...body, fighterB: undefined },
    { ...body, needArtA: "yes" },
    { ...body, needArtB: undefined },
  ];
  for (const bad of cases) {
    const deps = fakes();
    const res = await post(bad, deps);
    assert.strictEqual(res.status, 400, JSON.stringify(bad));
    assert.strictEqual(res.body.error.code, "invalid_request");
    assert.strictEqual(deps.calls.verdict.length + deps.calls.art.length, 0);
  }
});

test("empty names are a 400 and make no model calls", async () => {
  for (const [a, b] of [["", "Vegeta"], ["Goku", "   "], ["", ""]]) {
    const deps = fakes();
    const res = await post({ ...body, fighterA: a, fighterB: b }, deps);
    assert.strictEqual(res.status, 400, `${a} / ${b}`);
    assert.strictEqual(res.body.error.code, "invalid_fighters");
    assert.strictEqual(deps.calls.verdict.length + deps.calls.art.length, 0);
  }
});

test("mirror matches are valid, and the art is generated only once and shared", async () => {
  for (const [a, b] of [["Goku", "Goku"], ["Goku", " goku "], ["GOKU", "goku"]]) {
    const deps = fakes();
    const res = await post({ ...body, fighterA: a, fighterB: b }, deps);
    assert.strictEqual(res.status, 200, `${a} / ${b}`);
    assert.strictEqual(deps.calls.verdict.length, 1);
    assert.strictEqual(deps.calls.art.length, 1, "one image for one fighter");
    assert.ok(res.body.art.a && res.body.art.a === res.body.art.b);
    assert.deepStrictEqual(res.body.artStatus, { a: "generated", b: "generated" });
  }
});

test("a mirror match with saved art makes no art call", async () => {
  const deps = fakes();
  const res = await post({ ...body, fighterB: "goku", fighterA: "Goku", needArtA: false, needArtB: false }, deps);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(deps.calls.art.length, 0);
  assert.deepStrictEqual(res.body.artStatus, { a: "not_requested", b: "not_requested" });
});

test("a failed art call in a mirror match fails for both sides, once", async () => {
  const deps = fakes({ artImpl: () => { throw new ArtError("art_error", "x"); } });
  const res = await post({ ...body, fighterA: "Goku", fighterB: "goku" }, deps);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(deps.calls.art.length, 1);
  assert.deepStrictEqual(res.body.art, { a: null, b: null });
  assert.deepStrictEqual(res.body.artStatus, { a: "failed", b: "failed" });
});

test("non-POST methods get a 405", async () => {
  for (const method of ["GET", "PUT", "DELETE", "OPTIONS"]) {
    const res = await handleFight({ method, body, ip: "1.1.1.1" }, { ...fakes(), rateLimiter: roomy() });
    assert.strictEqual(res.status, 405);
    assert.strictEqual(res.headers.Allow, "POST");
  }
});

test("models receive sanitized names", async () => {
  const deps = fakes();
  await post({ ...body, fighterA: "  Go\u0000ku \n", fighterB: "Vegeta" }, deps);
  assert.deepStrictEqual(deps.calls.verdict[0], ["Go ku", "Vegeta"]);
  assert.strictEqual(deps.calls.art[0], "Go ku");
});

test("verdict and art run in parallel", async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  let artStartedBeforeVerdictFinished = false;
  let verdictDone = false;
  const deps = {
    getVerdict: async () => { await gate; verdictDone = true; return verdict; },
    getArt: async () => { artStartedBeforeVerdictFinished = !verdictDone; return "data:image/webp;base64,x"; },
  };
  const pending = post(body, deps);
  await new Promise((r) => setTimeout(r, 10));
  release();
  await pending;
  assert.ok(artStartedBeforeVerdictFinished);
});

// ---- Rate limiting ----

test("the 4th fight in a minute from one IP is a 429 with Retry-After, and makes no model calls", async () => {
  let now = 1_000_000;
  const rateLimiter = createRateLimiter({ store: new MemoryStore({ now: () => now }) });
  const deps = { ...fakes(), rateLimiter };
  const fight = () => handleFight({ method: "POST", body, ip: "9.9.9.9" }, deps);

  for (let i = 0; i < 3; i++) assert.strictEqual((await fight()).status, 200, `fight ${i + 1}`);
  const callsBefore = deps.calls.verdict.length + deps.calls.art.length;

  now += 20_000; // 20s into the window
  const res = await fight();
  assert.strictEqual(res.status, 429);
  assert.strictEqual(res.body.error.code, "rate_limited");
  assert.strictEqual(res.headers["Retry-After"], "40");
  assert.strictEqual(res.body.retryAfter, 40);
  assert.strictEqual(deps.calls.verdict.length + deps.calls.art.length, callsBefore, "no model calls when limited");
});

test("a fight counts once whether it needs 0, 1 or 2 art calls", async () => {
  const rateLimiter = createRateLimiter({ store: new MemoryStore() });
  const deps = { ...fakes(), rateLimiter };
  const send = (needArtA, needArtB) =>
    handleFight({ method: "POST", body: { ...body, needArtA, needArtB }, ip: "9.9.9.9" }, deps);

  assert.strictEqual((await send(true, true)).status, 200); // 3 underlying calls
  assert.strictEqual((await send(false, false)).status, 200); // 1 underlying call
  assert.strictEqual((await send(true, false)).status, 200); // 2 underlying calls
  assert.strictEqual((await send(true, true)).status, 429);
});

test("each IP has its own limit", async () => {
  const rateLimiter = createRateLimiter({ store: new MemoryStore() });
  const deps = { ...fakes(), rateLimiter };
  const from = (ip) => handleFight({ method: "POST", body, ip }, deps);

  for (let i = 0; i < 3; i++) await from("1.1.1.1");
  assert.strictEqual((await from("1.1.1.1")).status, 429);
  assert.strictEqual((await from("2.2.2.2")).status, 200);
});

test("the limit resets after the window", async () => {
  let now = 0;
  const rateLimiter = createRateLimiter({ store: new MemoryStore({ now: () => now }) });
  const deps = { ...fakes(), rateLimiter };
  const fight = () => handleFight({ method: "POST", body, ip: "1.1.1.1" }, deps);

  for (let i = 0; i < 3; i++) await fight();
  assert.strictEqual((await fight()).status, 429);
  now += 60_001;
  assert.strictEqual((await fight()).status, 200);
});

test("invalid requests don't use up the limit", async () => {
  const rateLimiter = createRateLimiter({ store: new MemoryStore() });
  const deps = { ...fakes(), rateLimiter };
  for (let i = 0; i < 10; i++) {
    const res = await handleFight({ method: "POST", body: { ...body, fighterB: "" }, ip: "1.1.1.1" }, deps);
    assert.strictEqual(res.status, 400);
  }
  assert.strictEqual((await handleFight({ method: "POST", body, ip: "1.1.1.1" }, deps)).status, 200);
});

test("if the limiter breaks, the request is refused (fails closed) with no model calls", async () => {
  const deps = { ...fakes(), rateLimiter: { check: async () => { throw new Error("redis down"); } } };
  const res = await handleFight({ method: "POST", body, ip: "1.1.1.1" }, deps);
  assert.strictEqual(res.status, 503);
  assert.strictEqual(res.body.error.code, "rate_limiter_unavailable");
  assert.ok(!JSON.stringify(res.body).includes("redis"));
  assert.strictEqual(deps.calls.verdict.length + deps.calls.art.length, 0);
});
