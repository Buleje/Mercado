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
import { setKeepAlive } from "@/lib/session-keepalive";
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
    const res = await fetch("/api/auth/logout", { method: "POST", headers: csrfHeaders() }).catch((err) => {
      logger.error("[useAdminTenantPath] logout failed", { error: String(err) });
      return null;
    });
    // Si el servidor no confirmó el cierre, las cookies pueden seguir vivas: se
    // apaga «mantener sesión activa» para que el login no vuelva a entrar solo.
    if (!res?.ok) setKeepAlive(false);
    // «Mantener sesión activa» es una preferencia de ESTE equipo y ya no se apaga
    // al salir (Brandon 2026-10-09: «se quita y tengo que volver a activarla»; salir
    // del superadmin lo apagaba también en el panel). El logout borra las cookies:
    // el resumen silencioso del login falla solo y muestra el formulario. Se apaga
    // destildando «confiar en este equipo» en el login o el switch de Ajustes.
    router.push(adminPath("/admin/login"));
  }, [router, adminPath]);

  const onUnauth = useCallback(() => {
    router.push(adminPath("/admin/login"));
  }, [router, adminPath]);

  return { tenantPrefix, adminPath, handleLogout, onUnauth };
}
