import { AlertTriangle } from "@buleje/design-system/icons";
import SuperadminChartCard from "@/components/superadmin/_shared/SuperadminChartCard";
import { fmtPct, type UnmetDemand } from "./intelligence-shared";

/** Categorías que suben en ventas mientras varias bodegas quiebran stock (sección destacada). */
export default function DemandaInsatisfechaSection({
  items,
  period,
}: {
  items: UnmetDemand[];
  period: string;
}) {
  return (
    <SuperadminChartCard
      kicker="Oportunidad de negocio"
      title="Demanda insatisfecha"
      info="Estas categorías suben en ventas pero varias bodegas están quebrando stock. Son tu próxima oportunidad de abastecimiento."
      period={period}
      className="border-[var(--data-warning-500,#d97706)]/30 bg-[var(--data-warning-100,#fef3c7)]/10 dark:bg-[var(--surface-canvas)]"
    >
      <ul className="divide-y divide-[var(--rule-soft)]">
        {items.map((item) => (
          <li
            key={item.category}
            className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex-1 min-w-0">
              <span className="text-sm font-bold text-[var(--text-primary)]">{item.category}</span>
              <span className="ml-2 text-xs text-[var(--data-success-500,#16a34a)] font-semibold">
                {fmtPct(item.trendPct)} en ventas
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--data-error-500,#dc2626)]/10 text-xs font-semibold text-[var(--data-error-500,#dc2626)]">
                <AlertTriangle className="w-3 h-3" aria-hidden />
                {item.stockoutCount}{" "}
                {item.stockoutCount === 1 ? "bodega quebrando" : "bodegas quebrando"}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </SuperadminChartCard>
  );
}
