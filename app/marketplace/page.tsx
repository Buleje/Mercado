import type { Metadata } from "next";
import MarketplaceContent from "@/components/marketplace/MarketplaceContent";

export const metadata: Metadata = {
  title: "Marketplace Buleje — Bodegas y Tiendas de Todo el Peru",
  description:
    "Encuentra bodegas, minimarkets y tiendas de todo el Peru en un solo lugar. Compra online con delivery rapido. Paga con Yape o efectivo.",
  alternates: {
    canonical: "https://www.buleje.pe/marketplace",
  },
  openGraph: {
    title: "Marketplace Buleje — Bodegas y Tiendas de Todo el Peru",
    description:
      "Encuentra bodegas, minimarkets y tiendas de todo el Peru. Delivery rapido, Yape y efectivo.",
    url: "https://www.buleje.pe/marketplace",
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
  },
};

export default function MarketplacePage() {
  return <MarketplaceContent />;
}
