import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import Script from "next/script";
import { Geist, Instrument_Serif } from "next/font/google";

// Body — Geist: tipografía moderna, neutral, optimizada para pantalla.
// PERF 2026-05-12 (Performance agent P0): preload TRUE para Geist (body
// usado en TODAS las páginas). Reduce FOUT 300-600ms en 3G de Pucallpa.
// Antes preload: false silenciaba un warning pero costaba tiempo real.
const GeistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

// Display — Instrument Serif: serif contemporáneo con carácter editorial.
// PERF 2026-05-12: preload TRUE — fuente usada en headings/landing pages.
// display:swap mantiene FOUT instantáneo si la fuente tarda.
const InstrumentDisplay = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  preload: true,
  weight: ["400"],
  style: ["normal", "italic"],
  // Audit 2026-05-17 02-P2-7: fallback explícito previene FOIT en
  // conexiones lentas (Pucallpa 3G). Georgia es el fallback serif más
  // disponible cross-browser/OS.
  fallback: ["Georgia", "Cambria", "Times New Roman", "serif"],
});
import "./globals.css";
import SchemaMarkup from "@/components/SchemaMarkup";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { cacheLife, cacheTag } from "next/cache";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ToastContainer } from "@/components/ToastContainer";
import NetworkErrorListener from "@/components/NetworkErrorListener";
import { Toaster as SonnerToaster } from "sonner";
import { ThemeProvider } from "@/contexts/theme-context";
import { LocaleProvider } from "@/contexts/locale-context";
import { CurrencyProvider } from "@/contexts/currency-context";
// 5 widgets client-only lazy-loaded post-FCP (Lenis + CommandPalette +
// ServiceWorker + InstallPrompt + ClientEffects). Reducen el bundle
// del root layout en ~100-150kb.
import RootDeferredWidgets from "@/components/RootDeferredWidgets";
import ChunkErrorReloader from "@/components/ChunkErrorReloader";
import { SkipLink } from "@/components/ui-system/SkipLink";
import NavProgress from "@/components/NavProgress";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { BRAND_GEO, GEO_PLACENAME, GEO_POSITION } from "@/lib/geo";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.buleje.pe"),
  title: {
    default:
      "Buleje — Marketplace y ERP para Bodegas de Todo el Perú | Delivery, Inventario, POS",
    template: "%s | Buleje",
  },
  description:
    "Buleje: marketplace de bodegas y software ERP para tiendas del Perú. Comprá con delivery rápido o gestioná tu bodega con inventario en tiempo real, POS, fiado digital y facturación SUNAT. Lanzamiento en Ciudad Constitución (Oxapampa, Pasco) — creciendo en la Selva Central y todo el país. Yape, Plin y efectivo.",
  keywords: [
    // Marketplace nacional
    "marketplace bodegas peru",
    "bodegas online peru",
    "delivery abarrotes peru",
    "comprar bodega lima",
    "bodegas arequipa delivery",
    "tiendas online trujillo",
    "bodegas cusco",
    // Lanzamiento — Ciudad Constitución / Oxapampa / Pasco (Selva Central)
    "delivery Ciudad Constitución",
    "bodegas Ciudad Constitución",
    "delivery Oxapampa",
    "bodegas Pasco",
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
    "Buleje Ciudad Constitución",
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
      "Marketplace + sistema completo para bodegas del Perú. Comprá con delivery rápido o gestioná tu tienda: inventario, POS, fiado digital y facturación SUNAT. Yape, Plin, efectivo. Lanzamiento en Ciudad Constitución (Oxapampa, Pasco) — creciendo en todo el país.",
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
    title: "Bodegas del Perú en tu celular",
    description:
      "Marketplace + ERP de bodegas peruanas. Delivery rápido o gestioná tu tienda. Yape, Plin, efectivo. Disponible en todo el Perú.",
    images: ["/api/og"],
  },
  robots: process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "development"
    ? { index: false, follow: false }
    : {
        index: true,
        follow: true,
        // Directivas extendidas también a nivel raíz (no solo googleBot) →
        // se emiten en <meta name="robots"> para Bing/otros + consistencia
        // con /tiendas (audit SEO 2026-05-31).
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
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
    // Designer audit P1 SEO: declarar hreflang permite que Google indexe
    // las versiones traducidas. Por ahora solo es-PE es la versión real;
    // las otras se mantendrán como `?lang=` cuando se completen.
    languages: {
      "es-PE": "https://www.buleje.pe",
      "es":    "https://www.buleje.pe",
      "x-default": "https://www.buleje.pe",
    },
  },
  // SEO local: geo meta tags ayudan a Google Maps / Local Pack a posicionarnos
  // por búsquedas "[query] Ciudad Constitución". Lanzamiento en Ciudad
  // Constitución (Oxapampa, Pasco) — Selva Central. Centralizado en lib/geo.ts.
  other: {
    "geo.region": BRAND_GEO.regionCode,
    "geo.placename": GEO_PLACENAME,
    "geo.position": GEO_POSITION,
    "ICBM": `${BRAND_GEO.lat}, ${BRAND_GEO.lng}`,
  },
};

