// API client. One call runs a whole fight:
//
//   getFight(nameA, nameB, { needArtA, needArtB })
//     -> { verdict: { winner: "A" | "B", reasoning, energyA, energyB },
//          art: { a, b },           each art value is a data URI, or null
//          artStatus: { a, b } }    "generated", "not_requested",
//                                   "moderation_blocked" or "failed"
//
// By default it calls the real POST /api/fight. Add ?mock to the page URL to use
// the built-in mock instead (no server or API keys needed). Mock flags are comma
// separated, e.g. ?mock=fast,art-fail
//   fast          near-instant responses (for tests)
//   slow          6 second responses (to look at the loading state)
//   verdict-fail  the judge call fails (a 502), so the "judges fumbled" message
//   generic-fail  an unexpected server error (a 500), so the generic message
//   network-lost  the request can't reach the server, so the "lost connection" message
//   judge-timeout the judges never answer, so the 60 second client timeout hits
//                 (same as verdict-hang)
//   art-fail      art comes back null (status "failed"), so the placeholder is used
//   art-blocked   art comes back null (status "moderation_blocked")
//   rate-limited  the fight is rejected like a 429 (retry after 42 seconds)
//   verdict-hang  the fight never settles (to test the client timeout)
//   art-hang      same as verdict-hang (the fight waits for the art)

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

async function mockVerdict(nameA, nameB) {
  await mockDelay(1200, 2200);
  if (mockFlags.has("verdict-hang") || mockFlags.has("judge-timeout")) return new Promise(() => {});
  if (mockFlags.has("verdict-fail")) {
    throw Object.assign(new Error("Mock verdict failure"), { status: 502 });
  }
  if (mockFlags.has("generic-fail")) {
    throw Object.assign(new Error("Mock server error"), { status: 500 });
  }

  const hash = hashString(`${nameA.toLowerCase()}|${nameB.toLowerCase()}`);
  const winner = hash % 2 === 0 ? "A" : "B";
  const winnerName = winner === "A" ? nameA : nameB;
  const loserName = winner === "A" ? nameB : nameA;
  // Both fighters start at 100 energy. The loser always ends at 0.
  const winnerEnergy = 10 + (hash % 81); // 10-90

  return {
    winner,
    reasoning:
      `${winnerName} takes the victory. ${loserName} lands some real hits, ` +
      `but ${winnerName} has the edge once the fight gets going. ` +
      `(Mock verdict: the real judge arrives in a later stage.)`,
    energyA: winner === "A" ? winnerEnergy : 0,
    energyB: winner === "B" ? winnerEnergy : 0,
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
    // Explicit width/height so the browser reports a real size when this is
    // downsized for the BattleDex.
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 16 16" shape-rendering="crispEdges">` +
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

async function mockArt(name) {
  await mockDelay(1800, 3200);
  if (mockFlags.has("art-hang")) return new Promise(() => {});
  if (mockFlags.has("art-blocked")) {
    throw Object.assign(new Error("Mock art blocked"), { code: "moderation_blocked" });
  }
  if (mockFlags.has("art-fail")) {
    throw new Error("Mock art failure");
  }
  return mockPortrait(name);
}

// The mock fight behaves like the server: verdict and needed art in parallel,
// a failed art call becomes null, a failed verdict fails the whole fight.
async function mockFight(nameA, nameB, { needArtA, needArtB }) {
  if (mockFlags.has("network-lost")) {
    await mockDelay(200, 400);
    throw Object.assign(new Error("Mock network failure"), { name: "NetworkError" });
  }
  if (mockFlags.has("rate-limited")) {
    await mockDelay(200, 400);
    throw Object.assign(new Error("Mock rate limit"), { status: 429, retryAfter: 42 });
  }

  // Resolves to { image, status } so a failure carries its reason.
  const art = (needed, name) =>
    needed
      ? mockArt(name).then(
          (image) => ({ image, status: "generated" }),
          (error) => ({ image: null, status: error.code === "moderation_blocked" ? "moderation_blocked" : "failed" })
        )
      : { image: null, status: "not_requested" };

  const [verdict, artA, artB] = await Promise.all([
    mockVerdict(nameA, nameB),
    art(needArtA, nameA),
    art(needArtB, nameB),
  ]);
  return {
    verdict,
    art: { a: artA.image, b: artB.image },
    artStatus: { a: artA.status, b: artB.status },
  };
}

const useMock = new URLSearchParams(window.location.search).has("mock");

async function getFight(nameA, nameB, { needArtA, needArtB }) {
  if (useMock) return mockFight(nameA, nameB, { needArtA, needArtB });

  let response;
  try {
    response = await fetch("/api/fight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fighterA: nameA, fighterB: nameB, needArtA, needArtB }),
    });
  } catch {
    // fetch only rejects when the request never got an answer (offline, DNS,
    // server down), so this is the "network lost" case.
    throw Object.assign(new Error("Couldn't reach the server"), { name: "NetworkError" });
  }

  if (!response.ok) {
    const error = new Error("The fight request failed");
    error.status = response.status;
    const retryAfter = Number(response.headers.get("Retry-After"));
    if (retryAfter > 0) error.retryAfter = retryAfter;
    throw error;
  }

  const data = await response.json();
  return {
    verdict: data.verdict,
    art: { a: data.art?.a ?? null, b: data.art?.b ?? null },
    artStatus: { a: data.artStatus?.a ?? "failed", b: data.artStatus?.b ?? "failed" },
  };
}
