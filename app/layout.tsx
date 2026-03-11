import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import SchemaMarkup from "@/components/SchemaMarkup";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import InstallPrompt from "@/components/InstallPrompt";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/theme-context";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.bodegasanmartin.pe"),
  title: {
    default:
      "Tienda Virtual de Abarrotes en Pucallpa | Delivery, Yape y Efectivo",
    template: "%s | Bodega San Martín",
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
  authors: [{ name: "Bodega San Martín" }],
  creator: "Bodega San Martín",
  publisher: "Bodega San Martín",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "es_PE",
    url: "https://www.bodegasanmartin.pe",
    siteName: "Bodega San Martín",
    title:
      "Tienda Virtual de Abarrotes en Pucallpa | Delivery, Yape y Efectivo",
    description:
      "Abarrotes, bebidas, carnes, pollo, golosinas y limpieza con delivery en Pucallpa. Compra online y paga con Yape o efectivo.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Bodega San Martín - Tienda Virtual de Abarrotes en Pucallpa",
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
  robots: {
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
    google: "tu-codigo-de-verificacion-google",
  },
  alternates: {
    canonical: "https://www.bodegasanmartin.pe",
  },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <SchemaMarkup />
        
        {/* Resource Hints: Preconnect to critical origins */}
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://images.openfoodfacts.org" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://static.openfoodfacts.org" crossOrigin="anonymous" />
        
        {/* DNS Prefetch: Analytics and external services */}
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.google-analytics.com" />
        <link rel="dns-prefetch" href="https://www.clarity.ms" />
        <link rel="dns-prefetch" href="https://c.clarity.ms" />
        
        {/* PWA Metadata */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Bodega San Martín" />
        <link rel="apple-touch-icon" href="/api/pwa-icon/180" />
        <link rel="apple-touch-icon" sizes="180x180" href="/api/pwa-icon/180" />
        <link rel="apple-touch-icon" sizes="152x152" href="/api/pwa-icon/152" />
        <link rel="apple-touch-icon" sizes="167x167" href="/api/pwa-icon/167" />
        <link rel="apple-touch-icon" sizes="120x120" href="/api/pwa-icon/120" />
        
        {/* Filtrar TODOS los errores de extensiones - Ejecutar PRIMERO */}
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(){"use strict";var e=console.error;console.error=function(){for(var o=[],r=0;r<arguments.length;r++)o[r]=arguments[r];var n=o.join(" ");n.includes("bootstrap-autofill")||n.includes("extension")||n.includes("chrome-extension")||n.includes("Cache")||e.apply(console,o)};var o=function(e){if(!e)return!1;var o=e.toString?e.toString():"",r=e.filename||"",n=e.stack||"",t=e.message||"";return r.includes("extension")||r.includes("bootstrap-autofill")||r.includes("chrome-extension")||r.includes("moz-extension")||o.includes("extension")||o.includes("Cache")||n.includes("extension")||n.includes("bootstrap-autofill")||n.includes("chrome-extension")||n.includes("Cache")||t.includes("extension")||t.includes("Cache")};window.addEventListener("error",(function(e){if(o(e))return e.preventDefault(),e.stopImmediatePropagation(),!0}),!0),window.addEventListener("unhandledrejection",(function(e){if(o(e.reason))return e.preventDefault(),e.stopImmediatePropagation(),console.log("[Filtrado] Error de extensión bloqueado"),!0}),!0)}();`,
          }}
        />
        {/* Evitar flash de tema incorrecto */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("bsm-theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>
        <ErrorBoundary>
        {/* Skip to content — accesibilidad */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-bold"
        >
          Ir al contenido principal
        </a>
        <ServiceWorkerRegistrar />
        <InstallPrompt />
        {children}
        </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
