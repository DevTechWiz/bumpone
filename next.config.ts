import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compress: true,
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL || "https://lgpejkhnlxdekozwyczi.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxncGVqa2hubHhkZWtvend5Y3ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NzQ0NDksImV4cCI6MjEwNjA1MDQ0OX0.U-R1ieQ_FsLOiKd4OwWBqLVR68gs-3VcQw3G5SWHzP4",
    NEXT_PUBLIC_GOOGLE_CLIENT_ID:
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
      "991881014010-3o60g98nqent0bc6em2kqb0ahu0b88s9.apps.googleusercontent.com",
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "https://bumpone.lol",
    NEXT_PUBLIC_R2_PUBLIC_URL:
      process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "https://assets.bumpone.lol",
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "assets.bumpone.lol",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/fonts/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
