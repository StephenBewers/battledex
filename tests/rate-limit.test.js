const test = require("node:test");
const assert = require("node:assert");
const { MemoryStore, createRateLimiter, FIGHTS_PER_WINDOW, WINDOW_MS } = require("../lib/rate-limit");
const { getClientIp } = require("../lib/client-ip");

test("the default limit is 3 fights per minute", () => {
  assert.strictEqual(FIGHTS_PER_WINDOW, 3);
  assert.strictEqual(WINDOW_MS, 60_000);
  assert.strictEqual(createRateLimiter().limit, 3);
});

test("allows up to the limit, then blocks until the window ends", async () => {
  let now = 0;
  const limiter = createRateLimiter({ store: new MemoryStore({ now: () => now }), limit: 3, windowMs: 60_000 });

  for (let i = 0; i < 3; i++) assert.ok((await limiter.check("a")).allowed);
  now = 15_000;
  const blocked = await limiter.check("a");
  assert.ok(!blocked.allowed);
  assert.strictEqual(blocked.retryAfterSeconds, 45);

  now = 60_000; // window over
  assert.ok((await limiter.check("a")).allowed);
});

test("keys are independent", async () => {
  const limiter = createRateLimiter({ store: new MemoryStore(), limit: 1 });
  assert.ok((await limiter.check("a")).allowed);
  assert.ok(!(await limiter.check("a")).allowed);
  assert.ok((await limiter.check("b")).allowed);
});

test("retryAfterSeconds is at least 1 and rounds up", async () => {
  let now = 0;
  const limiter = createRateLimiter({ store: new MemoryStore({ now: () => now }), limit: 1, windowMs: 60_000 });
  await limiter.check("a");
  now = 59_999;
  assert.strictEqual((await limiter.check("a")).retryAfterSeconds, 1);
});

test("the memory store sweeps expired windows when full", async () => {
  let now = 0;
  const store = new MemoryStore({ now: () => now, maxKeys: 5 });
  for (let i = 0; i < 5; i++) await store.increment(`k${i}`, 1000);
  now = 5000;
  await store.increment("fresh", 1000);
  assert.strictEqual(store.entries.size, 1);
});

test("works with any store that has increment()", async () => {
  const counts = {};
  const store = { increment: async (key) => ({ count: (counts[key] = (counts[key] || 0) + 1), resetMs: 30_000 }) };
  const limiter = createRateLimiter({ store, limit: 2 });
  assert.ok((await limiter.check("x")).allowed);
  assert.ok((await limiter.check("x")).allowed);
  assert.ok(!(await limiter.check("x")).allowed);
});

test("client IP: socket address off Vercel, ignoring forwarding headers", () => {
  const headers = { "x-forwarded-for": "6.6.6.6", "x-real-ip": "7.7.7.7" };
  assert.strictEqual(getClientIp(headers, "10.0.0.5", { onVercel: false }), "10.0.0.5");
  assert.strictEqual(getClientIp({}, "::ffff:127.0.0.1", { onVercel: false }), "127.0.0.1");
});

test("client IP: Vercel headers are used on Vercel, in order of trust", () => {
  const on = { onVercel: true };
  assert.strictEqual(getClientIp({ "x-vercel-forwarded-for": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }, "10.0.0.1", on), "1.2.3.4");
  assert.strictEqual(getClientIp({ "x-real-ip": "5.6.7.8" }, "10.0.0.1", on), "5.6.7.8");
  assert.strictEqual(getClientIp({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }, "10.0.0.1", on), "1.1.1.1");
  assert.strictEqual(getClientIp({}, "10.0.0.1", on), "10.0.0.1");
});

test("client IP: missing or junk values become 'unknown'", () => {
  assert.strictEqual(getClientIp({}, "", { onVercel: false }), "unknown");
  assert.strictEqual(getClientIp(undefined, undefined, { onVercel: false }), "unknown");
  assert.strictEqual(getClientIp({}, "x".repeat(100), { onVercel: false }), "unknown");
});

// --- Redis store (stage 19) ---
const { RedisStore, createStoreFromEnv, MemoryStore: MemStore } = require("../lib/rate-limit");

test("RedisStore runs INCR, PEXPIRE NX and PTTL in one transaction", async () => {
  const calls = [];
  const chain = {
    incr: (k) => (calls.push(["incr", k]), chain),
    pexpire: (k, ms, mode) => (calls.push(["pexpire", k, ms, mode]), chain),
    pttl: (k) => (calls.push(["pttl", k]), chain),
    exec: async () => [2, 0, 41_000],
  };
  const store = new RedisStore({ multi: () => chain });
  assert.deepEqual(await store.increment("fight:1.2.3.4", 60_000), { count: 2, resetMs: 41_000 });
  assert.deepEqual(calls, [["incr", "fight:1.2.3.4"], ["pexpire", "fight:1.2.3.4", 60_000, "NX"], ["pttl", "fight:1.2.3.4"]]);
});

test("RedisStore falls back to the full window if the TTL is missing", async () => {
  const chain = { incr: () => chain, pexpire: () => chain, pttl: () => chain, exec: async () => [1, 1, -1] };
  assert.equal((await new RedisStore({ multi: () => chain }).increment("k", 60_000)).resetMs, 60_000);
});

test("createStoreFromEnv: memory locally, Redis when configured, an error on Vercel without Redis", () => {
  assert.ok(createStoreFromEnv({}) instanceof MemStore);
  assert.ok(createStoreFromEnv({ KV_REST_API_URL: "https://x.upstash.io", KV_REST_API_TOKEN: "t" }) instanceof RedisStore);
  assert.ok(createStoreFromEnv({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" }) instanceof RedisStore);
  assert.ok(createStoreFromEnv({ STORAGE_KV_REST_API_URL: "https://x.upstash.io", STORAGE_KV_REST_API_TOKEN: "t", STORAGE_KV_REST_API_READ_ONLY_TOKEN: "ro" }) instanceof RedisStore);
  assert.throws(() => createStoreFromEnv({ VERCEL: "1" }), /not configured/);
  // A read-only token alone is not enough to count requests.
  assert.throws(() => createStoreFromEnv({ VERCEL: "1", KV_REST_API_URL: "https://x", KV_REST_API_READ_ONLY_TOKEN: "ro" }), /not configured/);
});
