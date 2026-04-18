"use client";

/**
 * components/admin/AdminImpersonationBanner.tsx
 *
 * Banner editorial discreto fijado en el top que se muestra cuando un
 * SuperAdmin esta impersonando un tenant. Reemplaza el warning stripe
 * amarillo saturado por un diseno minimalista estilo Holded/Buleje:
 *   - fondo sutilmente tenido de warning (color-mix 8%)
 *   - tipografia en colores semanticos del design system
 *   - boton "Salir" outline (no inverse), alineado con el resto del admin
 *
 * Requisito: mantener posicion fixed top-0 inset-x-0 z-50 (se monta sobre
 * el shell admin y empuja el contenido via padding en el layout).
 */

import { LogOut, Shield } from "@buleje/design-system/icons";

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

  const tenant = tenantName ?? tenantSlug ?? "tienda";

  return (
    <div
      className="fixed top-0 inset-x-0 z-50 h-10 border-b border-[var(--rule-base)]"
      style={{
        // fondo canvas con un 8% de tinte warning para diferenciarse sin gritar
        background:
          "color-mix(in oklch, var(--data-warning) 8%, var(--surface-canvas))",
      }}
      role="status"
      aria-live="polite"
    >
      <div className="h-full max-w-screen-2xl mx-auto px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Shield
            className="w-3.5 h-3.5 shrink-0 text-[var(--data-warning)]"
            aria-hidden="true"
          />
          <span className="text-xs text-[var(--text-primary)] truncate">
            <span className="font-semibold">Viendo como SuperAdmin</span>
            <span className="text-[var(--text-secondary)]"> &middot; </span>
            <span className="text-[var(--text-secondary)] truncate">
              {tenant}
            </span>
          </span>
        </div>

        <button
          type="button"
          onClick={onExit}
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--rule-base)] bg-transparent text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <LogOut className="w-3 h-3" aria-hidden="true" />
          Salir
        </button>
      </div>
    </div>
  );
}
