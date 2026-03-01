import type { NextConfig } from "next";

// In Docker: INTERNAL_API_URL=http://api:8000
// In local dev: set in .env.local as INTERNAL_API_URL=http://localhost:8000
const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  // Proxy all /api/* calls to the FastAPI backend.
  // Browser always talks to its own origin — no CORS needed.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${INTERNAL_API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
