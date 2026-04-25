"use client";

import { LoadingState } from "@buleje/design-system";
import { useEffect, useState } from "react";
import {
  TrendingUp,
  Eye,
  Target,
  Percent,
  BarChart3,
  Inbox,
} from "@buleje/design-system/icons";
import StatsWidget from "@/components/ui-system/StatsWidget";
import AdminTabShell from "../../_components/_shared/AdminTabShell";
import AdminEmptyState from "../../_components/_shared/AdminEmptyState";
import { ADMIN_TOKENS } from "../../_components/_shared/admin-tokens";

type Analytics = {
  visits7d: number;
  visits30d: number;
  conversions7d: number;
  conversions30d: number;
  conversionRate30d: number;
  topReferrers: { referrer: string; count: number }[];
  topUtmSources: { source: string; count: number }[];
  visitsByDay: { day: string; visits: number; conversions: number }[];
};

export default function AnalyticsTab() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/store-page/analytics");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminTabShell
      title="Métricas y desempeño"
      description="Visitas, conversiones y tendencias de tu tienda."
      icon={BarChart3}
    >
      {loading ? (
        <LoadingState />
      ) : !data ? (
        <AdminEmptyState
          icon={Inbox}
          title="Aún no hay datos"
          description="Cuando los clientes empiecen a visitar tu tienda, verás aquí sus métricas."
        />
      ) : (
        <AnalyticsContent data={data} />
      )}
    </AdminTabShell>
  );
}

function AnalyticsContent({ data }: { data: Analytics }) {
  const maxVisits = Math.max(1, ...data.visitsByDay.map((d) => d.visits));

  return (
    <>
      {/* KPIs (StatsWidget con deltas + sparkline) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatsWidget
          label="Visitas 7d"
          value={data.visits7d}
          previousValue={Math.max(1, data.visits30d - data.visits7d) / 3}
          icon={<Eye className="h-4 w-4" strokeWidth={2} />}
          subtitle="vs semana previa"
          trend={data.visitsByDay.slice(-7).map((d) => d.visits)}
        />
        <StatsWidget
          label="Visitas 30d"
          value={data.visits30d}
          icon={<Eye className="h-4 w-4" strokeWidth={2} />}
          subtitle="últimos 30 días"
          trend={data.visitsByDay.map((d) => d.visits)}
        />
        <StatsWidget
          label="Conversiones 30d"
          value={data.conversions30d}
          previousValue={data.conversions7d * 4}
          icon={<Target className="h-4 w-4" strokeWidth={2} />}
          subtitle="vs proyección semanal x4"
          trend={data.visitsByDay.map((d) => d.conversions)}
        />
        <StatsWidget
          label="Tasa conversión 30d"
          value={data.conversionRate30d}
          format="percent"
          icon={<Percent className="h-4 w-4" strokeWidth={2} />}
          variant="featured"
        />
      </div>

      {/* Visits by day chart */}
      <section className={`${ADMIN_TOKENS.cardPadded}`}>
        <div className="flex items-center gap-2">
          <TrendingUp
            className="w-4 h-4 text-[var(--data-success)]"
            strokeWidth={2}
            aria-hidden
          />
          <h3 className={ADMIN_TOKENS.headingH3}>Visitas últimos 30 días</h3>
        </div>
        <div className="flex items-end gap-1 h-32">
          {data.visitsByDay.map((d) => {
            const h = Math.round((d.visits / maxVisits) * 100);
            return (
              <div
                key={d.day}
                className="flex-1 flex flex-col justify-end gap-1 group relative"
                title={`${d.day}: ${d.visits} visitas, ${d.conversions} conversiones`}
              >
                <div
                  className="bg-[var(--accent-soft)] rounded-t hover:bg-[var(--accent-soft)] transition-colors"
                  style={{ height: `${h}%`, minHeight: "2px" }}
                />
                {d.conversions > 0 && (
                  <div
                    className="bg-[var(--accent-soft)] rounded-t"
                    style={{
                      height: `${Math.max(
                        2,
                        (d.conversions / maxVisits) * 100,
                      )}%`,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-mono">
          <span>{data.visitsByDay[0]?.day}</span>
          <span>{data.visitsByDay[data.visitsByDay.length - 1]?.day}</span>
        </div>
      </section>

      {/* Top referrers + utm */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className={`${ADMIN_TOKENS.cardPadded}`}>
          <h3 className={ADMIN_TOKENS.headingH3}>Top referrers (30d)</h3>
          {data.topReferrers.length === 0 ? (
            <p className={ADMIN_TOKENS.bodyText}>Sin datos</p>
          ) : (
            <ul className="space-y-2">
              {data.topReferrers.map((r) => (
                <li
                  key={r.referrer}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate max-w-[70%] text-[var(--text-primary)]">
                    {r.referrer}
                  </span>
                  <span className="font-mono font-bold text-[var(--data-success)]">
                    {r.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${ADMIN_TOKENS.cardPadded}`}>
          <h3 className={ADMIN_TOKENS.headingH3}>Top UTM sources (30d)</h3>
          {data.topUtmSources.length === 0 ? (
            <p className={ADMIN_TOKENS.bodyText}>Sin datos</p>
          ) : (
            <ul className="space-y-2">
              {data.topUtmSources.map((r) => (
                <li
                  key={r.source}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-[var(--text-primary)]">{r.source}</span>
                  <span className="font-mono font-bold text-[var(--data-success)]">
                    {r.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
