/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build "standalone" (server.js autocontido) — só é usado pelo deploy em
  // Docker na VPS Hostinger; o deploy no Railway (Nixpacks) ignora isso.
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
