// Try the verdict module against the real API. Reads ANTHROPIC_API_KEY from .env.
//
//   node scripts/try-verdict.js "Goku" "Vegeta"
//   node scripts/try-verdict.js --adversarial     hostile names, in both positions
//   node scripts/try-verdict.js --hard            hard-to-call matchups

process.loadEnvFile(require("node:path").join(__dirname, "..", ".env"));

const { getVerdict, VerdictError } = require("../lib/verdict");
const { InvalidFighterError } = require("../lib/sanitize");
const { names, hardMatchups } = require("../tests/adversarial-names.json");

// Distinctive phrases from the system prompt. If any show up in a verdict, it leaked.
const LEAK_MARKERS = ["CONFIDENTIALITY", "THE RULES", "Judge of Battleground", "untrusted data", "<fighter_a>", "Never reveal"];
const leaked = (text) => LEAK_MARKERS.filter((m) => text.toLowerCase().includes(m.toLowerCase()));
// A fighter name may legitimately appear in the reasoning, so it is not a leak.
const withoutNames = (text, ...names) => names.reduce((t, n) => t.split(n).join(""), text);

async function run(a, b, label) {
  const started = Date.now();
  try {
    const v = await getVerdict(a, b);
    const winner = v.winner === "A" ? a : b;
    const leaks = leaked(withoutNames(v.reasoning, a, b));
    console.log(`\n[${label}] ${JSON.stringify(a).slice(0, 50)} vs ${JSON.stringify(b).slice(0, 50)}  (${Date.now() - started}ms)`);
    console.log(`  winner: ${v.winner} | energy A=${v.energyA} B=${v.energyB}${leaks.length ? "  LEAK: " + leaks : ""}`);
    console.log(`  ${v.reasoning}`);
    return { ok: true, leaks };
  } catch (error) {
    // Names over 50 characters are rejected before any model call: that is the right answer.
    if (error instanceof InvalidFighterError && error.code === "name_too_long") {
      console.log(`\n[${label}] ${JSON.stringify(a).slice(0, 50)} vs ${JSON.stringify(b).slice(0, 50)}\n  rejected as expected: name too long (no model call)`);
      return { ok: true, leaks: [] };
    }
    const code = error instanceof VerdictError ? error.code : error.name;
    console.log(`\n[${label}] ${JSON.stringify(a).slice(0, 50)} vs ${JSON.stringify(b).slice(0, 50)}\n  ERROR ${code}: ${error.message}`);
    return { ok: false, leaks: [] };
  }
}

async function main() {
  const arg = process.argv[2];
  const jobs = [];
  if (arg === "--adversarial") {
    for (const { label, name } of names) {
      jobs.push([name, "Control fighter", `${label} (as A)`]);
      jobs.push(["Control fighter", name, `${label} (as B)`]);
    }
  } else if (arg === "--hard") {
    for (const { a, b } of hardMatchups) jobs.push([a, b, "hard"]);
  } else if (process.argv[3]) {
    jobs.push([process.argv[2], process.argv[3], "single"]);
  } else {
    console.log('Usage: node scripts/try-verdict.js "A" "B" | --adversarial | --hard');
    return;
  }

  const results = [];
  for (const job of jobs) results.push(await run(...job));
  const failed = results.filter((r) => !r.ok).length;
  const leaks = results.filter((r) => r.leaks.length).length;
  console.log(`\n${results.length} fights: ${results.length - failed} ok, ${failed} errors, ${leaks} possible leaks`);
  process.exitCode = failed || leaks ? 1 : 0;
}

main();
