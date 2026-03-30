import type { Metadata } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://buleje.com";

export const metadata: Metadata = {
  title: "Crear tu Tienda — Registro | Buleje",
  description:
    "Registra tu bodega online en minutos. Elige un plan, configura tu tienda y empieza a vender con 14 días de prueba gratis.",
  alternates: { canonical: `${BASE_URL}/registro` },
  openGraph: {
    title: "Crear tu Tienda — Registro | Buleje",
    description: "Crea tu tienda online en minutos con Buleje. Prueba gratis 14 días.",
    url: `${BASE_URL}/registro`,
    siteName: "Buleje",
    type: "website",
    locale: "es_PE",
  },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Inicio", item: BASE_URL },
    { "@type": "ListItem", position: 2, name: "Planes y Precios", item: `${BASE_URL}/pricing` },
    { "@type": "ListItem", position: 3, name: "Registro", item: `${BASE_URL}/registro` },
  ],
};

export default function RegistroLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {children}
    </>
  );
}
