// Works out the caller's IP address for rate limiting.
//
// On Vercel the request arrives through Vercel's proxy, which sets the client
// address in headers it controls (a caller can't forge them). Locally there is
// no proxy, so the socket's address is used. Forwarding headers are NOT trusted
// off Vercel, because there anyone could send a fake one.
//
// `headers` are Node-style (lower-case names). Returns "unknown" when nothing
// usable is found, so those requests share one strict bucket.

function first(value) {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === "string" ? text.split(",")[0].trim() : "";
}

function getClientIp(headers = {}, remoteAddress = "", { onVercel = Boolean(process.env.VERCEL) } = {}) {
  let ip = "";
  if (onVercel) {
    ip = first(headers["x-vercel-forwarded-for"]) || first(headers["x-real-ip"]) || first(headers["x-forwarded-for"]);
  }
  ip = ip || remoteAddress || "";

  // Treat IPv4-mapped IPv6 (::ffff:1.2.3.4) as the plain IPv4 address.
  ip = ip.replace(/^::ffff:/i, "");
  return ip.length > 0 && ip.length <= 64 ? ip : "unknown";
}

module.exports = { getClientIp };
