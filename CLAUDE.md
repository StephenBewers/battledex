# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Battleground: type two fighters, get an AI verdict on who'd win plus AI-generated pixel-art portraits. Vanilla HTML/CSS/JS frontend, Vercel serverless functions, Claude for the verdict, OpenAI images for art, localStorage for the BattleDex. `project-brief.md` holds the product decisions and `project-build.md` the staged build plan (work stage by stage; keep both in sync when decisions change).

Current state: the frontend (build plan stages 1-8) is complete against a mock API, and the offline judge rules (stage 9) are written in `lib/` with tests. The real API calls and endpoint (`api/` is still empty) are stages 10-14. There is no build step or linter.

## Running it

Static site, no build. Serve the project root and open it:

```
python3 -m http.server 8000
```

Offline tests (Node's built-in runner, only dependency is `zod`):

```
npm test                                   # all tests
node --test tests/verdict-schema.test.js   # one file
```

Node 16 is installed locally; the Anthropic SDK in stage 10 will likely need a newer Node, so check before installing it.

Mock API behaviour is controlled by `?mock=` query flags: `fast`, `slow`, `verdict-fail`, `art-fail`, `verdict-hang`, `art-hang` (see `api-client.js`).

## Architecture

- **No modules or bundler.** `index.html` loads classic scripts in dependency order: `validation.js`, `api-client.js`, `placeholder.js`, `image-utils.js`, `battledex.js`, `combobox.js`, `app.js`. They share one global scope, so later files call earlier files' functions directly. Top-level `const` (e.g. `BattleDex`) is not a `window` property; function declarations are. `validation.js` has a guarded `module.exports` so it can be required from Node.
- **`app.js` is the orchestrator**: view switching, form handling, the fight flow, the winner card, the save flow and the BattleDex view. Other files are small single-purpose helpers.
- **Exclusive views.** Form, `#loading`, `#result` and `#battledex` are toggled only through `showView(name)` using the `hidden` attribute (CSS enforces `[hidden]{display:none!important}`). Never show two at once; `showView` also manages focus.
- **Fighter identity is the normalized name** (`normalizeName` in `validation.js`: lowercase, trim, collapse whitespace; exact match only). It is the BattleDex `id`, the key for art reuse, and the basis of mirror-match blocking. The BattleDex stores `{id, name, image, createdAt}` under the localStorage key `battledex`; images are downsized to ≤256px WebP (JPEG fallback) by `downsizeImage`.
- **Fight flow**: `startFight` runs verdict and art in parallel with `Promise.allSettled` and a 60s timeout. A verdict failure shows a retry message; an art failure or saved art falls back to the stored image or the placeholder. Art is only requested for fighters not already in the BattleDex.
- **Comboboxes**: `createFighterCombobox` (`combobox.js`) implements the ARIA editable combobox. It excludes the other field's fighter via `getExcludedId`. `app.js`'s `dexChanged()` is the single place to call after any BattleDex change (clears the cache, updates counts, refreshes both comboboxes and the "saved" markers).
- **Accessibility is a requirement, not polish**: `aria-disabled` rather than `disabled` to keep focus, live regions for state changes, `prefers-reduced-motion` replaces animations with a fade (a separate block in `styles.css` must be extended when adding animated elements), WCAG AA contrast (palette in CSS variables), and no horizontal scroll at 320px or 200% text. Render all names and model text with `textContent`, never `innerHTML`.

## Server code (`lib/`, CommonJS, no API calls yet)

- `judge-prompt.js` (system prompt, `buildUserMessage`, `MAX_TOKENS`), `verdict-schema.js` (zod schemas and `validateVerdict`), `art-prompt.js` (`buildArtPrompt`) and `sanitize.js` (`sanitizeName`). The prompt holds the judging rules but no output-format instructions; the zod schema enforces the verdict shape (loser energy exactly 0, winner 1-100, 2-4 sentences, plain text). `verdictModelSchema` is the simple version for model structured output, `verdictSchema` the strict one for validation. Names are escaped into `<fighter_a>/<fighter_b>` tags and quoted in the art prompt.
- `tests/adversarial-names.json` holds hostile names and hard-to-call matchups, used by the offline tests and to be run against the real model in stage 10. `tests/frontend-safety.test.js` fails if any frontend file uses `innerHTML` or similar sinks, and the verdict-schema test checks the mock verdict against the strict schema, so the mock stays in sync.

Planned, not built yet:
- Single public endpoint `POST /api/fight` with request `{fighterA, fighterB, needArtA, needArtB}` and response `{verdict, art:{a,b}}` (art as base64 data URI or `null`). Verdict and art are internal modules in a top-level `lib/` folder (not `api/`, because Vercel exposes every file in `api/`). A fight counts as one request for the 5/min/IP rate limit.
- Verdict shape (implemented in `lib/verdict-schema.js`): `{winner: "A"|"B", reasoning, energyA, energyB}`. Both fighters start at 100, the loser always ends at 0, the winner at 1-100. Always exactly one winner, reasoning 2-4 sentences, playful but logically justified. The shape is enforced by a zod schema, not by JSON instructions in the prompt.
- Fighter names are untrusted data: pass them in delimited tags, sanitize, and treat instruction-like names as ordinary fighters.
- When `api-client.js` is replaced (stage 12), keep the mock mode toggle and collapse `getVerdict`/`getArt` into one `getFight` call.

## Testing approach used so far

There are no committed tests. Behaviour was verified with headless Chrome (`--dump-dom`, `--screenshot`, `--virtual-time-budget`) against pages served over HTTP, axe-core scans and a node contrast script, with the harnesses kept outside the repo. Real screen readers, Safari/Firefox and touch devices have not been tested.
