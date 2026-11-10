# Battleground — Project Brief
## 1. What are we actually building? (Scope)

A web app where you type in two fighters and get an AI generated verdict on who'd win, plus AI generated character art for both.

Any fighter is allowed, including groups ("10 cows" is one fighter with one image). This is a personal portfolio project.

## 2. What's the smallest, simplest version worth shipping (MVP)?

Two text inputs, a Fight button, a working verdict with art, a loading state while we wait on the API, and a basic BattleDex saved to localStorage. Type two fighters, get a real result, save it if you want.

### Verdict
- Shown as an animated winner's card with the reasoning for the win.
- No fight history is kept.
- Claude's system prompt scopes it to judging fights only. Fighter names are treated as untrusted data and cannot change its instructions (prompt-injection resistant), and instruction-like names are simply judged as ordinary fighters.
- Claude returns structured JSON: `{ "winner": "A" | "B", "reasoning": "...", "closeness": 0-100, "loserDamage": 0-100 }`. `closeness` and `loserDamage` are not displayed in the MVP, but are returned now so damage indicators can be added later without an API change.

### Fighters and art
- Art is generated once per fighter, and each fighter has exactly one image.
- All art shares one consistent style, enforced by a fixed style prompt on the server. The style is 16-bit fighting-game character select portraits: a bold pixel-art bust on a flat coloured background, with a chunky outline.
- Fighter identity is the normalized name (lowercase, trimmed, whitespace collapsed). Exact match only: "Goku" and "Son Goku" are different fighters.
- Re-fights and repeat names reuse saved art, so no new image call is made for a fighter already in the BattleDex.
- If art generation fails or is refused, show a retro placeholder sprite rather than failing the whole fight.

### Validation
- Both names are required.
- Mirror matches are blocked: if both normalized names are equal, show a validation message and make no API calls.

### BattleDex
- Stores fighters and their art only.
- Saved in localStorage under the key `battledex`:
  ```json
  { "id": "10-cows", "name": "10 cows", "image": "data:image/webp;base64,...", "createdAt": 1731100000000 }
  ```
- Images are downsized to about 256px and stored as WebP via canvas (roughly 10-20KB each) to conserve localStorage space.

### Flow
1. User enters two names and presses Fight.
2. Validate the inputs.
3. The verdict call and any needed art calls run in parallel, with an arcade-style "FIGHT!" loading state.
4. The winner's card animates in with art and reasoning.
5. The user can save each fighter to the BattleDex.

### Design and accessibility
- Mobile-first, responsive, with an 80s/90s retro arcade look.
- Pixel font (e.g. Press Start 2P), high-contrast palette, WCAG AA contrast.
- Respect `prefers-reduced-motion`: replace the card animation with a simple fade.
- `aria-live` announcements for loading and result states; fully keyboard-operable.
- CRT scanlines and glow effects are decorative only, never needed for legibility.

## 3. What are we building this with (tech stack)?

HTML, CSS, and vanilla JS for the frontend. Vercel for hosting and serverless functions. Claude's API for the verdict. OpenAI's image API for the character art. localStorage for saving BattleDex.

### API (Vercel serverless functions)
- `POST /api/verdict`: request `{ fighterA, fighterB }`, response is the verdict JSON above.
- `POST /api/art`: request `{ name }`, response `{ image }`. Only called for fighters not already in the BattleDex.

### Status
- No API keys or Vercel account yet. These will be set up later.
- Rate limit: 5 fights per minute per IP. One fight counts as one request, regardless of how many underlying API calls it makes (one verdict plus up to two art). It is built and tested locally before deploying.
- Everything is built and tested locally first. Deployment to Vercel comes last.

## 4. What's the long-term vision, beyond just the MVP?

I would eventually like a real backend where BattleDex characters sync across devices instead of just living in localStorage. I'd also want a quick re-fight option using characters already saved in the BattleDex, instead of typing two new ones every time. And damage indicators to show how close the battle was and how much damage the loser inflicted on the winner.

## 5. Build order

1. Frontend with mocked API responses (look, animations, BattleDex, validation).
2. Serverless functions for verdict and art, built and tested locally.
3. System prompt and prompt-injection hardening.
4. Rate limiting (5 fights per minute per IP), tested locally.
5. Vercel deploy: account, environment variables, persistent rate-limit store.
6. Later: cross-device sync backend, quick re-fight from BattleDex, damage indicators.

See `project-build.md` for the detailed stage-by-stage plan.
