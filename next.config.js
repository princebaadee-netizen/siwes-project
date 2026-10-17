const fs = require("fs");
const path = require("path");

/**
 * The backend keeps its own PORT in backend/.env. Reading it here (instead of
 * hardcoding a second copy) means the proxy target and the server that actually
 * starts can never drift apart.
 */
function backendPort() {
  const fallback = 4001;
  try {
    const env = fs.readFileSync(path.join(__dirname, "backend", ".env"), "utf8");
    const match = env.match(/^\s*PORT\s*=\s*"?(\d+)"?/m);
    return match ? Number(match[1]) : fallback;
  } catch {
    return fallback;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Everything the app calls goes to a same-origin /api path, so there is one
  // URL to think about (localhost:3000) and no CORS setup to keep in sync.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiTarget()}/:path*`,
      },
      {
        // Uploaded report logos and cover images live on the API's disk and are
        // referenced as /uploads/... so the browser can load them same-origin.
        source: "/uploads/:path*",
        destination: `${apiTarget()}/uploads/:path*`,
      },
    ];
  },
};

/**
 * Where /api/* is proxied. Locally that's the backend on its own PORT; in a
 * hosted setup set API_PROXY_TARGET (e.g. https://your-api.onrender.com) so the
 * frontend reaches the deployed API. Read when the server starts, so this can
 * be a non-public env var (no NEXT_PUBLIC_ prefix).
 */
function apiTarget() {
  const configured = process.env.API_PROXY_TARGET?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `http://localhost:${backendPort()}`;
}

module.exports = nextConfig;