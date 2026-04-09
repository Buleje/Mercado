import type { Metadata, Viewport } from "next";
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
      "Tienda Virtual de Abarrotes en Pucallpa | Delivery, Yape y Efectivo",
    template: "%s | Buleje",
  },
  description:
    "Compra abarrotes online en Pucallpa: bebidas, golosinas, carnes, pollo, productos de limpieza y más. Paga con Yape o efectivo. Delivery rápido y tienda virtual administrable.",
  keywords: [
    "tienda virtual de abarrotes en pucallpa",
    "abarrotes delivery pucallpa",
    "comprar abarrotes online pucallpa",
    "tienda de abarrotes pucallpa",
    "delivery de abarrotes pucallpa",
    "supermercado delivery pucallpa",
    "viveres delivery pucallpa",
    "tienda online pucallpa",
    "compras online pucallpa",
    "productos de consumo pucallpa",
    "pagar con yape en pucallpa",
    "tienda con yape en pucallpa",
    "delivery con pago en efectivo pucallpa",
    "delivery rápido en pucallpa",
    "bebidas en pucallpa",
    "golosinas en pucallpa",
    "carnes en pucallpa",
    "pollo en pucallpa",
    "productos de limpieza en pucallpa",
    "detergente delivery pucallpa",
    "abarrotes al por menor pucallpa",
    "venta de viveres pucallpa",
    "snacks y bebidas pucallpa",
    "artículos para el hogar pucallpa",
    "tienda ecommerce pucallpa",
    "delivery de productos pucallpa",
    "viveres a domicilio en pucallpa",
    "tienda de consumo masivo en pucallpa",
    "abarrotes a domicilio pucallpa",
    "compra por whatsapp pucallpa",
    "pago con yape pucallpa",
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
      "Tienda Virtual de Abarrotes en Pucallpa | Delivery, Yape y Efectivo",
    description:
      "Abarrotes, bebidas, carnes, pollo, golosinas y limpieza con delivery en Pucallpa. Compra online y paga con Yape o efectivo.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Buleje - Tienda Virtual de Abarrotes en Pucallpa",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tienda Virtual de Abarrotes en Pucallpa",
    description:
      "Compra abarrotes online con delivery en Pucallpa. Pago por Yape o efectivo.",
    images: ["/og-image.jpg"],
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Correr DB query en paralelo con headers — shaves 100-500ms off TTFB.
  // Arrancamos statsPromise primero (DB call, lento) y después await headers()
  // (fast, solo lee el request context). Cuando statsPromise resuelva ya el
  // headers fue procesado → paralelismo real con awaits explícitos Next.js 16.
  const statsPromise = getCachedReviewStats();
  const reqHeaders = await headers();
  const { ratingValue, ratingCount } = await statsPromise;
  const requestId = reqHeaders.get("x-request-id") ?? undefined;
  // Per-request nonce for CSP — matches what middleware set in x-nonce
  const nonce = reqHeaders.get("x-nonce") ?? undefined;

  return (
    <html lang="es-PE" className={`${GeistSans.variable} ${GeistSans.className}`} suppressHydrationWarning data-scroll-behavior="smooth">
      <head suppressHydrationWarning>
        {requestId && <meta name="x-request-id" content={requestId} />}
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
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Buleje" />
        <link rel="apple-touch-icon" href="/api/pwa-icon/180" />
        <link rel="apple-touch-icon" sizes="180x180" href="/api/pwa-icon/180" />
        <link rel="apple-touch-icon" sizes="152x152" href="/api/pwa-icon/152" />
        <link rel="apple-touch-icon" sizes="167x167" href="/api/pwa-icon/167" />
        <link rel="apple-touch-icon" sizes="120x120" href="/api/pwa-icon/120" />
        
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
            __html: `(function(){try{if(window.innerWidth<640)return;var t=localStorage.getItem("bsm-theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`,
          }}
        />
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
