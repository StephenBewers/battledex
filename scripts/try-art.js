// Try the art module against the real API. Reads OPENAI_API_KEY from .env.
// Saves images to a folder so you can look at them.
//
//   node scripts/try-art.js "Goku" "10 cows"      specific fighters
//   node scripts/try-art.js --range               a spread of fighter types
//   node scripts/try-art.js --adversarial         hostile names
//
// Output folder: $ART_OUT or <tmpdir>/battleground-art

process.loadEnvFile(require("node:path").join(__dirname, "..", ".env"));

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { getArt, ArtError } = require("../lib/art");
const { names } = require("../tests/adversarial-names.json");

const RANGE = [
  "Goku", // a character
  "Abraham Lincoln", // a real person
  "10 cows", // a group
  "A toaster", // an object
  "Time", // an abstract concept
  "Sadness", // a feeling
  "The Eiffel Tower", // a place
  "Grizzly bear", // an animal
];

async function main() {
  const out = process.env.ART_OUT || path.join(os.tmpdir(), "battleground-art");
  fs.mkdirSync(out, { recursive: true });

  const arg = process.argv[2];
  let list;
  if (arg === "--range") list = RANGE.map((name) => ({ label: name, name }));
  else if (arg === "--adversarial") list = names.slice(0, 8);
  else if (arg) list = process.argv.slice(2).map((name) => ({ label: name, name }));
  else {
    console.log('Usage: node scripts/try-art.js "name" ... | --range | --adversarial');
    return;
  }

  let failures = 0;
  // Sequential keeps the output readable and the cost obvious.
  for (const { label, name } of list) {
    const started = Date.now();
    try {
      const uri = await getArt(name);
      const [, type, data] = uri.match(/^data:image\/(\w+);base64,(.+)$/);
      const file = path.join(out, `${label.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.${type}`);
      fs.writeFileSync(file, Buffer.from(data, "base64"));
      console.log(`ok     ${JSON.stringify(label).slice(0, 40)}  ${Math.round(data.length * 0.75 / 1024)}KB  ${Date.now() - started}ms  ${file}`);
    } catch (error) {
      failures += 1;
      const code = error instanceof ArtError ? error.code : error.name;
      console.log(`FAILED ${JSON.stringify(label).slice(0, 40)}  ${code}: ${error.message}`);
    }
  }
  process.exitCode = failures ? 1 : 0;
}

main();
