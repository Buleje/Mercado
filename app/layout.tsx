import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist } from "next/font/google";

const GeistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});
import "./globals.css";
import SchemaMarkup from "@/components/SchemaMarkup";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { cacheLife, cacheTag } from "next/cache";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import InstallPrompt from "@/components/InstallPrompt";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ToastContainer } from "@/components/ToastContainer";
import { ThemeProvider } from "@/contexts/theme-context";
import CommandPalette from "@/components/CommandPalette";
import ClientEffects from "@/components/ui/ClientEffects";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.buleje.pe"),
  title: {
    default:
      "Buleje — Software ERP para Bodegas y Tiendas del Peru | Inventario, POS, Delivery",
    template: "%s | Buleje",
  },
  description:
    "Buleje: software ERP para bodegas y tiendas de todo el Peru. Inventario en tiempo real, punto de venta POS, delivery, fiado digital y facturacion SUNAT. Yape y efectivo. Empieza gratis.",
  keywords: [
    "software para bodegas",
    "ERP tienda peru",
    "sistema inventario bodega",
    "punto de venta bodega",
    "software delivery tienda",
    "facturacion electronica bodega",
    "Buleje ERP",
    "app bodega peru",
    "gestion inventario tienda",
    "sistema ventas bodega",
    "software bodega gratis",
    "POS para bodegas",
    "fiado digital bodega",
    "tienda online bodega peru",
    "software minimarket peru",
    "sistema bodega Yape",
    "delivery bodega app",
    "control stock tienda",
  ],
  authors: [{ name: "Buleje" }],
  creator: "Buleje",
  publisher: "Buleje",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "es_PE",
    url: "https://www.buleje.pe",
    siteName: "Buleje",
    title:
      "Buleje — Software ERP para Bodegas y Tiendas del Peru",
    description:
      "Sistema completo para tu bodega: inventario, ventas POS, delivery, fiado digital y facturacion SUNAT. Funciona con Yape y efectivo. Disponible en todo el Peru.",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "Buleje — Software ERP para Bodegas y Tiendas del Peru",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Buleje — Software para Bodegas del Peru",
    description:
      "Inventario, POS, delivery, fiado digital y facturacion SUNAT. Todo en un solo sistema. Empieza gratis.",
    images: ["/api/og"],
  },
  robots: process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "development"
    ? { index: false, follow: false }
    : {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-video-preview": -1,
          "max-image-preview": "large",
          "max-snippet": -1,
        },
      },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || "",
  },
  alternates: {
    canonical: "https://www.buleje.pe",
    languages: {
      "es-PE": "https://www.buleje.pe",
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#00B4A6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

// Cache review stats con la directiva `'use cache'` de Next.js 16.
// Reemplaza al `unstable_cache` deprecado. Usa cacheTag para invalidación
// quirúrgica desde el endpoint de moderación de reviews.
//
// Invalidación: cuando se aprueba una nueva review, llamar al API de dos
// args de Next.js 16 con un perfil de cacheLife: `revalidateTag("review-stats", "max")`
// (la forma de un solo argumento quedó deprecada en Next 16).
//
// cacheLife("hours") = stale después de 1h, revalidación background,
// expiración dura 24h. Las reviews no cambian con frecuencia — 1h es seguro.
async function getCachedReviewStats() {
  "use cache";
  cacheTag("review-stats");
  cacheLife("hours");
  try {
    const agg = await prisma.review.aggregate({ _avg: { rating: true }, _count: { rating: true } });
    if (agg._count.rating > 0) {
      return {
        ratingValue: (agg._avg.rating ?? 4.9).toFixed(1),
        ratingCount: String(agg._count.rating),
      };
    }
  } catch { /* use defaults */ }
  return { ratingValue: undefined, ratingCount: undefined };
}

// Async component that isolates headers() inside a Suspense boundary
// so it doesn't block the entire page render (Next.js 16 streaming).
async function DynamicHeadContent() {
  const reqHeaders = await headers();
  const requestId = reqHeaders.get("x-request-id") ?? undefined;
  const nonce = reqHeaders.get("x-nonce") ?? undefined;

  return (
    <>
      {requestId && <meta name="x-request-id" content={requestId} />}
      {/* Filtrar TODOS los errores de extensiones - Ejecutar PRIMERO */}
      <script
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `!function(){"use strict";var e=console.error;console.error=function(){for(var o=[],r=0;r<arguments.length;r++)o[r]=arguments[r];var n=o.join(" ");n.includes("bootstrap-autofill")||n.includes("extension")||n.includes("chrome-extension")||n.includes("Cache")||e.apply(console,o)};var o=function(e){if(!e)return!1;var o=e.toString?e.toString():"",r=e.filename||"",n=e.stack||"",t=e.message||"";return r.includes("extension")||r.includes("bootstrap-autofill")||r.includes("chrome-extension")||r.includes("moz-extension")||o.includes("extension")||o.includes("Cache")||n.includes("extension")||n.includes("bootstrap-autofill")||n.includes("chrome-extension")||n.includes("Cache")||t.includes("extension")||t.includes("Cache")};window.addEventListener("error",(function(e){if(o(e))return e.preventDefault(),e.stopImmediatePropagation(),!0}),!0),window.addEventListener("unhandledrejection",(function(e){if(o(e.reason))return e.preventDefault(),e.stopImmediatePropagation(),console.log("[Filtrado] Error de extensión bloqueado"),!0}),!0)}();`,
        }}
      />
      {/* Evitar flash de tema incorrecto */}
      <script
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `(function(){try{if(window.innerWidth<640)return;var t=localStorage.getItem("buleje-theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`,
        }}
      />
    </>
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { ratingValue, ratingCount } = await getCachedReviewStats();

  return (
    <html lang="es-PE" className={`${GeistSans.variable} ${GeistSans.className}`} suppressHydrationWarning data-scroll-behavior="smooth">
      <head suppressHydrationWarning>
        <Suspense>
          <DynamicHeadContent />
        </Suspense>
        <SchemaMarkup ratingValue={ratingValue} ratingCount={ratingCount} />
        
        {/* Critical preconnects — max 4 (more hurts performance per Lighthouse) */}
        <link rel="preconnect" href="https://www.googletagmanager.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://region1.google-analytics.com" crossOrigin="anonymous" />
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} crossOrigin="anonymous" />
        )}
        {/* DNS Prefetch for secondary/image origins — cheaper than preconnect */}
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://images.openfoodfacts.org" />
        <link rel="dns-prefetch" href="https://static.openfoodfacts.org" />
        <link rel="dns-prefetch" href="https://www.google-analytics.com" />
        <link rel="dns-prefetch" href="https://www.clarity.ms" />
        <link rel="dns-prefetch" href="https://c.clarity.ms" />
        
        {/* PWA Metadata */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Buleje" />
        <link rel="apple-touch-icon" href="/api/pwa-icon/180" />
        <link rel="apple-touch-icon" sizes="180x180" href="/api/pwa-icon/180" />
        <link rel="apple-touch-icon" sizes="152x152" href="/api/pwa-icon/152" />
        <link rel="apple-touch-icon" sizes="167x167" href="/api/pwa-icon/167" />
        <link rel="apple-touch-icon" sizes="120x120" href="/api/pwa-icon/120" />
        
      </head>
      <body className={`antialiased ${GeistSans.className}`}>
        <ThemeProvider>
        <ErrorBoundary>
        {/* Global interactive UX layer */}
        <ClientEffects />
        {/* Skip to content — accesibilidad */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-bold"
        >
          Ir al contenido principal
        </a>
        <ServiceWorkerRegistrar />
        <InstallPrompt />
        <CommandPalette />
        {children}
        <ToastContainer position="bottom-right" />
        <SpeedInsights />
        <Analytics />
        </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