// Brandon 2026-05-20 v9 audit P0: theme-color NO acepta `var(--accent)` —
// los browsers no resuelven CSS vars en meta tags. La barra del browser
// mobile quedaba sin color de marca. Hex literal del DS (light/dark mode).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#00A0A0" },
    { media: "(prefers-color-scheme: dark)", color: "#14C2C2" },
  ],
  // A11y (audit SEO 2026-05-31): sin `maximumScale` — no limitamos el zoom
  // del usuario. WCAG 1.4.4 exige zoom hasta 200%; cualquier cap (aunque sea
  // 5x) es una mala práctica de accesibilidad innecesaria. Dejar que el
  // usuario haga pinch-zoom libremente en mobile.
  width: "device-width",
  initialScale: 1,
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

async function BrandRuntimeOverrides() {
  // Brandon mayo 2026: inyecta colores y favicon configurados en
  // /superadmin/configuracion. Si el cliente no cambió nada, este
  // fragmento queda vacío (no overrides).
  const { getPlatformConfigSSR, brandColorOverridesCss } = await import("@/lib/platform-config.server");
  const cfg = await getPlatformConfigSSR();
  const css = brandColorOverridesCss(cfg);
  return (
    <>
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      {cfg.brand.faviconUrl && (
        <>
          <link rel="icon" type="image/png" href={cfg.brand.faviconUrl} />
          <link rel="shortcut icon" href={cfg.brand.faviconUrl} />
        </>
      )}
    </>
  );
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
      {/* Brandon 2026-05-16: theme por defecto LIGHT, pero respeta el
          override del usuario en sessionStorage. Cuando el cliente activa
          dark mode, debe verse INMEDIATAMENTE (sin flash de light) en cada
          navegación de la sesión. Antes este script borraba el sessionStorage
          y forzaba light en cada page load — saboteaba el dark mode. */}
      <script
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `(function(){try{window.sessionStorage.removeItem("buleje-theme-session");window.localStorage.removeItem("buleje-theme-session");var t=window.sessionStorage.getItem("buleje-theme-session-v2");if(t==="dark"){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark"}else{document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light"}}catch(e){}})()`,
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
        <Suspense>
          <BrandRuntimeOverrides />
        </Suspense>
        {/* Brandon 2026-05-20 v10 audit P0: fallback era <SchemaMarkup />
            (sin stats); cuando llegaba el async <CachedSchemaMarkup />,
            ambos se incluían en el HTML stream — DUPLICACIÓN de JSON-LD
            (WebSite, BreadcrumbList, SiteNavigationElement aparecían 2x).
            Ahora fallback=null: el slot queda vacío hasta que el real llegue. */}
        <Suspense fallback={null}>
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
        
        {/* PWA Metadata — el <link rel="manifest"> a /manifest.webmanifest lo
            inyecta Next automáticamente desde app/manifest.ts. No declarar otro
            manual a /manifest.json (duplicaba el manifest — audit SEO 2026-05-31). */}
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
            antes de que el runtime turbopack lo invoque. No afecta producción.
            Audit 2026-05-19: solo dev — en prod era render-blocking sin razón
            (Turbopack no corre en prod build). FCP -50ms en 3G. */}
        {process.env.NODE_ENV !== "production" && (
          // eslint-disable-next-line @next/next/no-sync-scripts
          <script src="/perf-measure-patch.js" />
        )}

        {/* Back-nav refresh — script externo, parse-time, antes que React/Next.
            Recarga la página en cualquier back/forward del browser para que
            todos los datos, banners y componentes se rehidraten. Cubre:
            - popstate (back/forward normal)
            - pageshow persisted=true (bfcache restoration de Safari/iOS/FF)
            - navType=back_forward al mount (back-nav que cargó este documento)
            Externo porque el CSP bloquea inline scripts. */}
        <script src="/back-nav-refresh.js" defer />
      </head>
      <body className={`antialiased ${GeistSans.className}`}>
        {/* Skip-link WCAG 2.4.1 — primer tabulable del body (ADR-075 tokens DS). */}
        <SkipLink />
        {/* Auto-recuperación de ChunkLoadError: tras un deploy (hashes nuevos)
            o caché de disco corrupta, recarga 1 vez para traer chunks frescos
            en lugar de dejar una feature lazy rota. Guard anti-loop interno. */}
        <ChunkErrorReloader />
        {/* Barra de progreso de navegación — feedback instantáneo al hacer
            clic en cualquier link (cubre el micro-gap antes de loading.tsx).
            Brandon 2026-05-31: envuelto en Suspense porque usa useSearchParams()
            → en Next 16 (cacheComponents) eso vuelve dinámica TODA la página y
            dispara "Uncached data outside <Suspense>" en el RootLayout (afectaba
            mi-pollo y toda ruta). El boundary aísla el opt-out de cache al
            componente, no al árbol entero. */}
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <ThemeProvider>
        <LocaleProvider>
        <CurrencyProvider>
        <ErrorBoundary>
        {/* 5 widgets client-only deferred — SmoothScroll, ClientEffects,
            ServiceWorker, InstallPrompt, CommandPalette. Descarga post-FCP. */}
        <RootDeferredWidgets />
        {children}
        <ToastContainer position="bottom-right" />
        <NetworkErrorListener />
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
        {/* Solo en producción: en dev local pegan a /_vercel/insights/* que no
            existe → 403 rojo en consola. En Vercel funcionan normal. */}
        {process.env.NODE_ENV === "production" && (
          <>
            <SpeedInsights />
            <Analytics />
          </>
        )}
        </ErrorBoundary>
        </CurrencyProvider>
        </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
