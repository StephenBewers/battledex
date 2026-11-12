# Battleground — Project Brief
## 1. What are we actually building? (Scope)

A web app where you type in two fighters and get an AI generated verdict on who'd win, plus AI generated character art for both.

Any fighter is allowed, including groups ("10 cows" is one fighter with one image). This is a personal portfolio project.

## 2. What's the smallest, simplest version worth shipping (MVP)?

Two fighter inputs (type a new fighter or pick a saved one), a Fight button, a working verdict with art, a loading state while we wait on the API, and a basic BattleDex saved to localStorage. Type two fighters, get a real result, save it if you want.

### Verdict
- Shown as an animated winner's card with the reasoning for the win.
- No fight history is kept.
- Claude's system prompt scopes it to judging fights only. Fighter names are treated as untrusted data and cannot change its instructions (prompt-injection resistant), and instruction-like names are simply judged as ordinary fighters.
- Claude returns structured JSON: `{ "winner": "A" | "B", "reasoning": "...", "energyA": 0-100, "energyB": 0-100 }`. `energyA` and `energyB` are each fighter's remaining energy as a percent. Both fighters start the fight at 100, and the loser always finishes at 0, so the winner's value is how much energy they had left (1-100; a high number is a close-to-flawless win, a low number is a narrow escape). The energy values are not displayed in the MVP, but are returned now so energy bars can be added later without an API change.
- The judge always picks exactly one winner (no ties, draws or refusals), and the reasoning is 2-4 sentences in a fun, playful tone that still logically justifies the win.

### Fighters and art
- Art is generated once per fighter, and each fighter has exactly one image.
- All art shares one consistent style, enforced by a fixed style prompt on the server. The style is 16-bit fighting-game character select portraits: a bold pixel-art bust on a flat coloured background, with a chunky outline.
- Fighter identity is the normalized name (lowercase, trimmed, whitespace collapsed). Exact match only: "Goku" and "Son Goku" are different fighters.
- Re-fights and repeat names reuse saved art, so no new image call is made for a fighter already in the BattleDex.
- If art generation fails or is refused, show a retro placeholder sprite rather than failing the whole fight.

### Validation
- Both names are required.
- Mirror matches are blocked: if both normalized names are equal, show a validation message and make no API calls.
- Each fighter input is a combobox: type any new fighter or pick a saved BattleDex fighter. The fighter chosen in the other field is left out of the list, and a small marker shows when the typed name is already saved (its saved portrait will be used).

### BattleDex
- Stores fighters and their art only.
- Saved in localStorage under the key `battledex`:
  ```json
  { "id": "10-cows", "name": "10 cows", "image": "data:image/webp;base64,...", "createdAt": 1731100000000 }
  ```
- Images are downsized to about 256px and stored as WebP via canvas (roughly 10-20KB each) to conserve localStorage space.
- A BattleDex view lists saved fighters with their art and lets the user remove one (two-step confirm).

### Flow
1. User enters two names and presses Fight.
2. Validate the inputs.
3. The client sends one request to `POST /api/fight`. The server runs the verdict and any needed art calls in parallel, while the client shows an arcade-style "FIGHT!" loading state.
4. The winner's card animates in with art and reasoning.
5. The user can save each fighter to the BattleDex, then press "New fight" to return to the form.

Only one view (form, loading, result, BattleDex) is visible at a time.

### Design and accessibility
- Mobile-first, responsive, with an 80s/90s retro arcade look.
- Pixel font (e.g. Press Start 2P), high-contrast palette, WCAG AA contrast.
- Respect `prefers-reduced-motion`: replace the card animation with a simple fade.
- `aria-live` announcements for loading and result states; fully keyboard-operable.
- CRT scanlines and glow effects are decorative only, never needed for legibility.

## 3. What are we building this with (tech stack)?

HTML, CSS, and vanilla JS for the frontend. Vercel for hosting and serverless functions. Claude's API for the verdict. OpenAI's image API for the character art. localStorage for saving BattleDex.

### API (Vercel serverless function)
A single public endpoint, `POST /api/fight`, runs a whole fight. Verdict and art are internal server-side modules, not separate endpoints. This means a fight is naturally one request for rate limiting, and nobody can call the art generation directly to bypass the limit.
- Request: `{ fighterA, fighterB, needArtA, needArtB }`. The `needArt` flags say which fighters are not already in the client's BattleDex, so art is only generated for those.
- Response: `{ verdict, art: { a, b } }`. `verdict` is the verdict JSON above. Each `art` value is a base64 data URI (so the client can downsize it on canvas), or `null` if it was not requested, failed or was refused.
- The server runs the verdict and any needed art calls in parallel. The verdict is required: if it fails the endpoint returns an error. If only art fails, it still returns the verdict with `null` art, and the client shows the placeholder sprite.
- Errors: `400` for invalid input, `429` with `Retry-After` when rate limited, `502` if the verdict model fails.

### Status
- No API keys or Vercel account yet. These will be set up later.
- Rate limit: 5 fights per minute per IP. One fight counts as one request, regardless of how many underlying API calls it makes (one verdict plus up to two art). It is built and tested locally before deploying.
- Everything is built and tested locally first. Deployment to Vercel comes last.

## 4. What's the long-term vision, beyond just the MVP?

I would eventually like a real backend where BattleDex characters sync across devices instead of just living in localStorage. I'd also want a quick re-fight option using characters already saved in the BattleDex, instead of typing two new ones every time. And energy bars to show how much energy each fighter had left at the end of the battle.

## 5. Build order

1. Frontend with mocked API responses (look, animations, BattleDex, validation).
2. System prompt, judge rules and prompt-injection hardening, written and tested offline before any real API is connected.
3. Verdict and art modules, then the single `POST /api/fight` endpoint, built and tested locally.
4. Rate limiting (5 fights per minute per IP), tested locally.
5. Vercel deploy: account, environment variables, persistent rate-limit store.
6. Later: cross-device sync backend, quick re-fight from BattleDex, energy bars.

See `project-build.md` for the detailed stage-by-stage plan.
