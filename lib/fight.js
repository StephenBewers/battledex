// handleFight(request): the whole of POST /api/fight, independent of any server.
//
//   request  { method, body, ip }   body is the parsed JSON (or anything, if bad);
//                                   ip is the caller's address, for rate limiting
//   returns  { status, headers, body }
//
// api/fight.js adapts this to Vercel, and scripts/dev-server.js to plain Node,
// so the same code runs in both places.
//
// Success: 200 { verdict, art: { a, b }, artStatus: { a, b } }. Each art value
// is a data URI, or null (the client then shows the placeholder). artStatus says
// why: "generated", "not_requested", "moderation_blocked" (the image safety
// system blocked the fighter) or "failed" (any other error). The verdict is
// required.
// Failure: { error: { code, message } } with 400 (bad input), 405, 429 (rate
// limited, with a Retry-After header), 502 (the judge failed) or 503 (the rate
// limiter itself failed; fails closed so the API budget stays protected). Messages are fixed text; model output and provider errors
// never reach the response.

const { checkFighters } = require("./verdict");
const { InvalidFighterError } = require("./sanitize");
const { getDefaultLimiter } = require("./rate-limit");
const { normalizeName } = require("../validation");

function reply(status, body, headers = {}) {
  return { status, headers: { "Cache-Control": "no-store", ...headers }, body };
}

function fail(status, code, message, headers) {
  return reply(status, { error: { code, message } }, headers);
}

// The request body must be an object with two string names and two booleans.
function parseBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { fighterA, fighterB, needArtA, needArtB } = body;
  if (typeof fighterA !== "string" || typeof fighterB !== "string") return null;
  if (typeof needArtA !== "boolean" || typeof needArtB !== "boolean") return null;
  return { fighterA, fighterB, needArtA, needArtB };
}

// `deps` lets tests inject fakes. In production they default to the real modules.
async function handleFight(request, deps = {}) {
  if (request.method !== "POST") {
    return fail(405, "method_not_allowed", "Use POST.", { Allow: "POST" });
  }

  const input = parseBody(request.body);
  if (!input) {
    return fail(400, "invalid_request", "Send both fighter names and whether each needs art.");
  }

  let fighters;
  try {
    fighters = checkFighters(input.fighterA, input.fighterB);
  } catch (error) {
    if (error instanceof InvalidFighterError) {
      return fail(400, "invalid_fighters", error.message);
    }
    throw error;
  }

  // Only valid fights count against the limit, and the check happens before
  // any model call is made.
  const limiter = deps.rateLimiter || getDefaultLimiter();
  let limit;
  try {
    limit = await limiter.check(`fight:${request.ip || "unknown"}`);
  } catch (error) {
    console.error("fight: rate limiter failed", error && error.name);
    return fail(503, "rate_limiter_unavailable", "Please try again in a moment.", { "Retry-After": "5" });
  }
  if (!limit.allowed) {
    const seconds = limit.retryAfterSeconds;
    return reply(
      429,
      {
        error: { code: "rate_limited", message: "Too many fights! Wait a moment and try again." },
        retryAfter: seconds,
      },
      { "Retry-After": String(seconds) }
    );
  }

  // Required here, not at the top, so tests can inject fakes without API keys.
  const getVerdict = deps.getVerdict || require("./verdict").getVerdict;
  const getArt = deps.getArt || require("./art").getArt;

  // A mirror match is one fighter, so it gets one image: generate it once and
  // share the result between both sides.
  const isMirror = normalizeName(fighters.a) === normalizeName(fighters.b);
  const none = Promise.resolve(null);
  const artForA = input.needArtA ? getArt(fighters.a) : none;
  const artForB = input.needArtB ? (isMirror && input.needArtA ? artForA : getArt(fighters.b)) : none;

  // Verdict and any needed art run in parallel.
  const [verdictResult, artAResult, artBResult] = await Promise.allSettled([
    getVerdict(fighters.a, fighters.b),
    artForA,
    artForB,
  ]);

  if (verdictResult.status !== "fulfilled") {
    const code = (verdictResult.reason && verdictResult.reason.code) || "unknown";
    console.error(`fight: verdict failed (${code})`);
    return fail(502, "verdict_failed", "The judges couldn't reach a verdict.");
  }

  const art = {};
  const artStatus = {};
  for (const [key, needed, result] of [
    ["a", input.needArtA, artAResult],
    ["b", input.needArtB, artBResult],
  ]) {
    if (result.status === "fulfilled") {
      art[key] = result.value;
      artStatus[key] = needed ? "generated" : "not_requested";
    } else {
      const code = (result.reason && result.reason.code) || "unknown";
      console.error(`fight: art ${key} failed (${code})`);
      art[key] = null;
      artStatus[key] = code === "moderation_blocked" ? "moderation_blocked" : "failed";
    }
  }

  return reply(200, { verdict: verdictResult.value, art, artStatus });
}

module.exports = { handleFight };
