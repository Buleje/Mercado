import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import path from "path";

const isProd = process.env.NODE_ENV === "production";

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // Skip TS type check during build — validated in CI via tsc --noEmit / npm run build
  typescript: { ignoreBuildErrors: true },

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
          ...(isProd ? [{
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          }] : []),
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://www.googletagmanager.com https://www.google-analytics.com https://clarity.ms https://*.clarity.ms https://unpkg.com https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://images.openfoodfacts.org https://static.openfoodfacts.org https://www.google-analytics.com https://*.tile.openstreetmap.org https://unpkg.com",
              "connect-src 'self' https://*.supabase.co https://www.google-analytics.com https://region1.google-analytics.com https://clarity.ms https://*.clarity.ms wss://*.supabase.co https://nominatim.openstreetmap.org https://images.unsplash.com https://va.vercel-scripts.com https://api.apis.net.pe https://eldni.com",
              "worker-src 'self' blob:",
              "frame-src 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              ...(isProd ? ["upgrade-insecure-requests"] : []),
            ].join("; "),
          },
        ],
      },
      // Stricter CSP for admin/superadmin — allows self iframes for preview
      {
        source: "/(admin|superadmin)/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' blob: https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://images.openfoodfacts.org https://static.openfoodfacts.org https://*.tile.openstreetmap.org",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://images.unsplash.com https://va.vercel-scripts.com",
              "worker-src 'self' blob:",
              "frame-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              ...(isProd ? ["upgrade-insecure-requests"] : []),
            ].join("; "),
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
        ],
      },
      // Relaxed CSP for checkout — allows Stripe iframe
      {
        source: "/(registro|venta|pedido)/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' blob: https://js.stripe.com https://www.googletagmanager.com https://www.google-analytics.com https://clarity.ms https://*.clarity.ms https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://*.stripe.com https://www.google-analytics.com",
              "connect-src 'self' https://*.supabase.co https://api.stripe.com https://www.google-analytics.com https://region1.google-analytics.com https://clarity.ms https://*.clarity.ms https://images.unsplash.com",
              "frame-src https://js.stripe.com https://hooks.stripe.com",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self' https://checkout.stripe.com",
              ...(isProd ? ["upgrade-insecure-requests"] : []),
            ].join("; "),
          },
        ],
      },
    ];
  },

  // Redirect root to marketplace (main landing page)
  async redirects() {
    return [
      {
        source: "/",
        destination: "/marketplace",
        permanent: false, // 307 — keep as temporary so we can change later
      },
    ];
  },
};

export default bundleAnalyzer(nextConfig);
