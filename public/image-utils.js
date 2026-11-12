// Image helpers.

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Needed so remote images can be drawn to a canvas without tainting it.
    // Data URIs are unaffected.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });
}

// Every image stored in the BattleDex must fit in this many characters (the
// length of the saved "data:image/..." string), which is about 10KB. That keeps
// 10-20 saved fighters comfortably inside localStorage.
const IMAGE_BUDGET_CHARS = 10 * 1024;

// Sizes to try, biggest first. Bigger is better, so the first size that fits
// the budget at an acceptable quality wins.
const IMAGE_SIZES = [256, 224, 192, 160, 128, 112, 96];
const IMAGE_MIN_QUALITY = 0.5; // below this WebP starts to look blocky
const IMAGE_MAX_QUALITY = 0.9;
const IMAGE_LAST_RESORT_QUALITY = 0.2; // only if nothing fits at the normal floor

// Finds the best encoding that fits the budget. `encode(size, quality)` returns
// a data URI string. For each size (biggest first) it checks the lowest
// quality, skips the size if even that is too big, and otherwise binary
// searches for the highest quality that still fits.
// Returns { url, size, quality }, or null if nothing fits. Pure, so it can be
// tested without a browser.
function searchEncoding(encode, { budget, sizes, minQuality, maxQuality, steps = 6 }) {
  for (const size of sizes) {
    const lowest = encode(size, minQuality);
    if (lowest.length > budget) continue;

    let best = { url: lowest, size, quality: minQuality };
    let low = minQuality;
    let high = maxQuality;
    for (let i = 0; i < steps; i++) {
      const mid = (low + high) / 2;
      const url = encode(size, mid);
      if (url.length <= budget) {
        best = { url, size, quality: mid };
        low = mid;
      } else {
        high = mid;
      }
    }
    return best;
  }
  return null;
}

class ImageTooLargeError extends Error {
  constructor() {
    super("Couldn't shrink this image enough to save it");
    this.name = "ImageTooLargeError";
  }
}

// Shrink an image so its data URI is at most `budget` characters: a centre-
// cropped square, never upscaled, encoded as WebP (JPEG if the browser can't
// encode WebP). Resolves to a data URI string, or rejects with
// ImageTooLargeError if even the smallest, lowest-quality version is too big.
async function downsizeImage(src, budget = IMAGE_BUDGET_CHARS) {
  const img = await loadImage(src);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) throw new Error("Image has no size");
  const side = Math.min(width, height);

  const encode = (size, quality) => {
    const outSize = Math.min(size, side);
    const canvas = document.createElement("canvas");
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (width - side) / 2, (height - side) / 2, side, side, 0, 0, outSize, outSize);

    const url = canvas.toDataURL("image/webp", quality);
    return url.startsWith("data:image/webp") ? url : canvas.toDataURL("image/jpeg", quality);
  };

  // Never upscale: sizes bigger than the image collapse to the image's own
  // size, and duplicates are dropped.
  const candidates = [...new Set(IMAGE_SIZES.map((size) => Math.min(size, side)))];

  const found =
    searchEncoding(encode, { budget, sizes: candidates, minQuality: IMAGE_MIN_QUALITY, maxQuality: IMAGE_MAX_QUALITY }) ||
    searchEncoding(encode, { budget, sizes: candidates, minQuality: IMAGE_LAST_RESORT_QUALITY, maxQuality: IMAGE_MIN_QUALITY });
  if (!found) throw new ImageTooLargeError();
  return found.url;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { IMAGE_BUDGET_CHARS, IMAGE_SIZES, searchEncoding };
}
