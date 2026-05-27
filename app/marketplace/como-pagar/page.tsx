import type { Metadata } from "next";
import ComoPagarClient from "@/components/marketplace/como-pagar/ComoPagarClient";

const BASE_URL = "https://www.buleje.pe";
const URL = `${BASE_URL}/marketplace/como-pagar`;

export const metadata: Metadata = {
  title: "Cómo pagar — Yape, Plin, efectivo o transferencia",
  description:
    "Pagá tu pedido como prefieras: Yape, Plin, transferencia o efectivo al recibir. Sin tarjeta obligatoria, sin comisión. Buleje · Pucallpa, Ucayali, Perú.",
  keywords: [
    "pagar con Yape",
    "pagar con Plin",
    "pago contra entrega Pucallpa",
    "delivery efectivo Pucallpa",
    "formas de pago bodega",
    "comprar online sin tarjeta Perú",
    "pago transferencia bodega",
  ],
  alternates: {
    canonical: URL,
    languages: { "es-PE": URL, "x-default": URL },
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
  },
  openGraph: {
    title: "Cómo pagar tu pedido en Buleje",
    description:
      "Yape, Plin, transferencia o efectivo al recibir. Pagá como te quede más cómodo, sin comisión.",
    url: URL,
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
    images: [
      {
        url: "/api/og?title=C%C3%B3mo%20pagar%20tu%20pedido&subtitle=Yape%2C%20Plin%2C%20efectivo%20o%20transferencia%20%C2%B7%20sin%20comisi%C3%B3n",
        width: 1200,
        height: 630,
        alt: "Cómo pagar en Buleje — Yape, Plin, efectivo o transferencia",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cómo pagar tu pedido en Buleje",
    description:
      "Yape, Plin, transferencia o efectivo al recibir. Sin tarjeta obligatoria, sin comisión.",
    images: [
      "/api/og?title=C%C3%B3mo%20pagar%20tu%20pedido&subtitle=Yape%2C%20Plin%2C%20efectivo%20o%20transferencia%20%C2%B7%20sin%20comisi%C3%B3n",
    ],
  },
};

// ── JSON-LD: BreadcrumbList + FAQPage + HowTo (pagar con Yape) ──
// Rich results en Google + respuestas citables por IAs. Las preguntas
// reflejan el FAQ visible de la pagina (paridad contenido ↔ structured data).
function ComoPagarJsonLd() {
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: BASE_URL },
      { "@type": "ListItem", position: 2, name: "Marketplace", item: `${BASE_URL}/marketplace` },
      { "@type": "ListItem", position: 3, name: "Cómo pagar", item: URL },
    ],
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      ["¿La bodega cobra comisión por usar Yape?", "No. Pagás exactamente lo que ves en el carrito — ni un sol más. Yape es gratis para vos y para la bodega."],
      ["¿Puedo cambiar el método de pago después de pedir?", "Sí, mientras la bodega no haya despachado el pedido. Avisás por el chat del pedido y lo cambian en segundos."],
      ["¿Y si pago en efectivo y no tengo el monto exacto?", "Al confirmar indicás con cuánto pagás (ej. 'con S/100') y la bodega prepara tu vuelto exacto."],
      ["¿Mi tarjeta queda guardada en Buleje?", "Solo si lo pedís. Stripe y Mercado Pago tokenizan cada cobro; Buleje nunca ve el número completo."],
      ["¿Qué hago si mi Yape no aparece en la bodega?", "Puede tardar hasta 30 segundos. Si pasa de 1 minuto, enviás el comprobante por WhatsApp a la bodega."],
      ["¿Aceptan Yape de empresa?", "Sí. Poné tu RUC en la nota del pedido para que te emitan factura electrónica."],
    ].map(([q, a]) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "Cómo pagar tu pedido con Yape en Buleje",
    description:
      "Pagá tu pedido de bodega con Yape en segundos, sin comisión, desde tu celular.",
    totalTime: "PT1M",
    inLanguage: "es-PE",
    step: [
      { "@type": "HowToStep", position: 1, name: "Elegí Yape", text: "Seleccioná Yape al confirmar el pedido." },
      { "@type": "HowToStep", position: 2, name: "Escaneá el QR", text: "Escaneá el QR de la bodega o copiá su número." },
      { "@type": "HowToStep", position: 3, name: "Yapeá el monto", text: "Confirmá el pago del monto exacto con tu huella." },
      { "@type": "HowToStep", position: 4, name: "Listo", text: "La bodega ve el pago en segundos y empieza a empacar." },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToLd) }} />
    </>
  );
}

export default function ComoPagarPage() {
  return (
    <>
      <ComoPagarJsonLd />
      <ComoPagarClient />
    </>
  );
}
