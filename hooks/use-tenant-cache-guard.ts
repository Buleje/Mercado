"use client";

/**
 * useTenantCacheGuard — Hook que protege contra fuga de datos cross-tenant
 * en el cache de localStorage.
 *
 * Llamar en el mount del shell admin. Compara el tenant slug actual (cookie
 * `active-tenant-slug`) con el owner cacheado. Si difieren, borra todas las
 * keys conocidas que cachean data scoped al tenant.
 *
 * Ver `lib/tenant-cache.ts` para detalles del fix.
 */

import { useEffect } from "react";
import { assertTenantOwnership } from "@/lib/tenant-cache";

export function useTenantCacheGuard(): void {
  useEffect(() => {
    // Sincrónico — corre antes que useAdminPrefetch en el mismo tick
    // gracias al orden de useEffect en page.tsx.
    assertTenantOwnership();
  }, []);
}
