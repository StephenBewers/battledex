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

// Shrink an image to a square of at most `size` px (centre-cropped, never
// upscaled) and re-encode it as WebP, falling back to JPEG if the browser can't
// encode WebP. Keeps BattleDex entries small enough for localStorage.
// Resolves to a data URI string.
async function downsizeImage(src, size = 256, quality = 0.8) {
  const img = await loadImage(src);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) throw new Error("Image has no size");

  const side = Math.min(width, height);
  const outSize = Math.min(size, side);

  const canvas = document.createElement("canvas");
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (width - side) / 2, (height - side) / 2, side, side, 0, 0, outSize, outSize);

  let url = canvas.toDataURL("image/webp", quality);
  if (!url.startsWith("data:image/webp")) {
    url = canvas.toDataURL("image/jpeg", quality);
  }
  return url;
}
