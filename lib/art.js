// getArt(name): generates the fighter's portrait and returns it as a data URI.
//
// Internal module. A data URI (not a URL) is returned so the browser can
// downsize it on a canvas without the canvas being tainted.
//
// Errors are ArtError with a `code`:
//   "moderation_blocked"  the image safety system blocked this fighter
//   "art_error"           anything else (network, auth, timeout, empty response...)
// Error messages never contain provider details.

const OpenAI = require("openai");

const { buildArtPrompt } = require("./art-prompt");

const DEFAULT_MODEL = "gpt-image-2";
const REQUEST_TIMEOUT_MS = 50_000; // the browser gives up on a fight at 60s
const OUTPUT_FORMAT = "webp";

class ArtError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ArtError";
    this.code = code;
  }
}

let sharedClient = null;
function getClient() {
  if (!sharedClient) {
    sharedClient = new OpenAI({ timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 }); // reads OPENAI_API_KEY
  }
  return sharedClient;
}

function isModerationBlock(error) {
  const text = [error && error.code, error && error.type, error && error.message]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /content_policy|moderation|safety system|safety_violation/.test(text);
}

// `options.client` and `options.model` exist so tests can inject a fake client.
async function getArt(name, options = {}) {
  // Throws InvalidFighterError for an empty name.
  const prompt = buildArtPrompt(name);
  const client = options.client || getClient();
  const model = options.model || process.env.IMAGE_MODEL || DEFAULT_MODEL;

  let response;
  try {
    response = await client.images.generate({
      model,
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "low", // the browser stores a 256px thumbnail, so high quality is wasted
      output_format: OUTPUT_FORMAT,
      output_compression: 60, // keeps each response well under Vercel's 4.5MB limit
    });
  } catch (error) {
    if (isModerationBlock(error)) {
      throw new ArtError("moderation_blocked", "The image safety system blocked this fighter.");
    }
    throw new ArtError("art_error", "The art could not be generated.");
  }

  const b64 = response && response.data && response.data[0] && response.data[0].b64_json;
  if (typeof b64 !== "string" || b64.length === 0) {
    throw new ArtError("art_error", "The art could not be generated.");
  }
  return `data:image/${OUTPUT_FORMAT};base64,${b64}`;
}

module.exports = { getArt, ArtError, DEFAULT_MODEL };
