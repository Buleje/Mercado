"use client";

/**
 * Las piezas visibles de los avisos de movimiento en la cabecera
 * (`use-avisos-camaras.ts`): el contador sobre el ícono de Cámaras (y sobre
 * «Accesos» cuando Cámaras no está a la vista) y la fila «Silenciar 1 h» del
 * menú de accesos.
 */
import { BellOff, BellRing } from "@buleje/design-system/icons";
import { horaLima } from "@/lib/camaras/avisos-segundo-plano";
import { cn } from "@/lib/utils";
import { reactivarAvisosCamaras, silenciarAvisosCamaras } from "./use-avisos-camaras";

/**
 * Coral vivo con número oscuro en los dos temas (medido 10-10): el `-700` con
 * blanco daba 3,3:1 en oscuro, y el `-ink` con blanco (13:1) casi no se veía
 * sobre la cabecera oscura del panel.
 */
export const TONO_CONTADOR =
  "bg-[var(--data-warning-500)] text-[var(--text-primary)] dark:text-[var(--surface-canvas)]";

/** Número sobre un botón de 48 px (como el de la campana, a 14 px). */
export function ContadorAvisos({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span
      aria-hidden
      data-contador-avisos-camaras={n}
      className={cn(
        "pointer-events-none absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-sm font-bold leading-none tabular-nums shadow-[var(--shadow-sm)]",
        TONO_CONTADOR,
        className,
      )}
    >
      {n > 9 ? "9+" : n}
    </span>
  );
}

/** «Silenciar avisos 1 h» / «En silencio hasta 15:05 · Reactivar», dentro del menú de accesos. */
export function FilaSilencioAvisos({ silencioHasta }: { silencioHasta: number }) {
  const silenciado = silencioHasta > Date.now();
  return (
    <button
      type="button"
      role="menuitem"
      onClick={silenciado ? reactivarAvisosCamaras : silenciarAvisosCamaras}
      title="Los avisos de movimiento de las cámaras que miran en segundo plano (la burbuja)"
      className="mt-1 flex h-12 w-full items-center gap-2 rounded-xl px-2.5 text-left text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      {silenciado ? (
        <BellRing className="h-5 w-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
      ) : (
        <BellOff className="h-5 w-5 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 flex-1 leading-tight">
        {silenciado
          ? `Avisos de movimiento en silencio hasta las ${horaLima(silencioHasta)} · Reactivar`
          : "Silenciar avisos de movimiento 1 h"}
      </span>
    </button>
  );
}
