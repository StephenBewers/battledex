// Cleans a fighter name before it goes anywhere near a model.
// Used by the judge message builder and the art prompt builder.
//
// What it does:
//   - non-strings become ""
//   - control characters (including newlines and tabs) become spaces
//   - invisible formatting characters (zero-width, bidi overrides, BOM) are removed;
//     the zero-width joiner stays so joined emoji like family emoji survive
//   - whitespace is collapsed and trimmed
//   - the length is capped (by characters, never splitting a character in half)
//
// It deliberately does NOT remove "<", ">" or quotes: those are legitimate in
// names ("AT&T", "<3"). The builders escape or quote them where they are used.

const { MAX_FIGHTER_NAME_LENGTH } = require("../validation");

// The same limit the browser enforces. The server rejects longer names
// (checkNameLength below); sanitizeName still cuts at this length as a backstop,
// so nothing longer can ever reach a model.
const MAX_NAME_LENGTH = MAX_FIGHTER_NAME_LENGTH;

const CONTROL_CHARS = /[\p{Cc}\p{Zl}\p{Zp}]/gu;
const INVISIBLE_CHARS = /(?!‍)\p{Cf}/gu;

// The cleaning steps, without the length cap.
function cleanForModel(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(CONTROL_CHARS, " ")
    .replace(INVISIBLE_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeName(value) {
  return Array.from(cleanForModel(value)).slice(0, MAX_NAME_LENGTH).join("").trimEnd();
}

// How long the name is once cleaned, before any cap. Used to reject names that
// are over the limit instead of silently cutting them. Never longer than the
// browser's count (cleaning only removes or merges characters).
function cleanedLength(value) {
  return Array.from(cleanForModel(value)).length;
}

// Thrown when a fighter name is not acceptable. `code` is "invalid_fighters"
// (a missing name) or "name_too_long".
class InvalidFighterError extends Error {
  constructor(message, code = "invalid_fighters") {
    super(message);
    this.name = "InvalidFighterError";
    this.code = code;
  }
}

module.exports = { MAX_NAME_LENGTH, sanitizeName, cleanedLength, InvalidFighterError };
