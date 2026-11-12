// Retro placeholder portrait, shown when a fighter's art failed or was refused.
// A 16x16 pixel silhouette with a "?" on the face, as an inline SVG data URI.

const PLACEHOLDER_PORTRAIT = (() => {
  const bg = "#2b2b6b";
  const body = "#4a4a8a";
  const mark = "#ffd23f";

  // The "?" glyph, one [x, y] cell per pixel, inside the head.
  const glyph = [
    [7, 4], [8, 4],
    [6, 5], [9, 5],
    [9, 6],
    [8, 7],
    [7, 8],
    [7, 10],
  ];

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">` +
    `<rect width="16" height="16" fill="${bg}"/>` +
    `<rect x="2" y="12" width="12" height="4" fill="${body}"/>` +
    `<rect x="5" y="3" width="6" height="8" fill="${body}"/>` +
    glyph
      .map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${mark}"/>`)
      .join("") +
    `</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
})();
