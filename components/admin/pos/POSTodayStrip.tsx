"use client";

import { Receipt, TrendingUp } from "@buleje/design-system/icons";
import { fmt } from "@/components/admin/pos/pos-shared";
import { etiquetaMedio, useResumenHoy } from "@/components/admin/pos/use-resumen-hoy";

// ── Feature 1: Resumen de hoy (strip compacto, read-only) ───────────────────
// Las cifras llegan sumadas del servidor (GET /api/sales/resumen-hoy, día de
// Lima): antes se bajaban hasta 1.000 ventas con sus ítems para sumarlas acá.
// Si falla o carga, el strip se oculta o muestra skeleton — nunca rompe el POS.

export default function POSTodayStrip({ refreshKey = 0 }: { refreshKey?: number }) {
  // refreshKey sube con cada venta: «Hoy» ya no se queda en la cifra del arranque
  const state = useResumenHoy(refreshKey);

  // Si falla, no mostrar nada (no romper el POS)
  if (state.estado === "error") return null;

  const r = state.estado === "ok" ? state.resumen : null;
  const detalle = r
    ? [
        r.alcance === "tuyas" ? "Solo tus ventas de hoy" : "Ventas de hoy del local",
        ...r.porMedio.map((m) => `${etiquetaMedio(m.medio)}: ${fmt(m.monto)}`),
      ].join(" · ")
    : undefined;

  return (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden" title={detalle} data-resumen-hoy>
      {!r ? (
        /* Skeleton sutil mientras carga */
        <>
          {[56, 72, 60].map((w, i) => (
            <div
              key={i}
              className="h-3.5 rounded bg-[var(--rule-soft)] dark:bg-card-border animate-pulse"
              style={{ width: w }}
            />
          ))}
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5 shrink-0">
            <Receipt className="h-3.5 w-3.5 text-[var(--text-tertiary)] max-sm:hidden" aria-hidden />
            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Hoy:</span>
            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)]">
              {r.ventas} venta{r.ventas !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="h-3 w-px bg-[var(--rule-base)] dark:bg-card-border shrink-0" aria-hidden />
          <div className="flex items-center gap-1 shrink-0">
            <TrendingUp className="h-3.5 w-3.5 text-[var(--data-success-500)]" aria-hidden />
            <span className="text-[length:var(--ts-2xs)] font-extrabold text-[var(--data-success-500)]">
              {fmt(r.total)}
            </span>
          </div>
          {r.ventas > 0 && (
            <span className="hidden xl:contents">
              <div className="h-3 w-px bg-[var(--rule-base)] dark:bg-card-border shrink-0" aria-hidden />
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Ticket prom.:</span>
                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
                  {fmt(r.ticketPromedio)}
                </span>
              </div>
            </span>
          )}
        </>
      )}
    </div>
  );
}
