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
  experimental: {
    // Gestão $$$: o coletor (Playwright) nunca entra no bundle do app
    serverComponentsExternalPackages: ["playwright"],
    // Gestão $$$: PDF anexado aos documentos para assinar, até 15 MB por arquivo (validado em lib/financas/documentos/anexos.ts)
    serverActions: { bodySizeLimit: "32mb" },
  },
};

export default nextConfig;
