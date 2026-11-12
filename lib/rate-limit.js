// Rate limiting: 3 fights per minute per IP.
//
// The limiter sits in front of POST /api/fight, so a fight counts as ONE request
// however many model calls it makes (1 verdict plus up to 2 art).
//
// It is a fixed-window counter behind a tiny store interface:
//
//   store.increment(key, windowMs) -> Promise<{ count, resetMs }>
//     Adds 1 to the key's count for the current window (starting a new window
//     if there is none) and returns the new count and the ms until it resets.
//
// MemoryStore is for local development. Counters in memory are per process, so
// they do not work across serverless instances. RedisStore (Upstash, over its
// REST API) is shared by every instance and is used whenever its environment
// variables are set. On Vercel with no Redis configured, the limiter refuses
// to run (the endpoint answers 503) rather than quietly using per-instance counts.
//
// Fixed windows allow a short burst across a window boundary (up to 2x the
// limit within a minute). That is fine for protecting a hobby budget.

const FIGHTS_PER_WINDOW = 3;
const WINDOW_MS = 60_000;

class MemoryStore {
  constructor({ now = Date.now, maxKeys = 10_000 } = {}) {
    this.now = now;
    this.maxKeys = maxKeys;
    this.entries = new Map(); // key -> { count, resetAt }
  }

  async increment(key, windowMs) {
    const now = this.now();
    let entry = this.entries.get(key);

    if (!entry || entry.resetAt <= now) {
      if (this.entries.size >= this.maxKeys) this.sweep(now);
      entry = { count: 0, resetAt: now + windowMs };
      this.entries.set(key, entry);
    }

    entry.count += 1;
    return { count: entry.count, resetMs: entry.resetAt - now };
  }

  // Drop expired windows so the map can't grow forever.
  sweep(now) {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }
}

// Shared counters in Redis. INCR, PEXPIRE ... NX (only sets a TTL when the key
// has none) and PTTL run as one atomic transaction, so a crash can never leave
// a counter without an expiry (which would block that IP forever).
class RedisStore {
  constructor(redis) {
    this.redis = redis;
  }

  async increment(key, windowMs) {
    const [count, , ttl] = await this.redis
      .multi()
      .incr(key)
      .pexpire(key, windowMs, "NX")
      .pttl(key)
      .exec();
    return { count, resetMs: ttl > 0 ? ttl : windowMs };
  }
}

// Vercel's Upstash integration sets KV_REST_API_*; Upstash's own docs use UPSTASH_REDIS_REST_*.
function createStoreFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url && token) {
    const { Redis } = require("@upstash/redis");
    return new RedisStore(new Redis({ url, token }));
  }
  if (env.VERCEL) {
    throw new Error("Rate limit store is not configured (set the Upstash Redis environment variables).");
  }
  return new MemoryStore();
}

function createRateLimiter({ store, limit = FIGHTS_PER_WINDOW, windowMs = WINDOW_MS } = {}) {
  let resolvedStore = store;
  return {
    limit,
    windowMs,
    // Counts this request against `key`. Returns { allowed, retryAfterSeconds }.
    async check(key) {
      // Created on first use so a misconfigured deploy fails the request (503), not the module load.
      if (!resolvedStore) resolvedStore = createStoreFromEnv();
      const { count, resetMs } = await resolvedStore.increment(key, windowMs);
      return {
        allowed: count <= limit,
        retryAfterSeconds: Math.max(1, Math.ceil(resetMs / 1000)),
      };
    },
  };
}

// One shared limiter for the process.
let defaultLimiter = null;
function getDefaultLimiter() {
  if (!defaultLimiter) defaultLimiter = createRateLimiter();
  return defaultLimiter;
}

module.exports = { FIGHTS_PER_WINDOW, WINDOW_MS, MemoryStore, RedisStore, createStoreFromEnv, createRateLimiter, getDefaultLimiter };
