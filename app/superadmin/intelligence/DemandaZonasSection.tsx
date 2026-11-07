import { AlertTriangle, MapPin } from "@buleje/design-system/icons";
import SuperadminChartCard from "@/components/superadmin/_shared/SuperadminChartCard";
import { fmtUnits, type ZoneDemand } from "./intelligence-shared";

/** Unidades vendidas, categoría más pedida y quiebres por zona geográfica. */
export default function DemandaZonasSection({
  zones,
  period,
}: {
  zones: ZoneDemand[];
  period: string;
}) {
  return (
    <SuperadminChartCard
      kicker="Geografía"
      title="Demanda por zona"
      info="Unidades vendidas, categoría más pedida y quiebres detectados por zona geográfica."
      period={period}
    >
      <ul className="divide-y divide-[var(--rule-soft)]">
        {zones.map((z) => (
          <li
            key={z.zone}
            className="flex flex-col sm:flex-row sm:items-center gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <MapPin className="w-4 h-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
              <span className="text-sm font-bold text-[var(--text-primary)] truncate">
                {z.zone}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-wrap shrink-0 text-sm">
              <span className="text-[var(--text-secondary)] tabular-nums">
                <span className="font-semibold text-[var(--text-primary)]">
                  {fmtUnits(z.units)}
                </span>{" "}
                uds
              </span>
              {z.topCategory && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] text-xs font-semibold text-[var(--text-secondary)]">
                  {z.topCategory}
                </span>
              )}
              {z.stockouts > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--data-error-500,#dc2626)]/10 text-xs font-semibold text-[var(--data-error-500,#dc2626)]">
                  <AlertTriangle className="w-3 h-3" aria-hidden />
                  {z.stockouts} {z.stockouts === 1 ? "quiebre" : "quiebres"}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </SuperadminChartCard>
  );
}
