// Pure helpers for fighter names. No DOM access, so they can be tested in Node.

// The longest a fighter name can be, counted in characters after trimming and
// collapsing whitespace (so an emoji counts once). The server enforces the same
// limit, and rejects longer names instead of cutting them off: cutting would
// change the fighter's identity (its normalized name) and the two sides would
// disagree about who is in the BattleDex.
const MAX_FIGHTER_NAME_LENGTH = 50;

// Trim and collapse runs of whitespace. Keeps the user's casing for display.
function cleanName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

// Identity key for a fighter: lowercase, trimmed, whitespace collapsed.
// Exact match only, so "Goku" and "Son Goku" are different fighters.
function normalizeName(value) {
  return cleanName(value).toLowerCase();
}

// How many characters a name has, counting each character once (Array.from
// walks by character, not by UTF-16 unit, so an emoji is 1, not 2).
function nameLength(value) {
  return Array.from(cleanName(value)).length;
}

// The "name too long" error for one field, or null if the name fits.
function checkNameLength(value) {
  if (nameLength(value) <= MAX_FIGHTER_NAME_LENGTH) return null;
  return { type: "too_long", message: copy().nameTooLong };
}

// Validate the two fighter inputs.
// Returns { valid, errors, fighters }. `errors` has optional `a` and `b` entries,
// each { type, message }. `fighters` holds the cleaned names and ids when valid.
// The copy lives in messages.js: a global in the browser, a require in Node.
function copy() {
  return typeof MESSAGES !== "undefined" ? MESSAGES : require("./messages").MESSAGES;
}

function validateFighters(rawA, rawB) {
  const nameA = cleanName(rawA);
  const nameB = cleanName(rawB);
  const errors = {};

  // Each name is required and must fit the length limit. Mirror matches (the
  // same fighter on both sides) are allowed on purpose.
  for (const [key, name] of [["a", nameA], ["b", nameB]]) {
    if (!name) {
      errors[key] = { type: "required", message: copy().missingFighter[key] };
    } else {
      const tooLong = checkNameLength(name);
      if (tooLong) errors[key] = tooLong;
    }
  }

  const valid = Object.keys(errors).length === 0;
  return {
    valid,
    errors,
    fighters: valid
      ? {
          a: { id: normalizeName(nameA), name: nameA },
          b: { id: normalizeName(nameB), name: nameB },
        }
      : null,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { MAX_FIGHTER_NAME_LENGTH, cleanName, normalizeName, nameLength, checkNameLength, validateFighters };
}
