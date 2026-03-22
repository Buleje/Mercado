"use client";

import { useState, useEffect } from "react";
import { Users, Loader2, Search, Crown, Star, AlertTriangle, UserPlus, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SegmentedCustomer, SegmentLabel, SegmentsResponse } from "@/app/api/analytics/segments/route";

const SEGMENT_CONFIG: Record<SegmentLabel, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  vip:       { label: "VIP",        icon: Crown,         color: "text-yellow-700",  bg: "bg-yellow-50 dark:bg-yellow-950/30",  border: "border-yellow-300 dark:border-yellow-700" },
  regular:   { label: "Regular",    icon: Star,          color: "text-sky-700",     bg: "bg-sky-50 dark:bg-sky-950/30",        border: "border-sky-300 dark:border-sky-700" },
  nuevo:     { label: "Nuevo",      icon: UserPlus,      color: "text-emerald-700", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-300 dark:border-emerald-700" },
  en_riesgo: { label: "En Riesgo",  icon: AlertTriangle, color: "text-amber-700",   bg: "bg-amber-50 dark:bg-amber-950/30",    border: "border-amber-300 dark:border-amber-700" },
  dormido:   { label: "Dormido",    icon: Moon,          color: "text-gray-500",    bg: "bg-gray-50 dark:bg-surface",          border: "border-gray-200 dark:border-card-border" },
};

const TIER_COLORS: Record<string, string> = {
  bronce:  "bg-amber-700 text-white",
  plata:   "bg-gray-400 text-white",
  oro:     "bg-yellow-400 text-yellow-900",
  diamante:"bg-cyan-400 text-cyan-900",
};

export default function CustomerSegmentationTab() {
  const [data, setData] = useState<SegmentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSegment, setActiveSegment] = useState<SegmentLabel | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/analytics/segments")
      .then(r => r.ok ? r.json() : null)
      .then((d: SegmentsResponse | null) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!data) return <p className="text-center text-gray-400 py-12">Error al cargar segmentos.</p>;

  const filtered = data.customers.filter(c => {
    const matchSeg = activeSegment === "all" || c.segment === activeSegment;
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
    return matchSeg && matchSearch;
  });

  const totalCustomers = data.customers.length;

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
          <Users className="h-6 w-6 text-primary" />Segmentación de Clientes
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9 pr-4 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm w-52" />
        </div>
      </div>

      {/* Segment pills */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setActiveSegment("all")}
          className={cn("px-2 sm:px-4 py-1.5 sm:py-2 rounded-full text-sm font-bold border transition", activeSegment === "all" ? "bg-primary text-white border-primary" : "border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface")}
        >
          Todos · {totalCustomers}
        </button>
        {(Object.keys(SEGMENT_CONFIG) as SegmentLabel[]).map(seg => {
          const cfg = SEGMENT_CONFIG[seg];
          const Icon = cfg.icon;
          const count = data.counts[seg] ?? 0;
          const active = activeSegment === seg;
          return (
            <button
              key={seg}
              onClick={() => setActiveSegment(seg)}
              className={cn("px-2 sm:px-4 py-1.5 sm:py-2 rounded-full text-sm font-bold border transition flex items-center gap-1.5", active ? `bg-primary text-white border-primary` : `${cfg.bg} ${cfg.color} ${cfg.border} hover:opacity-80`)}
            >
              <Icon className="h-3.5 w-3.5" />{cfg.label} · {count}
            </button>
          );
        })}
      </div>

      {/* Segment summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {(Object.keys(SEGMENT_CONFIG) as SegmentLabel[]).map(seg => {
          const cfg = SEGMENT_CONFIG[seg];
          const Icon = cfg.icon;
          const count = data.counts[seg] ?? 0;
          const pct = totalCustomers > 0 ? ((count / totalCustomers) * 100).toFixed(0) : "0";
          return (
            <div key={seg} className={cn("rounded-2xl border p-4 space-y-2", cfg.bg, cfg.border)}>
              <div className="flex flex-wrap items-center gap-2">
                <Icon className={cn("h-5 w-5", cfg.color)} />
                <span className={cn("text-sm font-bold", cfg.color)}>{cfg.label}</span>
              </div>
              <p className={cn("text-3xl font-extrabold", cfg.color)}>{count}</p>
              <p className="text-xs text-gray-500 dark:text-muted">{pct}% del total</p>
            </div>
          );
        })}
      </div>

      {/* Customer Table */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 dark:bg-surface border-b border-gray-200 dark:border-card-border">
              <tr>
                <th className="text-left px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-500 dark:text-muted">Cliente</th>
                <th className="text-left px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-500 dark:text-muted">Segmento</th>
                <th className="text-left px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-500 dark:text-muted">Nivel</th>
                <th className="text-right px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-500 dark:text-muted">Pedidos</th>
                <th className="text-right px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-500 dark:text-muted">Total Gastado</th>
                <th className="text-right px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-500 dark:text-muted">Última compra</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">No se encontraron clientes</td></tr>
              )}
              {filtered.map(c => {
                const cfg = SEGMENT_CONFIG[c.segment];
                const Icon = cfg.icon;
                return (
                  <tr key={c.phone} className="hover:bg-gray-50 dark:hover:bg-surface transition">
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <p className="font-bold text-gray-900 dark:text-foreground">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.phone}</p>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold border", cfg.bg, cfg.color, cfg.border)}>
                        <Icon className="h-3 w-3" />{cfg.label}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase", TIER_COLORS[c.loyaltyTier] ?? "bg-gray-200 text-gray-600")}>{c.loyaltyTier}</span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-bold text-gray-700 dark:text-foreground">{c.orderCount}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-bold text-gray-900 dark:text-foreground">S/{c.totalSpent.toFixed(2)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-gray-500 dark:text-muted text-xs">
                      {c.daysSinceLast === null ? "—" : (
                        <span className={cn(c.daysSinceLast > 60 ? "text-red-500" : c.daysSinceLast > 30 ? "text-amber-500" : "text-gray-500 dark:text-muted")}>
                          hace {c.daysSinceLast}d
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

