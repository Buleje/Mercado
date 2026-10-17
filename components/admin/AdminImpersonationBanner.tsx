"use client";

/**
 * components/admin/AdminImpersonationBanner.tsx
 *
 * Franja de la «vista de tienda» del superadmin (11-10): sólo cuando la sesión
 * del panel es una suplantación (lo confirma el servidor, ver
 * `useSuplantacionActiva`). Dice qué negocio se está viendo, cuántos minutos le
 * quedan a la vista (10 en total) y ofrece «Salir», que cierra la suplantación
 * y vuelve al superadmin. Antes no había forma de salir desde el panel.
 *
 * `sticky top-0` de 56 px encima del AdminTopHeader (que baja a `top-14` con la
 * franja activa): las dos quedan fijas al hacer scroll. A 400 px se acorta a
 * «Musa · quedan N min» para que el botón de 48 px entre en una sola fila.
 */

import { LogOut, Shield } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";

export interface AdminImpersonationBannerProps {
  /** Nombre del negocio que se está viendo (o su slug si aún no cargó). */
  negocio: string;
  minutos: number;
  saliendo: boolean;
  onSalir: () => void;
}

export function AdminImpersonationBanner({ negocio, minutos, saliendo, onSalir }: AdminImpersonationBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-franja-suplantacion=""
      className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-[var(--rule-base)] bg-[color-mix(in_oklab,var(--data-warning)_10%,var(--surface-raised))] px-4 sm:px-6"
    >
      <Shield className="h-4 w-4 shrink-0 text-[var(--data-warning)]" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">
        <span className="hidden sm:inline">Estás viendo </span>
        <span className="font-semibold">{negocio}</span>
        <span className="hidden sm:inline"> como superadmin</span>
        <span className="text-[var(--text-secondary)]"> · quedan {minutos} min</span>
      </p>
      <Button variant="secondary" onClick={onSalir} disabled={saliendo} className="shrink-0 gap-2">
        <LogOut className="h-4 w-4" aria-hidden="true" />
        {saliendo ? "Saliendo…" : "Salir"}
      </Button>
    </div>
  );
}
