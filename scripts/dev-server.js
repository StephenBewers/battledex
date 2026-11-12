// Local dev server: serves the frontend and POST /api/fight (the same handler
// Vercel will run). No Vercel account needed.
//
//   npm run dev            http://localhost:3000
//   PORT=4000 npm run dev
//
// Reads API keys from .env. Needs Node 22+ (process.loadEnvFile).

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  console.warn("No .env file found: real fights will fail until API keys are set.");
}

const { handleFight } = require("../lib/fight");
const { getClientIp } = require("../lib/client-ip");

const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_BYTES = 10_000;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

// Only files directly in the project root with these extensions are served, so
// .env, node_modules, lib and everything else stay private.
function serveStatic(req, res) {
  const urlPath = new URL(req.url, "http://localhost").pathname;
  const name = urlPath === "/" ? "index.html" : urlPath.slice(1);
  const type = TYPES[path.extname(name)];
  if (!type || name.includes("/") || name.includes("\\") || name.startsWith(".")) {
    res.writeHead(404).end("Not found");
    return;
  }
  fs.readFile(path.join(root, name), (error, data) => {
    if (error) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }).end(data);
  });
}

function readJson(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        resolve(undefined);
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve(undefined);
      }
    });
    req.on("error", () => resolve(undefined));
  });
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname !== "/api/fight") return serveStatic(req, res);

  const body = req.method === "POST" ? await readJson(req) : undefined;
  let result;
  try {
    const ip = getClientIp(req.headers, req.socket.remoteAddress);
    result = await handleFight({ method: req.method, body, ip });
  } catch (error) {
    console.error("fight: unexpected error", error && error.name);
    result = { status: 500, headers: {}, body: { error: { code: "server_error", message: "Something went wrong." } } };
  }
  res.writeHead(result.status, { "Content-Type": "application/json", ...result.headers });
  res.end(JSON.stringify(result.body));
});

server.listen(PORT, () => console.log(`Battleground running at http://localhost:${PORT}`));
