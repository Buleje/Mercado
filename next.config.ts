import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import path from "path";

const isProd = process.env.NODE_ENV === "production";

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // TypeScript gate: tsc validation runs in pre-commit hook (husky) and CI.
  // Build-time tsc disabled because it OOMs on Vercel 8GB (131 Prisma models + 3000+ files).
  // Turbopack compilation still type-checks during "Compiled successfully" step.
  // See docs/adr/008-typescript-strict-gate.md.
  typescript: { ignoreBuildErrors: true },

  // Ocultar el boton flotante "compiling" / dev indicators en desarrollo.
  // Bloqueaba la navegacion al superponerse sobre la UI en pantallas pequenas.
  devIndicators: false,

  // ── Cache Components (Next.js 16) ─────────────────────────────────────────
  // Habilita Partial Prerendering (PPR) + directiva `'use cache'` + cacheLife +
  // cacheTag + updateTag/revalidateTag. Reemplaza al viejo `experimental.ppr`.
  // Impacto esperado: -60-80% invocaciones Vercel en rutas públicas cacheables
  // + LCP -200-500ms por servir el shell HTML desde CDN.
  // Activado 2026-04-08 como parte del Plan Maestro Sprint 1 (quick win Q5).
  cacheComponents: true,

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

  // Prisma + Turbopack (Next 16 + Prisma 7): el cliente generado importa
  // `@prisma/client/runtime/client` que Turbopack intenta bundlear como un
  // alias hasheado y falla ("Cannot find module @prisma/client-<hash>/runtime/client").
  // Marcar estos como externals fuerza que se resuelvan vía Node module system.
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    ".prisma/client",
    // Sentry + OpenTelemetry también tienen el mismo bug de hash-alias en Turbopack
    "@sentry/nextjs",
    "@sentry/node",
    "@opentelemetry/api",
    "@opentelemetry/instrumentation",
    "require-in-the-middle",
    "import-in-the-middle",
  ],

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
      { protocol: "https", hostname: "chart.googleapis.com" },
      { protocol: "https", hostname: "api.qrserver.com" },
      // Vercel Blob (banners, logos de tienda subidos via /api/uploads)
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // Cloudflare R2 (alt storage backend)
      { protocol: "https", hostname: "*.r2.dev" },
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      // Placeholders dev/staging
      { protocol: "https", hostname: "placehold.co" },
      { protocol: "https", hostname: "via.placeholder.com" },
    ],
  },

  // ── React Compiler (pilot, opt-in por archivo) ───────────────────────
  // Mode: annotation → solo compila componentes con la directiva `'use memo'`
  // al inicio del archivo. Cero impacto sobre componentes que NO la usen.
  // Plugin: babel-plugin-react-compiler@1.0.0 (instalado 2026-04-28).
  // Next 16: reactCompiler salió de `experimental` y es top-level.
  reactCompiler: { compilationMode: "annotation" },

  experimental: {
    // NOTE: instrumentation.ts is detected automatically since Next.js 15.
    // The `instrumentationHook` flag was removed in Next.js 16.

    // ── Router cache TTL (fix back-nav blanco en Next 16) ────────────────
    // Next 15+ default: dynamic=0 → cada navegación back refetcha desde server.
    // Si el RSC payload streaming queda incompleto al volver, la página queda
    // en blanco hasta refresh manual (bug reportado en /marketplace/[slug]).
    // 30s mantiene el HTML cliente válido para back-nav inmediato.
    staleTimes: { dynamic: 30, static: 180 },

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
      "@buleje/design-system",
    ],

    // Next.js 16.2+ — cache de filesystem para Turbopack en dev.
    // Sobrevive restarts: rebuilds ~5s en vez de 30-60s.
    // Fuente: nextjs.org/blog/next-16-2
    turbopackFileSystemCacheForDev: true,
  },

  // Redirects — rutas consolidadas en la landing (anchors) para SEO-friendly
  // 308 HTTP (permanent + preserves method). Reemplaza los page.tsx con
  // redirect() que devolvian 200 + HTML intermedio.
  async redirects() {
    return [
      { source: "/nosotros", destination: "/#nosotros", permanent: true },
      { source: "/faq", destination: "/#faq", permanent: true },
      { source: "/como-funciona", destination: "/#como-funciona", permanent: true },
    ];
  },

  // Add long-lived cache headers for static assets and security headers
  async headers() {
    return [
      // Cache headers for static assets — production-only.
      // Next.js 16 warns that custom Cache-Control on /_next/static/* breaks
      // dev behavior (HMR + Turbopack file-system cache); leaving it unset in
      // dev hands the chunk lifecycle back to Next.js's own defaults.
      ...(isProd
        ? [
            {
              source: "/_next/static/:path*",
              headers: [
                {
                  key: "Cache-Control",
                  value: "public, max-age=31536000, immutable",
                },
              ],
            },
          ]
        : []),
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
