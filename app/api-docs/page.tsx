import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import ApiDocsClientWrapper from "@/components/ApiDocsClientWrapper";

export const metadata: Metadata = {
  title: "API Docs — Buleje",
  description:
    "Documentación interactiva de la API REST de Buleje. Explora endpoints de productos, clientes, pedidos, inventario y autenticación.",
  robots: { index: true, follow: true },
};

/**
 * Next 16 Cache Components canonical pattern para contenido dinámico
 * con shell estático:
 *
 * 1. Page() síncrona renderiza un shell + <Suspense> boundary
 * 2. Dentro del Suspense: componente async con `await connection()`
 *    que hace opt-out del prerender estático
 * 3. El connection() bail-out marca el árbol como dinámico permitiendo
 *    que Next lo renderice on-demand sin análisis estático exhaustivo
 * 4. El ApiDocsClientWrapper internamente usa dynamic(ssr:false) para
 *    skip total del server-side render del Client Component de 476 líneas
 *
 * Intento #5 (ver ADR-019 ampliado 4x). Los 4 anteriores:
 *   1. Suspense sólo → no funcionó
 *   2. await connection() sólo en Server Comp → no funcionó
 *   3. dynamic(ssr:false) en Server Comp → rechazado por Next 16
 *   4. Client wrapper con dynamic(ssr:false) → no funcionó solo
 */
async function ApiDocsDynamicGate() {
  await connection();
  return <ApiDocsClientWrapper />;
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-muted">
          Cargando documentación de la API…
        </div>
      }
    >
      <ApiDocsDynamicGate />
    </Suspense>
  );
}
