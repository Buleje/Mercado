import { Metadata } from "next";
import RecetarioClient from "@/components/store/RecetarioClient";
import RecetasHero from "@/components/marketplace/recetas/RecetasHero";
import ExplorarTracker from "@/components/marketplace/explorar/ExplorarTracker";
import Footer from "@/components/Footer";
import RelatedFeatures from "@/components/ui-system/RelatedFeatures";
import { relatedFor } from "@/lib/navigation/feature-registry";

export const metadata: Metadata = {
  title: "Recetario Peruano — Buleje | Recetas con ingredientes de bodega",
  description:
    "Descubre recetas peruanas con ingredientes que encuentras en tu bodega. Ceviche, Lomo Saltado, Arroz con Pollo y más.",
  alternates: {
    canonical: "https://www.buleje.pe/recetas",
  },
};

export default function RecetasPage() {
  return (
    <>
      <ExplorarTracker pageName="marketplace_recetas" />
      <RecetasHero />
      <RecetarioClient />
      <RelatedFeatures features={relatedFor("recetas")} />
      <Footer />
    </>
  );
}
