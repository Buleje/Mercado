"use client";
/**
 * ApiDocsClientWrapper
 *
 * Wrapper que usa `next/dynamic` con `{}` para cargar
 * `ApiDocsPage` (476 líneas, useState multi-nivel) 100% en el cliente.
 *
 * Contexto: Next 16 con `cacheComponents: true` no puede clasificar
 * estáticamente el árbol del Client Component durante el prerender y
 * lanza "Uncached data accessed outside of <Suspense>". La solución
 * canónica para páginas 100% CSR-interactive sin datos server es
 * `dynamic(..., {})`, pero esa opción SOLO se permite
 * dentro de un Client Component. Este wrapper existe exactamente
 * para eso: vive como Client Component y el Server Component page.tsx
 * lo importa normalmente.
 *
 * Ver ADR-019 (ampliación 4x, 2026-04-09).
 */
import dynamic from "next/dynamic";

const ApiDocsPage = dynamic(
  () => import("./ApiDocsPage").then((m) => m.ApiDocsPage),
  {
    
    loading: () => (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted">
        Cargando documentación de la API…
      </div>
    ),
  },
);

export default function ApiDocsClientWrapper() {
  return <ApiDocsPage />;
}
