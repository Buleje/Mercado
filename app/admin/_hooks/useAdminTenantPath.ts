"use client";

/**
 * app/admin/_hooks/useAdminTenantPath.ts
 *
 * Detecta el prefijo tenant desde la URL (ej. `/t/luis/admin` → `/t/luis`)
 * y expone un helper `adminPath(path)` para construir enlaces que conservan
 * el slug multi-tenant en todas las navegaciones client-side.
 *
 * Además expone `handleLogout` porque depende del mismo prefix y siempre
 * se usa junto a `adminPath`. Extraído de app/admin/page.tsx en el Sprint A
 * final del refactor.
 */

import { useCallback, useMemo } from "react";
import type { useRouter } from "next/navigation";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";

type AppRouter = ReturnType<typeof useRouter>;

export interface UseAdminTenantPathResult {
  tenantPrefix: string;
  adminPath: (path: string) => string;
  handleLogout: () => Promise<void>;
  onUnauth: () => void;
}

export function useAdminTenantPath(router: AppRouter): UseAdminTenantPathResult {
  const tenantPrefix = useMemo(() => {
    if (typeof window === "undefined") return "";
    const match = window.location.pathname.match(/^(\/t\/[^/]+)\/admin/);
    return match ? match[1] : "";
  }, []);

  const adminPath = useCallback(
    (path: string) => `${tenantPrefix}${path}`,
    [tenantPrefix],
  );

  const handleLogout = useCallback(async () => {
    // Si el logout del servidor falla igual se sale de la sesión del cliente,
    // pero se deja rastro: un logout que no cerró la cookie es un incidente.
    await fetch("/api/auth/logout", { method: "POST", headers: csrfHeaders() }).catch((err) =>
      logger.error("[useAdminTenantPath] logout failed", { error: String(err) }),
    );
    router.push(adminPath("/admin/login"));
  }, [router, adminPath]);

  const onUnauth = useCallback(() => {
    router.push(adminPath("/admin/login"));
  }, [router, adminPath]);

  return { tenantPrefix, adminPath, handleLogout, onUnauth };
}
