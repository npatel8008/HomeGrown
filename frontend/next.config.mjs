/** @type {import('next').NextConfig} */

// Where the FastAPI backend actually listens. Only used by the rewrite below.
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,

  // Serve the API from the app's own origin in development.
  //
  // Phones need HTTPS for camera, motion and geolocation, which in practice
  // means reaching the dev server through a tunnel. Two separate tunnels (one
  // per port) would mean CORS setup plus a mixed-content risk: an HTTPS page
  // calling an http:// API gets blocked, `lib/api.ts` catches the failure, and
  // the app silently drops to bundled fallback data while *looking* fine.
  //
  // Proxying instead keeps everything same-origin, so one tunnel is enough and
  // NEXT_PUBLIC_API_URL can stay empty (see .env.local).
  // NOTE the exclusion: /api/me/* must NOT be rewritten. Those endpoints carry
  // per-account data and are served by app/api/me/[...path]/route.ts, which
  // checks the Auth0 session and attaches a token the backend can verify.
  // Rewriting them would hand the backend an anonymous request.
  async rewrites() {
    return [
      { source: "/api/:path((?!me/).*)", destination: `${BACKEND_ORIGIN}/api/:path` },
    ];
  },
};

export default nextConfig;
