/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lint is run as its own turbo task; don't couple it to `next build`.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
