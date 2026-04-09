import type { Metadata } from "next";
import { Suspense } from "react";
import { ApiDocsPage } from "@/components/ApiDocsPage";

export const metadata: Metadata = {
  title: "API Docs — Buleje",
  description:
    "Documentación interactiva de la API REST de Buleje. Explora endpoints de productos, clientes, pedidos, inventario y autenticación.",
  robots: { index: true, follow: true },
};

// Next 16 cacheComponents: uncached async data inside ApiDocsPage requires a
// Suspense boundary to allow partial prerendering. Sin boundary, el build
// falla con "Uncached data accessed outside of <Suspense>". Ver ADR-019.
export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Cargando docs…</div>}>
      <ApiDocsPage />
    </Suspense>
  );
}
