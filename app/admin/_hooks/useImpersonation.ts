"use client";

/**
 * app/admin/_hooks/useImpersonation.ts
 *
 * Hook que maneja la impersonación de SuperAdmin y la información del
 * tenant activo (nombre, slug, tipo, logo).
 * Extraído de app/admin/page.tsx (Paso 4 del refactor — ver
 * docs/refactor-giant-files-plan.md).
 *
 * Detecta si el usuario actual viene de un SuperAdmin haciendo
 * "Login as tenant" leyendo `localStorage["superadmin-impersonate-tenant"]`.
 * Si hay impersonación o slug ≠ "main", llama a `/api/settings` para
 * traer el `businessName`, `logoUrl` y `storeType`/`mode` del tenant.
 *
 * Provee `handleExit()` para volver al panel `/superadmin`.
 */

import { useEffect, useState } from "react";
import { clearAllTenantCache } from "@/lib/tenant-cache";
import { cachedJson } from "@/lib/client-cache-fetch";
import { esMarketplace } from "@/lib/tenancy/negocio-por-defecto";
import { limpiarVistaSuplantada } from "@/lib/auth/suplantacion-vista";
import { salirDeVistaDeTienda } from "./useSuplantacionActiva";

export type TenantType = "tienda" | "proveedor" | "delivery";

export interface UseImpersonationResult {
  isSuperAdminImpersonating: boolean;
  activeTenantName: string | null;
  activeTenantSlug: string | null;
  activeTenantType: TenantType;
  activeTenantLogo: string | null;
  handleExit: () => void;
}

interface SettingsResponse {
  businessName?: string;
  logoUrl?: string;
  storeType?: TenantType | string;
  mode?: TenantType | string;
}

export function useImpersonation(): UseImpersonationResult {
  const [isSuperAdminImpersonating, setIsSuperAdminImpersonating] = useState(false);
  const [activeTenantName, setActiveTenantName] = useState<string | null>(null);
  const [activeTenantSlug, setActiveTenantSlug] = useState<string | null>(null);
  const [activeTenantType, setActiveTenantType] = useState<TenantType>("tienda");
  const [activeTenantLogo, setActiveTenantLogo] = useState<string | null>(null);

  useEffect(() => {
    const impersonateSlug = localStorage.getItem("superadmin-impersonate-tenant");
    const tenantSlug = localStorage.getItem("active-tenant-slug");
    const slug = impersonateSlug ?? tenantSlug;

    if (impersonateSlug) setIsSuperAdminImpersonating(true);
    if (!slug || esMarketplace(slug)) return;

    setActiveTenantSlug(slug);

    // Fetch del nombre/logo/tipo de tienda — el proxy resuelve el tenant
    // desde la cookie de sesión (canonical ID), no desde el header.
    // Misma lectura que useAdminAuth y el resto del panel (una sola clave).
    cachedJson<SettingsResponse>("/api/settings", 30_000)
      .then((d) => {
        if (!d) return;
        if (d.businessName) setActiveTenantName(d.businessName);
        if (d.logoUrl) setActiveTenantLogo(d.logoUrl);
        if (d.storeType === "proveedor" || d.mode === "proveedor") {
          setActiveTenantType("proveedor");
        } else if (d.storeType === "delivery" || d.mode === "delivery") {
          setActiveTenantType("delivery");
        } else {
          setActiveTenantType("tienda");
        }
      })
      .catch(() => {});
  }, []);

  const handleExit = () => {
    // [SEGURIDAD MULTI-TENANT] Antes de salir, borrar TODO el cache cliente
    // para que el próximo tenant no herede datos del actual.
    clearAllTenantCache();
    limpiarVistaSuplantada();
    localStorage.removeItem("active-tenant-slug");
    setIsSuperAdminImpersonating(false);
    // Salir de verdad (security 11-10): el servidor borra la cookie y ANULA el
    // token; antes sólo se volvía a /superadmin con la sesión de la tienda viva.
    // Si el servidor no confirma, se vuelve igual (la cookie vence sola a los 10 min).
    void salirDeVistaDeTienda().then((ok) => {
      if (!ok) window.location.href = "/superadmin";
    });
  };

  return {
    isSuperAdminImpersonating,
    activeTenantName,
    activeTenantSlug,
    activeTenantType,
    activeTenantLogo,
    handleExit,
  };
}
