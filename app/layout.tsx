import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import SchemaMarkup from "@/components/SchemaMarkup";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
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
  themeColor: "#2d6a4f",
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
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <SchemaMarkup />
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.clarity.ms" />
        {/* PWA */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Bodega San Martín" />
        <link rel="apple-touch-icon" href="/api/pwa-icon/180" />
        {/* Evitar flash de tema incorrecto */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("bsm-theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>
        {/* Skip to content — accesibilidad */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-bold"
        >
          Ir al contenido principal
        </a>
        <ServiceWorkerRegistrar />
        {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
