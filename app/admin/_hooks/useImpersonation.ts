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
    if (!slug || slug === "main") return;

    setActiveTenantSlug(slug);

    // Fetch del nombre/logo/tipo de tienda — el proxy resuelve el tenant
    // desde la cookie de sesión (canonical ID), no desde el header.
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SettingsResponse | null) => {
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
    localStorage.removeItem("superadmin-impersonate-tenant");
    localStorage.removeItem("active-tenant-slug");
    setIsSuperAdminImpersonating(false);
    window.location.href = "/superadmin";
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
