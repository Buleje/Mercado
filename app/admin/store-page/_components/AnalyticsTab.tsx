"use client";

import { CardTitle, LoadingState } from "@buleje/design-system";
import { useEffect, useState } from "react";
import { TrendingUp, Eye, Target, Percent } from "@buleje/design-system/icons";
import StatsWidget from "@/components/ui-system/StatsWidget";

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

  if (loading) {
    return (
      <LoadingState />
    );
  }

  if (!data) {
    return <div className="text-center text-[var(--text-secondary)] py-12">Sin datos</div>;
  }

  const maxVisits = Math.max(1, ...data.visitsByDay.map((d) => d.visits));

  return (
    <div className="space-y-6">
      {/* KPIs (ronda 4: StatsWidget con deltas + sparkline opcional) */}
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
      <section className="p-5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-[var(--data-success)]" />
          <CardTitle className="font-bold">Visitas últimos 30 días</CardTitle>
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
        <div className="flex justify-between mt-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-mono">
          <span>{data.visitsByDay[0]?.day}</span>
          <span>
            {data.visitsByDay[data.visitsByDay.length - 1]?.day}
          </span>
        </div>
      </section>

      {/* Top referrers + utm */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="p-5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <CardTitle className="font-bold mb-3">Top referrers (30d)</CardTitle>
          {data.topReferrers.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Sin datos</p>
          ) : (
            <ul className="space-y-2">
              {data.topReferrers.map((r) => (
                <li
                  key={r.referrer}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate max-w-[70%]">{r.referrer}</span>
                  <span className="font-mono font-bold text-[var(--data-success)]">
                    {r.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="p-5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <CardTitle className="font-bold mb-3">Top UTM sources (30d)</CardTitle>
          {data.topUtmSources.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Sin datos</p>
          ) : (
            <ul className="space-y-2">
              {data.topUtmSources.map((r) => (
                <li
                  key={r.source}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{r.source}</span>
                  <span className="font-mono font-bold text-[var(--data-success)]">
                    {r.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

