// Pure helpers for fighter names. No DOM access, so they can be tested in Node.

// Trim and collapse runs of whitespace. Keeps the user's casing for display.
function cleanName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

// Identity key for a fighter: lowercase, trimmed, whitespace collapsed.
// Exact match only, so "Goku" and "Son Goku" are different fighters.
function normalizeName(value) {
  return cleanName(value).toLowerCase();
}

// Validate the two fighter inputs.
// Returns { valid, errors, fighters }. `errors` has optional `a` and `b` entries,
// each { type, message }. `fighters` holds the cleaned names and ids when valid.
function validateFighters(rawA, rawB) {
  const nameA = cleanName(rawA);
  const nameB = cleanName(rawB);
  const errors = {};

  if (!nameA) {
    errors.a = { type: "required", message: "Enter a name for Player 1." };
  }
  if (!nameB) {
    errors.b = { type: "required", message: "Enter a name for Player 2." };
  }

  // Mirror matches (the same fighter on both sides) are allowed on purpose.

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
  module.exports = { cleanName, normalizeName, validateFighters };
}
