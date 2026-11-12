// All user-facing copy lives here, in one voice: a playful arena announcer.
// Punchy and fun, but every message says what happened and what to do next,
// with no blame, jargon or status codes.
//
// Pure data and pure functions (no DOM), so they can be tested in Node. The
// browser loads this before the other scripts.

const MESSAGES = {
  // Shown one at a time, in a shuffled order, while a fight loads.
  loading: [
    "The judges are sharpening their pencils...",
    "The fighters are stretching. Mostly the arms.",
    "The crowd is going absolutely wild...",
    "Polishing the championship bell...",
    "Consulting the sacred rulebook...",
    "Warming up the special moves...",
    "Counting every last hit point...",
    "The referee is checking the ropes...",
    "Feeding the arcade cabinet imaginary coins...",
    "The announcer is clearing their throat...",
    "Arguing with the scoreboard...",
    "Cueing the dramatic slow-motion replay...",
  ],
  loadingIntervalMs: 2800,

  // One message per field when a fighter name is missing.
  missingFighter: {
    a: "Player 1 is still in the locker room! Enter a fighter to step into the ring.",
    b: "Player 2 is a no-show! Enter a fighter to step into the ring.",
  },

  // Fight failures. The seconds (when known) come from the server's Retry-After.
  rateLimit(seconds) {
    const wait = Number.isFinite(seconds) && seconds > 0 ? ` Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.` : " Give it a moment and try again.";
    return `Easy, champ! The arena needs a breather between bouts.${wait}`;
  },
  judgeTimeout: "The judges are still arguing and the bell has rung! Press Fight to send them back in.",
  judgeFailed: "The judges fumbled the scorecards! Press Fight to run the bout again.",
  networkLost: "The arena lost its connection! Check your internet, then press Fight to try again.",
  generic: "Something went sideways in the arena! Press Fight to try again.",

  // Portrait notes, shown on the result card next to the placeholder sprite.
  moderationBlock(names) {
    const one = uniqueNames(names).length === 1;
    return `The art inspectors wouldn't let ${joinNames(names)} through, so ${one ? "a placeholder is standing in for the portrait" : "placeholders are standing in for the portraits"}.`;
  },
  imageFailed(names) {
    const one = uniqueNames(names).length === 1;
    return `The portrait artist dropped the pencil for ${joinNames(names)}, so ${one ? "a placeholder is" : "placeholders are"} standing in.`;
  },

  // Saving to the BattleDex.
  save: {
    quota: "The BattleDex is packed! Open it and remove a fighter to make room.",
    unavailable: "Your browser is blocking storage, so this fighter can't join the BattleDex.",
    invalid: "The BattleDex bouncer turned this fighter away. Try again.",
    tooLarge: "Too much detail to squeeze into the BattleDex! Fight again to get a fresh portrait.",
    prepareFailed: "Couldn't get this portrait ready for the BattleDex. Give it another try.",
    noPortrait: "No portrait to save for this one.",
    saved: (name) => `${name} is in the BattleDex!`,
  },

  // The BattleDex view.
  dex: {
    blocked: "Your browser is blocking storage, so the BattleDex can't open its doors.",
    empty: "No fighters yet! Win a battle, then save your fighters to fill the BattleDex.",
    confirmRemove: (name) => `Press Confirm to send ${name} packing.`,
    removeFailed: "The BattleDex wouldn't let go of that fighter! Your browser is blocking storage.",
    removed: (name) => `${name} has left the BattleDex.`,
  },
};

// Drops repeats, comparing the way fighter identity works (case, spacing). A
// mirror match has one fighter on both sides, so it should be named once.
function uniqueNames(names) {
  const seen = new Set();
  return names.filter((name) => {
    const id = name.trim().replace(/\s+/g, " ").toLowerCase();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// "A", "A and B", or "A, B and C", each fighter once.
function joinNames(names) {
  const unique = uniqueNames(names);
  if (unique.length <= 1) return unique.join("");
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

// Picks the message for a failed fight request.
//   429                  rate limited (reason.retryAfter is seconds)
//   TimeoutError / 504   the judges took too long
//   502                  the judge call failed
//   NetworkError         the browser couldn't reach the server
//   anything else        generic fallback
function fightFailureMessage(reason) {
  if (reason) {
    if (reason.status === 429) return MESSAGES.rateLimit(reason.retryAfter);
    if (reason.name === "TimeoutError" || reason.status === 504 || reason.status === 408) return MESSAGES.judgeTimeout;
    if (reason.status === 502) return MESSAGES.judgeFailed;
    if (reason.name === "NetworkError") return MESSAGES.networkLost;
  }
  return MESSAGES.generic;
}

// The note under the card about portraits that couldn't be made, or "" when
// every portrait is fine. `fighters` is { a, b } and `artStatus` is { a, b }
// from the server ("moderation_blocked" and "failed" are the ones that matter).
function artNoteMessage(fighters, artStatus) {
  const namesWith = (status) => ["a", "b"].filter((key) => artStatus && artStatus[key] === status).map((key) => fighters[key].name);
  const blocked = namesWith("moderation_blocked");
  const failed = namesWith("failed");

  const notes = [];
  if (blocked.length) notes.push(MESSAGES.moderationBlock(blocked));
  if (failed.length) notes.push(MESSAGES.imageFailed(failed));
  return notes.join(" ");
}

// A shuffled copy (Fisher-Yates), so each fight shows the phrases in a new order.
function shuffled(list, random = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { MESSAGES, joinNames, uniqueNames, fightFailureMessage, artNoteMessage, shuffled };
}
