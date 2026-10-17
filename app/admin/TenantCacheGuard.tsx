"use client";

/**
 * TenantCacheGuard — corta la fuga de cache cross-tenant ANTES del primer
 * render de los hijos del layout admin.
 *
 * ANTES esto era un `<script dangerouslySetInnerHTML>` en el layout con la
 * lógica copiada a mano. Dos problemas reales, no cosméticos:
 *
 *   1. React 19 avisaba «Encountered a script tag while rendering React
 *      component» — y el aviso es literal: **en una navegación de cliente ese
 *      script NUNCA se ejecuta**. El superadmin que entra a impersonar desde
 *      otra pantalla del panel (sin recarga completa) se quedaba sin guard.
 *   2. La copia a mano tenía que mantenerse sincronizada con
 *      `lib/tenant-cache.ts` — el propio comentario lo pedía. Dos listas de
 *      prefijos que se desincronizan es cuestión de tiempo.
 *
 * Ahora la comprobación corre EN EL RENDER (no en un `useEffect`, que llega
 * tarde: los hijos ya leyeron localStorage) del componente que el layout pinta
 * antes que `children`. React renderiza en orden de árbol, así que el cache
 * queda limpio antes de que ningún hijo lo lea, tanto en la carga inicial como
 * en las navegaciones de cliente.
 *
 * `assertTenantOwnership()` es idempotente (compara el owner cacheado y sale
 * si no cambió), así que re-renders y el doble render de StrictMode no cuestan
 * nada.
 */

import { assertTenantOwnership } from "@/lib/tenant-cache";

export default function TenantCacheGuard() {
  // En el servidor es un no-op (la propia función corta con `typeof window`).
  assertTenantOwnership();
  return null;
}
