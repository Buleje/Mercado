import type { Metadata } from "next";
import MarketplaceContent from "@/components/marketplace/MarketplaceContent";

export const metadata: Metadata = {
  title: "Marketplace | Buleje — Todas las bodegas en un solo lugar",
  description:
    "Encuentra bodegas, minimarkets y distribuidores de Pucallpa. Compra online con delivery rápido.",
  openGraph: {
    title: "Marketplace Buleje — Todas las bodegas en un solo lugar",
    description:
      "Encuentra bodegas, minimarkets y distribuidores de Pucallpa en un solo lugar.",
    url: "https://www.buleje.pe/marketplace",
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
  },
};

export default function MarketplacePage() {
  return <MarketplaceContent />;
}
