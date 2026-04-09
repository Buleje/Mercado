import type { Metadata } from "next";
import { connection } from "next/server";
import { ApiDocsPage } from "@/components/ApiDocsPage";

export const metadata: Metadata = {
  title: "API Docs — Buleje",
  description:
    "Documentación interactiva de la API REST de Buleje. Explora endpoints de productos, clientes, pedidos, inventario y autenticación.",
  robots: { index: true, follow: true },
};

// Next 16 Cache Components (cacheComponents: true): el Client Component
// `ApiDocsPage` (476 líneas con useState multi-nivel) no es clasificable
// por el analizador estático de PPR, lo que produce el error "Uncached data
// accessed outside of <Suspense>" incluso con wrapper Suspense.
//
// Solución: marcar la ruta como dinámica via `await connection()` en el Page
// Server Component. Esto opt-out del prerender estático y renderiza on-demand,
// manteniendo el comportamiento original (página pública de docs, interactiva).
// No perdemos performance real: la página ya es 100% CSR-interactive.
// Ver ADR-019 (2026-04-09).
export default async function Page() {
  await connection();
  return <ApiDocsPage />;
}
