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
// they do not work across serverless instances: on deploy (stage 14) swap in a
// store backed by Redis (INCR plus a TTL maps straight onto this interface).
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

function createRateLimiter({ store = new MemoryStore(), limit = FIGHTS_PER_WINDOW, windowMs = WINDOW_MS } = {}) {
  return {
    limit,
    windowMs,
    // Counts this request against `key`. Returns { allowed, retryAfterSeconds }.
    async check(key) {
      const { count, resetMs } = await store.increment(key, windowMs);
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

module.exports = { FIGHTS_PER_WINDOW, WINDOW_MS, MemoryStore, createRateLimiter, getDefaultLimiter };
