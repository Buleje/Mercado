"use client";

/**
 * HistoryInsights — la vista "de arriba" del tab Historial: antes de la tabla
 * navegable, resume la evolución del gasto (meses con gasto, promedio mensual,
 * mes pico y acumulado) y grafica todos los meses de un vistazo. Solo lee/
 * agrega los cierres que ya devuelve PlatformExpensesDB.historyTable().
 * Brandon 2026-07-04.
 */

import { CalendarDays, Activity, Flame, Coins } from "@buleje/design-system/icons";
import { SAKpiCard } from "@/components/superadmin/_shared/SAKpiCard";
import SuperadminChartCard from "@/components/superadmin/_shared/SuperadminChartCard";
import { TrendChart } from "./TrendChart";
import { fmtPen, type HistoryMonth } from "./gastos-helpers";

export function HistoryInsights({ history }: { history: HistoryMonth[] }) {
  const withData = history.filter((h) => h.totalPen > 0);
  if (withData.length === 0) return null; // la tabla ya muestra el vacío

  const sum = withData.reduce((s, h) => s + h.totalPen, 0);
  const avg = sum / withData.length;
  const peak = withData.reduce((max, h) => (h.totalPen > max.totalPen ? h : max), withData[0]);

  // El chart lee más antiguo → más reciente (history viene al revés).
  const chrono = [...history].reverse();

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SAKpiCard label="Meses con gasto" value={String(withData.length)} icon={CalendarDays} sub="registrados" />
        <SAKpiCard label="Promedio mensual" value={fmtPen(avg)} icon={Activity} />
        <SAKpiCard
          label="Mes más caro"
          value={fmtPen(peak.totalPen)}
          icon={Flame}
          tone="warn"
          sub={peak.label}
        />
        <SAKpiCard label="Acumulado total" value={fmtPen(sum)} icon={Coins} sub={`${withData.length} meses`} />
      </div>

      <SuperadminChartCard
        kicker="Evolución"
        title="Gasto mes a mes"
        description="Todos los meses registrados; las barras claras son meses en curso o estimados."
        density="compact"
      >
        <TrendChart trend={chrono} budgetPen={null} />
      </SuperadminChartCard>
    </>
  );
}
