import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Instrument_Serif } from "next/font/google";

// Body — Geist: tipografía moderna, neutral, optimizada para pantalla.
// preload: false silencia el warning "preloaded but not used within a few
// seconds" que se dispara cuando la navegación client-side retrasa el uso
// inicial de la fuente. display:swap mantiene FOUT instantáneo.
const GeistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

// Display — Instrument Serif: serif contemporáneo con carácter editorial.
// Menos florido que Fraunces italic, competente con las ilustraciones
// line-art (paiche, tucán, doña elena). Regular weight 400.
// Transmite: "diario independiente de barrio", no "logo de boutique".
const InstrumentDisplay = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400"],
  style: ["normal", "italic"],
});
import "./globals.css";
import SchemaMarkup from "@/components/SchemaMarkup";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { cacheLife, cacheTag } from "next/cache";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ToastContainer } from "@/components/ToastContainer";
import { Toaster as SonnerToaster } from "sonner";
import { ThemeProvider } from "@/contexts/theme-context";
import { LocaleProvider } from "@/contexts/locale-context";
import { CurrencyProvider } from "@/contexts/currency-context";
// 5 widgets client-only lazy-loaded post-FCP (Lenis + CommandPalette +
// ServiceWorker + InstallPrompt + ClientEffects). Reducen el bundle
// del root layout en ~100-150kb.
import RootDeferredWidgets from "@/components/RootDeferredWidgets";
import { SkipLink } from "@/components/ui-system/SkipLink";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.buleje.pe"),
  title: {
    default:
      "Buleje — Marketplace y ERP para Bodegas de Todo el Perú | Delivery, Inventario, POS",
    template: "%s | Buleje",
  },
  description:
    "Buleje: marketplace de bodegas y software ERP para tiendas de todo el Perú. Comprá con delivery rápido o gestioná tu bodega con inventario en tiempo real, POS, fiado digital y facturación SUNAT. Originado en Pucallpa, disponible en Lima, Arequipa, Trujillo, Cusco, Chiclayo, Iquitos y más. Yape, Plin y efectivo.",
  keywords: [
    // Marketplace nacional
    "marketplace bodegas peru",
    "bodegas online peru",
    "delivery abarrotes peru",
    "comprar bodega lima",
    "bodegas arequipa delivery",
    "tiendas online trujillo",
    "bodegas cusco",
    "delivery pucallpa",
    // ERP / software
    "software para bodegas",
    "ERP tienda peru",
    "sistema inventario bodega peru",
    "punto de venta bodega",
    "software delivery tienda",
    "facturacion electronica bodega sunat",
    "app bodega peru",
    "sistema ventas bodega",
    "software bodega gratis",
    "POS para bodegas peru",
    "fiado digital bodega",
    "tienda online bodega",
    "software minimarket peru",
    "sistema bodega Yape Plin",
    "control stock tienda peru",
    // Brand + origen
    "Buleje",
    "Buleje Peru",
    "Buleje Pucallpa",
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
      "Buleje — Marketplace y ERP para Bodegas de Todo el Perú",
    description:
      "Marketplace + sistema completo para bodegas del Perú. Comprá con delivery rápido o gestioná tu tienda: inventario, POS, fiado digital y facturación SUNAT. Yape, Plin, efectivo. Originado en Pucallpa, disponible en todo el país.",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "Buleje — Marketplace y ERP para Bodegas de Todo el Perú",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Buleje — Bodegas del Perú en tu celular",
    description:
      "Marketplace + ERP de bodegas peruanas. Delivery rápido o gestioná tu tienda. Yape, Plin, efectivo. Disponible en todo el Perú.",
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
    // eslint-disable-next-line no-restricted-properties -- query global cross-tenant para schema.org del root layout
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
async function CachedSchemaMarkup() {
  const { ratingValue, ratingCount } = await getCachedReviewStats();
  return <SchemaMarkup ratingValue={ratingValue} ratingCount={ratingCount} />;
}

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-PE" className={`${GeistSans.variable} ${InstrumentDisplay.variable} ${GeistSans.className}`} suppressHydrationWarning data-scroll-behavior="smooth">
      <head suppressHydrationWarning>
        <Suspense>
          <DynamicHeadContent />
        </Suspense>
        <Suspense fallback={<SchemaMarkup />}>
          <CachedSchemaMarkup />
        </Suspense>
        
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

        {/* Workaround del bug turbopack RSC en dev: negative time stamp en
            flushComponentPerformance. Patchea performance.measure parse-time,
            antes de que el runtime turbopack lo invoque. No afecta producción. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/perf-measure-patch.js" />

        {/* Back-nav refresh — script externo, parse-time, antes que React/Next.
            Recarga la página en cualquier back/forward del browser para que
            todos los datos, banners y componentes se rehidraten. Cubre:
            - popstate (back/forward normal)
            - pageshow persisted=true (bfcache restoration de Safari/iOS/FF)
            - navType=back_forward al mount (back-nav que cargó este documento)
            Externo porque el CSP bloquea inline scripts. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/back-nav-refresh.js" />
      </head>
      <body className={`antialiased ${GeistSans.className}`}>
        {/* Skip-link WCAG 2.4.1 — primer tabulable del body (ADR-075 tokens DS). */}
        <SkipLink />
        <ThemeProvider>
        <LocaleProvider>
        <CurrencyProvider>
        <ErrorBoundary>
        {/* 5 widgets client-only deferred — SmoothScroll, ClientEffects,
            ServiceWorker, InstallPrompt, CommandPalette. Descarga post-FCP. */}
        <RootDeferredWidgets />
        {children}
        <ToastContainer position="bottom-right" />
        <SonnerToaster
          richColors
          closeButton
          position="bottom-right"
          duration={3800}
          toastOptions={{
            classNames: {
              toast: "rounded-xl border border-gray-200 dark:border-gray-800",
              title: "text-sm font-bold",
              description: "text-xs text-gray-500 dark:text-gray-400",
            },
          }}
        />
        <SpeedInsights />
        <Analytics />
        </ErrorBoundary>
        </CurrencyProvider>
        </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
