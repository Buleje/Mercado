"use client";

/**
 * Los indicadores de Guías de remisión (`useKpisPlegables`): lo que NO repiten
 * los chips de estado de la lista —las guías del mes y el transportista que
 * más lleva—. El conteo por estado vive en el filtro, una sola vez.
 */
import { CalendarDays, Truck } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { Resumen } from "./tipos";

export function useIndicadoresGuias(resumen: Resumen | null) {
  const top = resumen?.transportistasFrecuentes ?? [];
  const principal = top[0];
  const otros = top.slice(1, 4);

  const tarjeta = "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3";
  const rotulo = "text-sm font-semibold text-[var(--text-secondary)]";
  const icono = "flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]";

  const kpis = useKpisPlegables({
    claveMemoria: "guias-remision",
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: resumen == null,
    resumen: resumen ? `${resumen.totalMes} este mes${principal ? ` · ${principal.nombre}` : ""}` : undefined,
    tarjetas: [
      <div key="mes" className={tarjeta}>
        <div className="mb-1 flex items-center gap-2">
          <span className={icono}><CalendarDays className="h-4 w-4" aria-hidden /></span>
          <span className={rotulo}>Guías este mes</span>
        </div>
        <p className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{resumen?.totalMes ?? 0}</p>
      </div>,
      <div key="transportista" className={tarjeta}>
        <div className="mb-1 flex items-center gap-2">
          <span className={icono}><Truck className="h-4 w-4" aria-hidden /></span>
          <span className={rotulo}>Transportista frecuente</span>
          {otros.length > 0 && (
            <InfoTip what={otros.map((t) => `${t.nombre} (${t.count})`).join(" · ")} title="Le siguen" />
          )}
        </div>
        <p className="truncate text-lg font-extrabold text-[var(--text-primary)]">
          {principal ? `${principal.nombre} · ${principal.count}` : "Aún sin transportistas"}
        </p>
      </div>,
    ],
  });

  return { ...kpis, hayCifras: !!resumen && (resumen.totalMes > 0 || top.length > 0) };
}
