import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  env: {
    VITE_AUTH_ENABLED: process.env.VITE_AUTH_ENABLED ?? "true",
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
