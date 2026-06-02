import { Metadata } from "next";
import RecetarioClient from "@/components/store/RecetarioClient";

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
      <main id="main-content">
        {/*
          SEO 2026-05-28 audit: RecetarioClient (client) renderiza el H1 visual.
          SSR HTML no tenía H1 → Google sin encabezado primario.
          H1 sr-only con long-tail keyword "recetas peruanas + ciudad" captura
          search intent ("receta peruana fácil", "ceviche pucallpa", etc.).
        */}
        <h1 className="sr-only">
          Recetas peruanas con ingredientes de bodega — Recetario Buleje Ciudad Constitución
        </h1>
        <RecetarioClient />
      </main>
    </>
  );
}
