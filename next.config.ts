import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // Compress responses
  compress: true,

  // Strip console.* in production builds
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },

  // No source maps in production browser bundle (saves ~30–50% of chunk sizes)
  productionBrowserSourceMaps: false,

  // Hide Next.js "Powered by" header
  poweredByHeader: false,

  // Optimized image handling
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [70, 75],
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "images.openfoodfacts.org" },
      { protocol: "https", hostname: "static.openfoodfacts.org" },
    ],
  },

  experimental: {
    // Tree-shake large packages — avoids importing the entire library
    optimizePackageImports: [
      "framer-motion",
      "lucide-react",
      "clsx",
      "tailwind-merge",
    ],
  },

  // Fix Turbopack workspace-root detection warning
  turbopack: {
    root: __dirname,
  },

  // Add long-lived cache headers for static assets and security headers
  async headers() {
    return [
      // Cache headers for static assets
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      // Security headers for all routes
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default bundleAnalyzer(nextConfig);
