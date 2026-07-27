/** @type {import('next').NextConfig} */

/**
 * The API is proxied under /backend rather than called on its own domain.
 *
 * Railway hands the web app and the API separate *.up.railway.app subdomains,
 * and up.railway.app is on the Public Suffix List — so those are different
 * SITES, and the session cookie is third-party. Safari blocks third-party
 * cookies outright (Chrome does in Incognito), so the browser silently drops
 * it: sign-in returns 200 and the app bounces straight back to /login.
 *
 * Proxying keeps every request on the web app's own origin, which makes the
 * cookie first-party and works in every browser. Set API_PROXY_TARGET to the
 * API's internal/public URL; without it the rewrite is skipped and the app
 * talks to NEXT_PUBLIC_API_URL directly (local dev).
 */
const target = process.env.API_PROXY_TARGET;

const nextConfig = {
  reactStrictMode: true,
  // Lint is run as its own turbo task; don't couple it to `next build`.
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    if (!target) return [];
    return [{ source: '/backend/:path*', destination: `${target.replace(/\/$/, '')}/:path*` }];
  },
};

export default nextConfig;
