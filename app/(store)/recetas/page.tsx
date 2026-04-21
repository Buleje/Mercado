import { Metadata } from "next";
import dynamic from "next/dynamic";
import RecetarioClient from "@/components/store/RecetarioClient";

const MarketplaceNavbar = dynamic(
  () => import("@/components/marketplace/MarketplaceNavbar"),
  { ssr: true }
);
const MarketplaceSecondaryNav = dynamic(
  () => import("@/components/marketplace/MarketplaceSecondaryNav"),
  { ssr: true }
);
const MarketplacePromoBar = dynamic(
  () => import("@/components/marketplace/MarketplacePromoBar"),
  { ssr: true }
);
const Footer = dynamic(() => import("@/components/Footer"), { ssr: true });

export const metadata: Metadata = {
  title: "Recetario Peruano — Buleje | Recetas con ingredientes de bodega",
  description:
    "Descubre recetas peruanas con ingredientes que encuentras en nuestra bodega. Ceviche, Lomo Saltado, Arroz con Pollo y más. Compra los ingredientes con 1 click y recíbelos en tu casa.",
  alternates: {
    canonical: "https://www.buleje.pe/recetas",
  },
  openGraph: {
    title: "Recetario Peruano — Buleje",
    description:
      "Cocina rico con ingredientes de tu bodega favorita. Recetas paso a paso con compra directa de ingredientes.",
    type: "website",
    locale: "es_PE",
    url: "https://www.buleje.pe/recetas",
  },
};

export default function RecetasPage() {
  return (
    <>
      <MarketplacePromoBar />
      <MarketplaceNavbar />
      <MarketplaceSecondaryNav />
      <main id="main-content">
        <RecetarioClient />
      </main>
      <Footer />
    </>
  );
}
