"use client";

import { CardTitle, LoadingState } from "@buleje/design-system";
import { useEffect, useState } from "react";
import { Loader2, TrendingUp, Eye, Target, Percent } from "@buleje/design-system/icons";

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
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          icon={Eye}
          label="Visitas 7d"
          value={data.visits7d.toLocaleString("es-PE")}
          color="teal"
        />
        <Kpi
          icon={Eye}
          label="Visitas 30d"
          value={data.visits30d.toLocaleString("es-PE")}
          color="blue"
        />
        <Kpi
          icon={Target}
          label="Conversiones 30d"
          value={data.conversions30d.toLocaleString("es-PE")}
          color="green"
        />
        <Kpi
          icon={Percent}
          label="Tasa conversión 30d"
          value={`${data.conversionRate30d.toFixed(1)}%`}
          color="amber"
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

function Kpi({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
  color: "teal" | "blue" | "green" | "amber";
}) {
  const colors: Record<string, string> = {
    teal: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
    blue: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
    green: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
    amber: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]",
  };
  return (
    <div className="p-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colors[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-extrabold">{value}</p>
      <p className="text-xs text-[var(--text-secondary)] mt-0.5">{label}</p>
    </div>
  );
}
