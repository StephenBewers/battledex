# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Battleground: type two fighters, get an AI verdict on who'd win plus AI-generated pixel-art portraits. Vanilla HTML/CSS/JS frontend, Vercel serverless functions, Claude for the verdict, OpenAI images for art, localStorage for the BattleDex. `project-brief.md` holds the product decisions and `project-build.md` the staged build plan (work stage by stage; keep both in sync when decisions change).

Current state: stages 1-17 are done. The frontend talks to a real `POST /api/fight` (Claude verdict + OpenAI art), with the judge rules in `lib/`. Rate limiting (stage 13) is built too. Vercel deploy (stage 19) is not. There is no build step or linter.

## Running it

Needs Node 22+ (the SDKs and `process.loadEnvFile`). The default `node` on this machine may be older, so check `node -v`; nvm has a newer one under `~/.nvm/versions/node/`. API keys go in `.env` (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`; git-ignored). Optional overrides: `VERDICT_MODEL`, `IMAGE_MODEL`.

```
npm run dev      # http://localhost:3000: serves the frontend and POST /api/fight
npm test         # offline tests (Node's built-in runner, no network or keys)
node --test tests/verdict-schema.test.js   # one test file
```

Real fights cost money and take about 15s (image generation). Add `?mock` to the page URL to use the built-in mock instead, with no server or keys. Mock flags (comma separated, e.g. `?mock=fast,art-fail`): `fast`, `slow`, `verdict-fail` (502), `generic-fail` (500), `network-lost`, `rate-limited`, `judge-timeout`/`verdict-hang` (hits the 60s client timeout), `art-fail`, `art-blocked`, `art-hang` (see `api-client.js`).

Scripts that call the real APIs (they use `.env`):

```
node scripts/try-verdict.js "Goku" "Vegeta"   # or --adversarial / --hard
node scripts/try-art.js "10 cows"             # or --range / --adversarial; saves images to $ART_OUT or the tmp dir
```

## Architecture

- **No modules or bundler.** `index.html` loads classic scripts in dependency order: `messages.js`, `validation.js`, `energy.js`, `api-client.js`, `placeholder.js`, `image-utils.js`, `battledex.js`, `combobox.js`, `app.js`. They share one global scope, so later files call earlier files' functions directly. Top-level `const` (e.g. `BattleDex`) is not a `window` property; function declarations are. `validation.js` has a guarded `module.exports` so it can be required from Node.
- **`app.js` is the orchestrator**: view switching, form handling, the fight flow, the winner card, the save flow and the BattleDex view. Other files are small single-purpose helpers.
- **Exclusive views.** Form, `#loading`, `#result` and `#battledex` are toggled only through `showView(name)` using the `hidden` attribute (CSS enforces `[hidden]{display:none!important}`). Never show two at once; `showView` also manages focus.
- **Fighter identity is the normalized name** (`normalizeName` in `validation.js`: lowercase, trim, collapse whitespace; exact match only). It is the BattleDex `id` and the key for art reuse. Mirror matches (the same fighter on both sides) are allowed: the server generates one image and shares it, the judge is told it is a mirror match, and the result card labels the sides Player 1 / Player 2 and offers a single save. The BattleDex stores `{id, name, image, createdAt}` under the localStorage key `battledex`; every saved image must be at most `IMAGE_BUDGET_CHARS` (10,240 characters of data URI, about 10KB). `downsizeImage` (`image-utils.js`) searches for it: it tries 256, 224, 192, 160, 128, 112 then 96px, and at the first size that fits at WebP quality ≥0.5 binary-searches the highest quality under budget (JPEG fallback if WebP can't be encoded; a last-resort pass allows quality down to 0.2). `BattleDex.save` refuses oversize images (`too_large`), and `app.js` shrinks older oversized entries once at startup.
- **Fight flow**: `startFight` makes one `getFight(nameA, nameB, {needArtA, needArtB})` call (`api-client.js`) with a 60s timeout; the server runs verdict and art in parallel. A failed fight shows a retry message on the form. Saved BattleDex art is reused (`needArt` false); art that comes back `null` shows the placeholder.
- **Energy bars**: the result card shows two segmented bars (`#energy`, filled in by `renderEnergy` in `app.js`; `hasValidEnergy`/`energyLevel` are pure helpers in `energy.js`). They are `role="meter"` with a text value, drain from 100% with a stepped CSS animation, and are hidden if the energy values are invalid. The final colour comes from `data-level`, not the animation, so reduced motion (no animation) still shows the right state.
- **Copy lives in `messages.js`** (the playful arena-announcer voice): all errors, notes, save/BattleDex messages and the 12 rotating loading phrases. Don't hard-code user-facing text elsewhere. `fightFailureMessage(reason)` maps a failed fight to a message (429 → rate limit with the Retry-After seconds, `TimeoutError`/504 → judge timeout, 502 → judge failed, `NetworkError` → network lost, anything else → generic), and `artNoteMessage` words blocked vs failed portraits. `api-client.js` must throw `NetworkError` when `fetch` itself rejects, and put `status` and `retryAfter` on HTTP errors. Loading phrases rotate via `startLoadingMessages` (one fixed phrase with reduced motion, `aria-hidden` so screen readers aren't interrupted).
- **Comboboxes**: `createFighterCombobox` (`combobox.js`) implements the ARIA editable combobox. Both fields list every saved fighter (including the same one on both sides). `app.js`'s `dexChanged()` is the single place to call after any BattleDex change (clears the cache, updates counts, refreshes both comboboxes and the "saved" markers).
- **Accessibility is a requirement, not polish**: `aria-disabled` rather than `disabled` to keep focus, live regions for state changes, `prefers-reduced-motion` replaces animations with a fade (a separate block in `styles.css` must be extended when adding animated elements), WCAG AA contrast (palette in CSS variables), and no horizontal scroll at 320px or 200% text. Render all names and model text with `textContent`, never `innerHTML`.

## Server code (`lib/`, `api/`, CommonJS)

- **`api/fight.js`** is the only public endpoint and just adapts Vercel's `req/res` to `handleFight` in `lib/fight.js`, which holds all the logic (request `{fighterA, fighterB, needArtA, needArtB}`, response `{verdict, art:{a,b}}` with art as a data URI or `null`; 400/405/502 with fixed messages, never model or provider text). `scripts/dev-server.js` adapts the same handler to plain Node and serves only root-level `.html/.css/.js` files. Shared code lives in `lib/`, not `api/`, because Vercel exposes every file in `api/`.
- **Verdict**: `lib/verdict.js` (`getVerdict`, Claude structured output via the SDK's `zodOutputFormat`, one retry on invalid output, `VerdictError` codes) using `judge-prompt.js` (system prompt, `buildUserMessage`, `MAX_TOKENS`) and `verdict-schema.js` (`verdictModelSchema` simple for the model, `verdictSchema` strict for `validateVerdict`: loser energy exactly 0, winner 1-100, 2-4 plain-text sentences). The prompt holds judging rules but no output-format instructions.
- **Art**: `lib/art.js` (`getArt`, returns a webp data URI; `ArtError` codes `moderation_blocked`/`art_error`; `/api/fight` reports each fighter's `artStatus` (`generated`, `not_requested`, `moderation_blocked`, `failed`) and the result card notes a blocked portrait) using `art-prompt.js` (fixed style prompt, name as a quoted string). Compression is set so a response stays far below Vercel's 4.5MB limit.
- **Names are untrusted**: `sanitize.js` cleans them; they are escaped into `<fighter_a>/<fighter_b>` tags for the judge and quoted for the art prompt. Instruction-like names are judged as ordinary fighters.
- Tests inject fake Claude/OpenAI clients, so `npm test` never touches the network. `tests/adversarial-names.json` (hostile names, hard-to-call matchups) feeds both the offline tests and the `scripts/try-*.js` real-API runs. `tests/frontend-safety.test.js` fails on `innerHTML`-style sinks, and a verdict-schema test checks the mock verdict against the strict schema so the mock stays in sync.
- **Rate limit** (`lib/rate-limit.js`, `lib/client-ip.js`): 3 fights/min/IP, checked in `handleFight` after validation and before any model call, so a fight is one request. Fixed-window counter behind a `store.increment(key, windowMs)` interface; `MemoryStore` is per-process, so stage 14 must swap in a Redis-style store. Returns 429 + `Retry-After`; if the limiter errors it fails closed (503). IP comes from the socket locally and from Vercel's headers only when `VERCEL` is set. `?mock=rate-limited` fakes a 429 in the UI. Tests pass a roomy limiter via `deps.rateLimiter`, otherwise they'd share the process-wide one.
- Still to build: the rest of the final improvements (stage 18: 50 character name limit; names are still capped at 60 until then), then Vercel deploy (stage 19).

## Testing approach used so far

The `tests/` folder covers the server code only; there are no committed browser tests. Frontend behaviour was verified with headless Chrome (`--dump-dom`, `--screenshot`, `--virtual-time-budget`) against pages served over HTTP, axe-core scans and a node contrast script, with the harnesses kept outside the repo. Real screen readers, Safari/Firefox and touch devices have not been tested.
