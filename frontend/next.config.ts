import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Docker / Kubernetes standalone deployment
  output: "standalone",

  images: {
    unoptimized: false,
  },

  // During local dev the API runs on :8000.
  // On Vercel set NEXT_PUBLIC_API_URL to your backend URL and this is unused.
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl || apiUrl === "http://localhost:8000") return [];
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
