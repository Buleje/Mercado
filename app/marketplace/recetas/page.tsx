import { Metadata } from "next";
import RecetarioClient from "@/components/store/RecetarioClient";
import Footer from "@/components/Footer";

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
      <RecetarioClient />
      <Footer />
    </>
  );
}
