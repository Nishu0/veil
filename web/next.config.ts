import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["circomlibjs"],
  turbopack: {
    // Pin the root to this app so a lockfile elsewhere on disk is never picked up.
    root: __dirname,
    // Tailwind v4 via its Turbopack loader (@tailwindcss/turbopack is already a devDependency).
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
