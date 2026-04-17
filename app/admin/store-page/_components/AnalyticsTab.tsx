"use client";

import { useEffect, useState } from "react";
import { Loader2, TrendingUp, Eye, Target, Percent } from "lucide-react";

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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-center text-gray-500 py-12">Sin datos</div>;
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
      <section className="p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <h3 className="font-bold">Visitas últimos 30 días</h3>
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
                  className="bg-emerald-500 rounded-t hover:bg-emerald-600 transition-colors"
                  style={{ height: `${h}%`, minHeight: "2px" }}
                />
                {d.conversions > 0 && (
                  <div
                    className="bg-green-500 rounded-t"
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
        <div className="flex justify-between mt-2 text-[10px] text-gray-400 font-mono">
          <span>{data.visitsByDay[0]?.day}</span>
          <span>
            {data.visitsByDay[data.visitsByDay.length - 1]?.day}
          </span>
        </div>
      </section>

      {/* Top referrers + utm */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <h3 className="font-bold mb-3">Top referrers (30d)</h3>
          {data.topReferrers.length === 0 ? (
            <p className="text-sm text-gray-500">Sin datos</p>
          ) : (
            <ul className="space-y-2">
              {data.topReferrers.map((r) => (
                <li
                  key={r.referrer}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate max-w-[70%]">{r.referrer}</span>
                  <span className="font-mono font-bold text-emerald-600">
                    {r.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <h3 className="font-bold mb-3">Top UTM sources (30d)</h3>
          {data.topUtmSources.length === 0 ? (
            <p className="text-sm text-gray-500">Sin datos</p>
          ) : (
            <ul className="space-y-2">
              {data.topUtmSources.map((r) => (
                <li
                  key={r.source}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{r.source}</span>
                  <span className="font-mono font-bold text-emerald-600">
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
    teal: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    blue: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  };
  return (
    <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colors[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
