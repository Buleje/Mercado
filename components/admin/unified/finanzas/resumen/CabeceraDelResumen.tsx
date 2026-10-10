"use client";

import { RefreshCw, AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import ExportButton from "@/components/admin/shared/ExportButton";
import PeriodSelector from "@/components/admin/shared/PeriodSelector";
import { StaggerItem } from "@/components/admin/finanzas/charts";

export type Periodo = "today" | "7d" | "30d" | "month";
export type Alerta = { msg: string; color: string };

/** Período, «actualizado hace…», exportar y las alertas del mes. */
export default function CabeceraDelResumen({
  period, setPeriod, minAgo, onRefresh, alertas,
}: {
  period: Periodo;
  setPeriod: (p: Periodo) => void;
  minAgo: number;
  onRefresh: () => void;
  alertas: Alerta[];
}) {
  return (
    <>
      <StaggerItem index={0}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector value={period} onChange={setPeriod} />
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <span>Actualizado hace {minAgo} min</span>
            <button onClick={onRefresh} className="p-1 h-11 w-11 flex items-center justify-center hover:bg-[var(--surface-sunken)] rounded transition-colors" title="Actualizar datos">
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
          <ExportButton />
        </div>
      </div>
      </StaggerItem>

      {/* ════════ ALERTAS INTELIGENTES ════════ */}
      {alertas.length > 0 && (
        <StaggerItem index={0}>
        <div className="flex flex-wrap gap-2">
          {alertas.map((a, i) => (
            <span key={i} className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold", a.color)}>
              <AlertTriangle className="h-3 w-3" /> {a.msg}
            </span>
          ))}
        </div>
        </StaggerItem>
      )}
    </>
  );
}
