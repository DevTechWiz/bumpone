import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 15 files import from the lucide-react barrel. Without this, dev-mode
    // webpack (no tree-shaking) compiles all ~1500 icon modules per route,
    // which is what balloons "Compiling /" to 1500-1900 modules and makes
    // GET / take 2-12s. This rewrites barrel imports to per-icon imports.
    optimizePackageImports: ["lucide-react", "motion"],
  },
};

export default nextConfig;
