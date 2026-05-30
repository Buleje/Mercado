"use client";

/**
 * app/admin/_hooks/useAdminAuth.ts
 *
 * Hook que maneja la autenticación inicial del panel admin:
 *  - userRole, userName, authReady
 *  - savedRolePerms (overrides de RBAC del tenant)
 *  - storeMode (modo de tienda: whatsapp / proveedor / delivery)
 *
 * Flujo:
 *  1. Fetch /api/settings → mode + rolePermissions
 *  2. Fetch /api/auth/me → role + username (autoritativo)
 *  3. Si /api/auth/me falla, intentar bypass admin si está habilitado
 *  4. Si todo falla, ejecutar el callback onUnauth (típicamente router.push a login)
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useEffect, useState } from "react";
import { cachedJson } from "@/lib/client-cache-fetch";
import type { StoreMode } from "@/lib/jsondb";

export type AdminRole = "admin" | "cajero" | "almacenero";

export interface UseAdminAuthResult {
  userRole: AdminRole;
  userName: string;
  authReady: boolean;
  savedRolePerms: Record<string, string[]> | null;
  storeMode: StoreMode;
  setStoreModeState: (mode: StoreMode) => void;
}

interface SettingsResponse {
  mode?: StoreMode;
  rolePermissions?: Record<string, string[]>;
  adminBypassLogin?: boolean;
}

interface AuthMeResponse {
  role?: AdminRole;
  username?: string;
}

interface BypassResponse {
  role: AdminRole;
  name?: string;
}

/**
 * Carga la sesión admin al montar y expone el estado de auth.
 *
 * @param onUnauth — callback ejecutado si no hay sesión válida ni bypass
 *                   (típicamente router.push("/admin/login"))
 */
export function useAdminAuth(onUnauth: () => void): UseAdminAuthResult {
  const [userRole, setUserRole] = useState<AdminRole>("admin");
  const [userName, setUserName] = useState("Admin");
  const [authReady, setAuthReady] = useState(false);
  const [savedRolePerms, setSavedRolePerms] = useState<Record<string, string[]> | null>(null);
  const [storeMode, setStoreModeState] = useState<StoreMode>("whatsapp");

  useEffect(() => {
    // 1. Settings (mode + role permissions overrides) — cachedJson colapsa el
    // doble-invoke de StrictMode (dev). Perf 2026-05-29.
    cachedJson<SettingsResponse>("/api/settings", 30_000)
      .then((d) => {
        if (!d) return;
        if (d.mode) setStoreModeState(d.mode);
        if (d.rolePermissions) setSavedRolePerms(d.rolePermissions);
      })
      .catch(() => {});

    // 2. Auth me (autoritativo) — ahora devuelve 200 con role:null si no hay sesion.
    // cachedJson: comparte 1 /api/auth/me con use-admin-notifications + colapsa el
    // doble-invoke de StrictMode (dev). null = !ok → cae al fallback. Perf 2026-05-29.
    cachedJson<AuthMeResponse>("/api/auth/me", 60_000)
      .then((d) => {
        if (!d?.role) throw new Error("no-session");
        setUserRole(d.role);
        setUserName(d.username ?? "admin");
        setAuthReady(true);
      })
      .catch(() => {
        // 3. Fallback: admin bypass (solo si el tenant lo permite)
        fetch("/api/settings")
          .then((r) => (r.ok ? r.json() : null))
          .then((s: SettingsResponse | null) => {
            if (!s?.adminBypassLogin) throw new Error("no bypass");
            return fetch("/api/auth/bypass", { method: "POST" })
              .then((r) => {
                if (!r.ok) throw new Error("bypass failed");
                return r.json() as Promise<BypassResponse>;
              })
              .then((d) => {
                setUserRole(d.role);
                setUserName(d.name ?? "invitado");
                setAuthReady(true);
              });
          })
          .catch(onUnauth);
      });
  }, [onUnauth]);

  return {
    userRole,
    userName,
    authReady,
    savedRolePerms,
    storeMode,
    setStoreModeState,
  };
}
