import { AlertTriangle } from "@buleje/design-system/icons";
import SuperadminChartCard from "@/components/superadmin/_shared/SuperadminChartCard";
import type { StockoutSignal } from "./intelligence-shared";

/** Productos que más bodegas reportan sin stock. */
export default function DemandaQuiebresSection({
  hotspots,
  period,
}: {
  hotspots: StockoutSignal[];
  period: string;
}) {
  return (
    <SuperadminChartCard
      kicker="Quiebres de stock"
      title="Quiebres más extendidos"
      info="Productos que más bodegas reportan sin stock — coordinar reposición urgente."
      period={period}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--rule-base)] text-[var(--text-tertiary)] text-xs font-bold uppercase tracking-wider">
              <th className="text-left px-0 py-2 w-full">Producto</th>
              <th className="text-left px-4 py-2 whitespace-nowrap">Categoría</th>
              <th className="text-right px-0 py-2 whitespace-nowrap">Bodegas sin stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {hotspots.map((s) => (
              <tr key={s.name} className="hover:bg-[var(--surface-sunken)] transition-colors">
                <td className="py-3 pr-4">
                  <span className="font-semibold text-[var(--text-primary)]">{s.name}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-[var(--text-secondary)]">{s.category ?? "—"}</span>
                </td>
                <td className="py-3 text-right">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--data-error-500,#dc2626)]/10 text-xs font-bold text-[var(--data-error-500,#dc2626)]">
                    <AlertTriangle className="w-3 h-3" aria-hidden />
                    {s.tenantCount} {s.tenantCount === 1 ? "bodega" : "bodegas"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SuperadminChartCard>
  );
}
