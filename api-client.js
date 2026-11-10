// Mock API layer (stage 4). Same function signatures the real client will use
// in stage 11, so app.js doesn't change when the mocks are swapped out.
//
//   getVerdict(nameA, nameB) -> { winner: "A" | "B", reasoning, closeness, loserDamage }
//   getArt(name)             -> { image }   (an image URL / data URI)
//
// Dev flags via the query string, comma separated, e.g. ?mock=fast,art-fail
//   fast          near-instant responses (for tests)
//   slow          6 second responses (to look at the loading state)
//   verdict-fail  getVerdict always rejects
//   art-fail      getArt always rejects

const mockFlags = new Set(
  (new URLSearchParams(window.location.search).get("mock") || "")
    .split(",")
    .map((flag) => flag.trim())
    .filter(Boolean)
);

function mockDelay(minMs, maxMs) {
  let ms = minMs + Math.random() * (maxMs - minMs);
  if (mockFlags.has("fast")) ms = 30;
  if (mockFlags.has("slow")) ms = 6000;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// FNV-1a 32-bit hash. Makes mock results deterministic for the same input.
function hashString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

async function getVerdict(nameA, nameB) {
  await mockDelay(1200, 2200);
  if (mockFlags.has("verdict-fail")) {
    throw new Error("Mock verdict failure");
  }

  const hash = hashString(`${nameA.toLowerCase()}|${nameB.toLowerCase()}`);
  const winner = hash % 2 === 0 ? "A" : "B";
  const winnerName = winner === "A" ? nameA : nameB;
  const loserName = winner === "A" ? nameB : nameA;
  const closeness = 20 + (hash % 71); // 20-90
  const loserDamage = Math.round(closeness * 0.8);

  return {
    winner,
    reasoning:
      `${winnerName} takes the victory. ${loserName} lands some real hits, ` +
      `but ${winnerName} has the edge once the fight gets going. ` +
      `(Mock verdict: the real judge arrives in a later stage.)`,
    closeness,
    loserDamage,
  };
}

// Tiny generated pixel portrait, so the mock flow has art to show.
function mockPortrait(name) {
  const hash = hashString(name.toLowerCase());
  const hue = hash % 360;
  const bg = `hsl(${hue} 60% 30%)`;
  const skin = `hsl(${(hue + 40) % 360} 70% 70%)`;
  const shirt = `hsl(${(hue + 180) % 360} 70% 55%)`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">` +
    `<rect width="16" height="16" fill="${bg}"/>` +
    `<rect x="2" y="12" width="12" height="4" fill="${shirt}"/>` +
    `<rect x="5" y="3" width="6" height="8" fill="${skin}"/>` +
    `<rect x="4" y="4" width="1" height="5" fill="${skin}"/>` +
    `<rect x="11" y="4" width="1" height="5" fill="${skin}"/>` +
    `<rect x="6" y="6" width="1" height="1" fill="#0d0d26"/>` +
    `<rect x="9" y="6" width="1" height="1" fill="#0d0d26"/>` +
    `<rect x="7" y="9" width="2" height="1" fill="#0d0d26"/>` +
    `<rect x="5" y="2" width="6" height="2" fill="#0d0d26"/>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function getArt(name) {
  await mockDelay(1800, 3200);
  if (mockFlags.has("art-fail")) {
    throw new Error("Mock art failure");
  }
  return { image: mockPortrait(name) };
}
