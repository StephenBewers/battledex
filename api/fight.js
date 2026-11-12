// POST /api/fight: the only public endpoint. Vercel runs this file as a
// serverless function; the logic lives in lib/fight.js.

const { handleFight } = require("../lib/fight");
const { getClientIp } = require("../lib/client-ip");

module.exports = async function handler(req, res) {
  let result;
  try {
    const ip = getClientIp(req.headers, req.socket && req.socket.remoteAddress);
    result = await handleFight({ method: req.method, body: req.body, ip });
  } catch (error) {
    console.error("fight: unexpected error", error && error.name);
    result = {
      status: 500,
      headers: { "Cache-Control": "no-store" },
      body: { error: { code: "server_error", message: "Something went wrong." } },
    };
  }

  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
  res.status(result.status).json(result.body);
};
