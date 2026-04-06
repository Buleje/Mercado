"use client";

/**
 * components/admin/AdminImpersonationBanner.tsx
 *
 * Banner amarillo fijo en el top que se muestra cuando un SuperAdmin
 * está impersonando un tenant. Incluye botón "Salir" que llama a
 * `onExit` (típicamente removeImpersonation + redirect a /superadmin).
 *
 * Extraído de app/admin/page.tsx (Paso 5 del refactor — JSX components).
 */

import { LogOut, Shield } from "lucide-react";

export interface AdminImpersonationBannerProps {
  visible: boolean;
  tenantName: string | null;
  tenantSlug: string | null;
  onExit: () => void;
}

export function AdminImpersonationBanner({
  visible,
  tenantName,
  tenantSlug,
  onExit,
}: AdminImpersonationBannerProps) {
  if (!visible) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-white text-xs font-semibold flex items-center justify-center gap-3 h-10 px-4">
      <Shield className="w-3.5 h-3.5 shrink-0" />
      <span>
        Viendo como SuperAdmin —{" "}
        <span className="font-bold">{tenantName ?? tenantSlug ?? "tienda"}</span>
      </span>
      <button
        type="button"
        onClick={onExit}
        className="ml-3 flex items-center gap-1 bg-white/20 hover:bg-white/30 transition-colors rounded-md px-2.5 py-0.5 text-xs font-bold"
      >
        <LogOut className="w-3 h-3" />
        Salir
      </button>
    </div>
  );
}
