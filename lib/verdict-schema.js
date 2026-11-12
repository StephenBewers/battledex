// The verdict shape, as zod schemas, plus validateVerdict().
//
// Two schemas:
//   verdictModelSchema  simple shape, for asking the model for structured output
//                       (structured-output features can't express refinements).
//   verdictSchema       the strict schema every verdict must pass before it is
//                       trusted: exact keys, ranges, the energy rules, and
//                       2-4 sentences of plain-text reasoning.

const { z } = require("zod");

const MAX_REASONING_LENGTH = 700; // backstop; 4 sentences is normally far shorter
const MIN_SENTENCES = 2;
const MAX_SENTENCES = 4;

const verdictModelSchema = z.object({
  winner: z.enum(["A", "B"]).describe("Which fighter wins: A or B. Always exactly one."),
  reasoning: z
    .string()
    .describe("2 to 4 playful sentences that logically justify the winner. Plain text."),
  energyA: z
    .number()
    .int()
    .describe("Fighter A's remaining energy percent (0-100). 0 if A lost."),
  energyB: z
    .number()
    .int()
    .describe("Fighter B's remaining energy percent (0-100). 0 if B lost."),
});

// Abbreviations that end in a period without ending a sentence.
const ABBREVIATIONS = new Set(["mr", "mrs", "ms", "dr", "st", "jr", "sr", "vs", "mt", "prof"]);

// Counts sentences. A sentence ends at a token ending in . ! or ? (optionally
// followed by closing quotes or brackets) when it is the last token or the next
// one starts a new sentence, ignoring abbreviations and initials like "J.".
function countSentences(text) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;

  let count = 0;
  let open = false; // words seen since the last sentence end

  tokens.forEach((token, i) => {
    open = true;
    const endsSentence = /[.!?]+["')\]]*$/.test(token);
    if (!endsSentence) return;

    const word = token.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
    const isAbbreviation = ABBREVIATIONS.has(word) || (/^\p{L}$/u.test(word) && /\.$/.test(token));
    const next = tokens[i + 1];
    const startsNew = next === undefined || /^["'(\[]?[\p{Lu}\p{N}]/u.test(next);

    if (!isAbbreviation && startsNew) {
      count += 1;
      open = false;
    }
  });

  return open ? count + 1 : count;
}

// Reasons the text is not plain text. Empty array means it is fine.
function plainTextProblems(text) {
  const problems = [];
  if (/[\p{Cc}\p{Zl}\p{Zp}]/u.test(text)) problems.push("contains line breaks or control characters");
  if (/[<>]/.test(text)) problems.push("contains angle brackets");
  if (/[`*]/.test(text) || /__/.test(text)) problems.push("contains markdown formatting");
  if (/\]\(/.test(text)) problems.push("contains a markdown link");
  if (/^\s*([#>\-•]|\d+[.)])\s/.test(text)) problems.push("starts like a heading or list");
  return problems;
}

const verdictSchema = z
  .strictObject({
    winner: z.enum(["A", "B"]),
    reasoning: z
      .string()
      .min(1, "reasoning is empty")
      .max(MAX_REASONING_LENGTH, "reasoning is too long")
      .superRefine((text, ctx) => {
        for (const problem of plainTextProblems(text)) {
          ctx.addIssue({ code: "custom", message: `reasoning ${problem}` });
        }
        const sentences = countSentences(text);
        if (sentences < MIN_SENTENCES || sentences > MAX_SENTENCES) {
          ctx.addIssue({
            code: "custom",
            message: `reasoning must be ${MIN_SENTENCES}-${MAX_SENTENCES} sentences`,
          });
        }
      }),
    energyA: z.number().int("energyA must be a whole number").min(0).max(100),
    energyB: z.number().int("energyB must be a whole number").min(0).max(100),
  })
  .superRefine((verdict, ctx) => {
    const winnerEnergy = verdict.winner === "A" ? verdict.energyA : verdict.energyB;
    const loserEnergy = verdict.winner === "A" ? verdict.energyB : verdict.energyA;
    const loserKey = verdict.winner === "A" ? "energyB" : "energyA";
    const winnerKey = verdict.winner === "A" ? "energyA" : "energyB";

    if (loserEnergy !== 0) {
      ctx.addIssue({ code: "custom", path: [loserKey], message: "the loser must finish with 0 energy" });
    }
    if (winnerEnergy < 1) {
      ctx.addIssue({ code: "custom", path: [winnerKey], message: "the winner must finish with 1-100 energy" });
    }
  });

// Accepts a parsed object or a raw string (which must be JSON and nothing else).
// Returns { ok: true, verdict } or { ok: false, errors: [string] }. The errors
// describe what is wrong and never echo the model's text back.
function validateVerdict(input) {
  let data = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input);
    } catch {
      return { ok: false, errors: ["output is not valid JSON"] };
    }
  }

  const result = verdictSchema.safeParse(data);
  if (result.success) return { ok: true, verdict: result.data };

  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    }),
  };
}

module.exports = {
  MAX_REASONING_LENGTH,
  verdictModelSchema,
  verdictSchema,
  validateVerdict,
  countSentences,
  plainTextProblems,
};
