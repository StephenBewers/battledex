const test = require("node:test");
const assert = require("node:assert");
const { IMAGE_BUDGET_CHARS, IMAGE_SIZES, searchEncoding } = require("../image-utils");

// A fake encoder: the data URI length grows with size squared and with quality.
const fakeEncode = (bytesAt256Q1) => (size, quality) =>
  "x".repeat(Math.round(bytesAt256Q1 * (size / 256) ** 2 * quality));

const options = { budget: 10_240, sizes: IMAGE_SIZES, minQuality: 0.5, maxQuality: 0.9 };

test("the budget is 10KB of stored characters", () => {
  assert.strictEqual(IMAGE_BUDGET_CHARS, 10_240);
});

test("a small, simple image keeps the biggest size and a high quality", () => {
  const result = searchEncoding(fakeEncode(14_000), options);
  assert.strictEqual(result.size, 256);
  assert.ok(result.url.length <= 10_240);
  assert.ok(result.quality > 0.7);
});

test("the result is always within the budget", () => {
  for (const full of [8_000, 14_000, 20_000, 30_000, 40_000, 60_000]) {
    const result = searchEncoding(fakeEncode(full), options);
    if (result) assert.ok(result.url.length <= 10_240, `full=${full} got ${result.url.length}`);
  }
});

test("busier images step down in size, never below the quality floor", () => {
  const easy = searchEncoding(fakeEncode(14_000), options);
  const hard = searchEncoding(fakeEncode(40_000), options);
  assert.ok(hard.size < easy.size);
  assert.ok(hard.quality >= 0.5);
});

test("it picks the largest size that fits at the quality floor", () => {
  // At the floor quality 0.5, size 192 costs 30000 * 0.5625 * 0.5 = 8437 (fits)
  // and size 224 costs 30000 * 0.7656 * 0.5 = 11484 (does not).
  const result = searchEncoding(fakeEncode(30_000), options);
  assert.strictEqual(result.size, 192);
});

test("quality is as high as fits, not just the floor", () => {
  const result = searchEncoding(fakeEncode(30_000), options);
  // 192px at quality q costs 16875 * q. The best q under 10240 is about 0.607.
  assert.ok(result.quality > 0.58 && result.quality <= 0.607, `quality ${result.quality}`);
  assert.ok(result.url.length > 9_800, "uses most of the budget");
});

test("returns null when nothing fits", () => {
  assert.strictEqual(searchEncoding(fakeEncode(1_000_000), options), null);
});

test("sizes are tried biggest first and stop at the first fit", () => {
  const tried = [];
  const encode = (size, quality) => {
    tried.push(size);
    return fakeEncode(14_000)(size, quality);
  };
  searchEncoding(encode, options);
  assert.ok(tried.every((size) => size === 256), "never needed a smaller size");
});

test("a last-resort pass with a lower quality floor can still fit", () => {
  const hopeless = { ...options, sizes: [96], minQuality: 0.5 };
  assert.strictEqual(searchEncoding(fakeEncode(200_000), hopeless), null);
  const lastResort = searchEncoding(fakeEncode(200_000), { ...hopeless, minQuality: 0.2, maxQuality: 0.5 });
  assert.ok(lastResort && lastResort.url.length <= 10_240);
});
