// getVerdict(nameA, nameB): asks Claude who wins and returns a validated verdict.
//
// Internal module. The only public endpoint is api/fight.js.
//
// Flow: sanitize and check the names, send the stage 9 system prompt plus the
// escaped names, ask for structured output with the zod model schema, then run
// the result through the strict validateVerdict(). A response that fails
// validation is retried once. Errors never contain model text.

const Anthropic = require("@anthropic-ai/sdk");
const { zodOutputFormat } = require("@anthropic-ai/sdk/helpers/zod");

const { MAX_NAME_LENGTH, sanitizeName, cleanedLength, InvalidFighterError } = require("./sanitize");
const { SYSTEM_PROMPT, MAX_TOKENS, buildUserMessage } = require("./judge-prompt");
const { verdictModelSchema, validateVerdict } = require("./verdict-schema");

const DEFAULT_MODEL = "claude-sonnet-5-5";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 2; // one retry when the model's output fails validation

// Thrown for any model-side failure. `code` is one of:
//   "model_error"     the API call failed (network, auth, overloaded...)
//   "refused"         the model declined to answer
//   "invalid_output"  output failed validation twice
class VerdictError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "VerdictError";
    this.code = code;
  }
}

let sharedClient = null;
function getClient() {
  if (!sharedClient) {
    sharedClient = new Anthropic({ timeout: REQUEST_TIMEOUT_MS }); // reads ANTHROPIC_API_KEY
  }
  return sharedClient;
}

// Throws InvalidFighterError for empty names, and for names over the length
// limit (code "name_too_long"; they are rejected, never cut short). The same
// fighter on both sides (a mirror match) is allowed.
function checkFighters(nameA, nameB) {
  if (cleanedLength(nameA) > MAX_NAME_LENGTH || cleanedLength(nameB) > MAX_NAME_LENGTH) {
    throw new InvalidFighterError(`Fighter names can be at most ${MAX_NAME_LENGTH} characters.`, "name_too_long");
  }
  const a = sanitizeName(nameA);
  const b = sanitizeName(nameB);
  if (!a || !b) throw new InvalidFighterError("Both fighter names are required.");
  return { a, b };
}

// `options.client` and `options.model` exist so tests can inject a fake client.
async function getVerdict(nameA, nameB, options = {}) {
  const { a, b } = checkFighters(nameA, nameB);
  const client = options.client || getClient();
  const model = options.model || process.env.VERDICT_MODEL || DEFAULT_MODEL;
  const userMessage = buildUserMessage(a, b);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let message;
    try {
      message = await client.messages.parse({
        model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
        output_config: { format: zodOutputFormat(verdictModelSchema) },
      });
    } catch (error) {
      // The SDK already retries rate limits and server errors. An output the
      // SDK could not parse counts as bad output, anything else as a failed call.
      if (error && /pars|JSON|schema/i.test(String(error.name) + String(error.message)) && !error.status) {
        if (attempt < MAX_ATTEMPTS) continue;
        throw new VerdictError("invalid_output", "The judge gave an unusable verdict.");
      }
      throw new VerdictError("model_error", "The judge could not be reached.");
    }

    if (message.stop_reason === "refusal") {
      throw new VerdictError("refused", "The judge declined to rule on this fight.");
    }

    const result = validateVerdict(message.parsed_output);
    if (result.ok) return result.verdict;
    if (attempt === MAX_ATTEMPTS) {
      throw new VerdictError("invalid_output", "The judge gave an unusable verdict.");
    }
  }
}

module.exports = { getVerdict, checkFighters, VerdictError, DEFAULT_MODEL };
