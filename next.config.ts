import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import path from "path";

const isProd = process.env.NODE_ENV === "production";

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // Strict TypeScript gate — activado 2026-04-07 tras Sprint C (cierre de TD-012).
  // Cualquier PR con error TS hace fallar el build en CI. Ver docs/adr/008-typescript-strict-gate.md.
  typescript: { ignoreBuildErrors: false },

  // Allow cross-origin dev requests from Cloudflare Tunnel / ngrok
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app", "*.ngrok.io"],

  // Compress responses
  compress: true,

  // Strip console.* in production builds
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },

  // Fix Turbopack workspace root detection (avoids "multiple lockfiles" warning)
  // + resolveAlias forces CSS @import "tailwindcss" to resolve from this project's node_modules
  turbopack: {
    root: __dirname,
    resolveAlias: {
      tailwindcss: path.resolve(__dirname, "node_modules/tailwindcss"),
    },
  },

  // No source maps in production browser bundle (saves ~30–50% of chunk sizes)
  productionBrowserSourceMaps: false,

  // Hide Next.js "Powered by" header
  poweredByHeader: false,

  // Optimized image handling
  images: {
    // Bypass server-side image proxy in dev — browser fetches images directly,
    // eliminating /_next/image 404s caused by dev server not being able to reach external hosts
    unoptimized: process.env.NODE_ENV === "development",
    formats: ["image/avif", "image/webp"],
    qualities: [70, 75],
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "http", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "images.openfoodfacts.org" },
      { protocol: "http", hostname: "images.openfoodfacts.org" },
      { protocol: "https", hostname: "static.openfoodfacts.org" },
      { protocol: "http", hostname: "static.openfoodfacts.org" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },

  experimental: {
    // NOTE: instrumentation.ts is detected automatically since Next.js 15.
    // The `instrumentationHook` flag was removed in Next.js 16.

    // Tree-shake large packages — avoids importing the entire library
    optimizePackageImports: [
      "framer-motion",
      "lucide-react",
      "clsx",
      "tailwind-merge",
      "recharts",
      "three",
      "gsap",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
    ],
  },

  // Add long-lived cache headers for static assets and security headers
  async headers() {
    return [
      // Cache headers for static assets
      // En desarrollo: no-store para que el browser NUNCA cachee chunks de HMR
      // En producción: inmutable por 1 año (los hashes cambian en cada build)
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: isProd
              ? "public, max-age=31536000, immutable"
              : "no-store, no-cache, must-revalidate",
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
      {
        source: "/fonts/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/favicon.ico",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      // Security headers for all routes (CSP is handled dynamically by proxy.ts)
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
          ...(isProd ? [{
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          }] : []),
        ],
      },
    ];
  },

  // No root redirect: `/` ahora sirve la home informativa de app/(store)/page.tsx.
  // El logo del header (components/Header.tsx) apunta a `/` y debe llegar
  // a la landing pública, NO al directorio multi-tienda /marketplace.
};

export default bundleAnalyzer(nextConfig);
