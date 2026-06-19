import { Metadata } from "next";
import RecetarioClient from "@/components/store/RecetarioClient";
import { getBannersForSlot } from "@/lib/promo-banners";

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
  // Hero promocional al tope, IGUAL que el inicio y /tiendas (mismo
  // HomeHeroBanner). Resuelto en el server (getBannersForSlot es síncrono) y
  // pasado como initialBanners → se pinta en el primer byte, sin cascada
  // hidratar→fetch→pintar.
  const heroBanners = getBannersForSlot("recetas")
    .filter((b) => b.active)
    .sort((a, b) => a.order - b.order);

  return (
    <>
      <main id="main-content">
        {/*
          SEO 2026-05-28 audit: el H1 único y canónico de la página vive acá
          (server, sr-only) con long-tail keyword "recetas peruanas + ciudad"
          que captura search intent ("receta peruana fácil", "ceviche
          pucallpa", etc.). El título visual de RecetarioClient es un <h2>
          (jerarquía limpia H1→H2→H3, sin H1 duplicado).
        */}
        <h1 className="sr-only">
          Recetas peruanas con ingredientes de bodega — Recetario Buleje Ciudad Constitución
        </h1>
        <RecetarioClient heroBanners={heroBanners} />
      </main>
    </>
  );
}
