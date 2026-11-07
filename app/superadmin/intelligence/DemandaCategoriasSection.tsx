import { TrendingUp, TrendingDown } from "@buleje/design-system/icons";
import SuperadminChartCard from "@/components/superadmin/_shared/SuperadminChartCard";
import { fmtUnits, fmtPct, type CategoryDemand } from "./intelligence-shared";

// ── Bar visual (porcentaje relativo al máximo) ────────────────────────────────

function MiniBar({ value, max, tone }: { value: number; max: number; tone: "success" | "error" }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const bg =
    tone === "success"
      ? "bg-[var(--data-success-500,#16a34a)]"
      : "bg-[var(--data-error-500,#dc2626)]";
  return (
    <div className="h-1.5 w-full rounded-full bg-[var(--surface-sunken)] overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${bg}`}
        style={{ width: `${pct}%` }}
        role="presentation"
      />
    </div>
  );
}

/** Dos tarjetas lado a lado: categorías en alza y a la baja. */
export default function DemandaCategoriasSection({
  rising,
  falling,
  period,
}: {
  rising: CategoryDemand[];
  falling: CategoryDemand[];
  period: string;
}) {
  const maxRisingUnits = Math.max(...rising.map((c) => c.units), 1);
  const maxFallingUnits = Math.max(...falling.map((c) => c.units), 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Alza */}
      <SuperadminChartCard
        kicker="Categorías"
        title="Demanda en alza"
        info="Categorías que más crecen en unidades vendidas."
        period={period}
      >
        {rising.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)] py-4 text-center">
            Sin categorías en alza para este período.
          </p>
        ) : (
          <ul className="space-y-3">
            {rising.map((cat) => (
              <li key={cat.category} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <TrendingUp
                      className="w-4 h-4 shrink-0 text-[var(--data-success-500,#16a34a)]"
                      aria-hidden
                    />
                    <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                      {cat.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-[var(--text-tertiary)] tabular-nums">
                      {fmtUnits(cat.units)} uds
                    </span>
                    <span className="text-xs font-bold text-[var(--data-success-500,#16a34a)] tabular-nums">
                      {fmtPct(cat.trendPct)}
                    </span>
                  </div>
                </div>
                <MiniBar value={cat.units} max={maxRisingUnits} tone="success" />
              </li>
            ))}
          </ul>
        )}
      </SuperadminChartCard>

      {/* Baja */}
      <SuperadminChartCard
        kicker="Categorías"
        title="Demanda a la baja"
        info="Categorías con menos movimiento que el período anterior."
        period={period}
      >
        {falling.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)] py-4 text-center">
            Sin categorías a la baja para este período.
          </p>
        ) : (
          <ul className="space-y-3">
            {falling.map((cat) => (
              <li key={cat.category} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <TrendingDown
                      className="w-4 h-4 shrink-0 text-[var(--data-error-500,#dc2626)]"
                      aria-hidden
                    />
                    <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                      {cat.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-[var(--text-tertiary)] tabular-nums">
                      {fmtUnits(cat.units)} uds
                    </span>
                    <span className="text-xs font-bold text-[var(--data-error-500,#dc2626)] tabular-nums">
                      {fmtPct(cat.trendPct)}
                    </span>
                  </div>
                </div>
                <MiniBar value={cat.units} max={maxFallingUnits} tone="error" />
              </li>
            ))}
          </ul>
        )}
      </SuperadminChartCard>
    </div>
  );
}
