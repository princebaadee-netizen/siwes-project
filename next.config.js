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
        destination: `http://localhost:${backendPort()}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;