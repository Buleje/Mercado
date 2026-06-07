import type { Metadata } from "next";
import GiftCardsClient from "@/components/marketplace/gift-cards/GiftCardsClient";
import MarketplaceNavbar from "@/components/marketplace/MarketplaceNavbar";

export const metadata: Metadata = {
  title: "Tarjetas de Regalo Buleje — Regala lo que mas se disfruta en el barrio",
  description:
    "Tarjetas digitales desde S/ 20 que se canjean en cualquier bodega del marketplace Buleje. Sin vencimiento, sin letra chica. Envio instantaneo por WhatsApp o email.",
  alternates: {
    canonical: "https://www.buleje.pe/marketplace/gift-cards",
  },
  openGraph: {
    title: "Tarjetas de Regalo Buleje",
    description:
      "Regala lo que mas se disfruta en el barrio. Tarjetas desde S/ 20 sin vencimiento.",
    url: "https://www.buleje.pe/marketplace/gift-cards",
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
  },
};

export default function GiftCardsPage() {
  return (
    <>
      <MarketplaceNavbar />
      <GiftCardsClient />
    </>
  );
}
