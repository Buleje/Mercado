"use client";

import { AlertCircle, Info } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DateRange } from "@/components/admin/inicio/DashboardDateRange";
import { ListaDeAlertas } from "./ListaDeAlertas";
import { useOverview } from "./use-overview";

/**
 * DashboardAlertsList — el bloque «Alertas accionables» de Inicio, al lado de
 * «Meta del mes» (InicioDashboardV2). Comparte el pedido a /api/admin/overview
 * con TodayHub (`useOverview`).
 */
export function DashboardAlertsList({ dateRange, className }: { dateRange?: DateRange; className?: string }) {
  const { data } = useOverview(dateRange);

  if (!data || data.alerts.length === 0) {
    return (
      <section
        className={cn(
          "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6 h-full flex flex-col",
          className,
        )}
        aria-labelledby="alerts-empty-title"
      >
        <p
          id="alerts-empty-title"
          className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2 inline-flex items-center gap-2"
        >
          <Info className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          Alertas accionables
        </p>
        <div className="flex-1 flex items-center justify-center text-center py-4">
          <p className="text-base font-semibold text-[var(--text-secondary)]">Sin alertas. Todo en orden.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden h-full flex flex-col",
        className,
      )}
      aria-labelledby="alerts-side-title"
    >
      <header className="px-5 sm:px-6 py-4 border-b border-[var(--rule-soft)] flex items-center justify-between gap-3 shrink-0">
        <p
          id="alerts-side-title"
          className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] inline-flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 text-[var(--data-warning-500)]" strokeWidth={2.5} aria-hidden />
          Alertas accionables
        </p>
        <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)] text-xs font-extrabold tabular-nums">
          {data.alerts.length}
        </span>
      </header>
      {/* Con el catálogo y los pedidos olvidados entran hasta 7 avisos: el tope
          de 256 px los cortaba en 4; 384 px deja ver todos sin estirar la fila. */}
      <ListaDeAlertas alerts={data.alerts} tamano="amplio" className="flex-1 overflow-y-auto max-h-96" />
    </section>
  );
}
