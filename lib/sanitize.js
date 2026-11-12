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

const MAX_NAME_LENGTH = 60; // matches the maxlength on the frontend inputs

const CONTROL_CHARS = /[\p{Cc}\p{Zl}\p{Zp}]/gu;
const INVISIBLE_CHARS = /(?!‍)\p{Cf}/gu;

function sanitizeName(value) {
  if (typeof value !== "string") return "";

  const cleaned = value
    .normalize("NFC")
    .replace(CONTROL_CHARS, " ")
    .replace(INVISIBLE_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();

  return Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join("").trimEnd();
}

// Thrown by the prompt builders when a name is empty after sanitizing.
class InvalidFighterError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidFighterError";
  }
}

module.exports = { MAX_NAME_LENGTH, sanitizeName, InvalidFighterError };
