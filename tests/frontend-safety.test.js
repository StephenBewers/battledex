const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "public");
const files = fs.readdirSync(root).filter((f) => f.endsWith(".js") || f.endsWith(".html"));

// Names and model text must only ever reach the page as text, never as markup
// or code. These APIs would turn them into markup or code.
const FORBIDDEN = [
  /\.innerHTML\b/,
  /\.outerHTML\b/,
  /insertAdjacentHTML/,
  /document\.write/,
  /\beval\s*\(/,
  /new\s+Function\s*\(/,
  /setTimeout\s*\(\s*["'`]/,
  /\.setAttribute\s*\(\s*["']on/i,
];

test("there are frontend files to check", () => {
  assert.ok(files.includes("app.js") && files.includes("index.html"));
});

for (const file of files) {
  test(`${file} has no HTML or code injection sinks`, () => {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    for (const pattern of FORBIDDEN) {
      assert.ok(!pattern.test(source), `${file} matches ${pattern}`);
    }
  });
}

test("winner name, loser name and reasoning are written with textContent", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.ok(/textContent/.test(app));
});
