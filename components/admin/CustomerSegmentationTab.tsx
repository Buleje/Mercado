"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { useState, useEffect } from "react";
import { Users, Loader2, Search, Crown, Star, AlertTriangle, UserPlus, Moon, Send, BarChart3, TrendingUp } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { SegmentLabel, SegmentsResponse, SegmentedCustomer } from "@/app/api/analytics/segments/route";

const SEGMENT_CONFIG: Record<SegmentLabel, { label: string; icon: React.ElementType; color: string; bg: string; border: string; barColor: string }> = {
  vip:       { label: "VIP",        icon: Crown,         color: "text-[var(--data-warning)] dark:text-[var(--data-warning)]",  bg: "bg-[var(--data-warning-50)] dark:bg-yellow-950/30",   border: "border-[var(--data-warning)] dark:border-[var(--data-warning)]",  barColor: "bg-[var(--data-warning)]" },
  regular:   { label: "Regular",    icon: Star,          color: "text-[var(--data-info)] dark:text-[var(--data-info)]",        bg: "bg-[var(--data-info-50)] dark:bg-sky-950/30",          border: "border-[var(--data-info)] dark:border-[var(--data-info)]",        barColor: "bg-[var(--data-info)]" },
  nuevo:     { label: "Nuevo",      icon: UserPlus,      color: "text-[var(--data-success)] dark:text-[var(--data-success)]",bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",  border: "border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30",barColor: "bg-[var(--accent-soft)]" },
  en_riesgo: { label: "En Riesgo",  icon: AlertTriangle, color: "text-[var(--data-warning)] dark:text-[var(--data-warning)]",   bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30",      border: "border-[var(--data-warning)] dark:border-[var(--data-warning)]",   barColor: "bg-[var(--data-warning)]" },
  dormido:   { label: "Dormido",    icon: Moon,          color: "text-[var(--text-tertiary)]",      bg: "bg-gray-50 dark:bg-surface",            border: "border-[var(--rule-base)] dark:border-card-border",  barColor: "bg-gray-400" },
};

const TIER_COLORS: Record<string, string> = {
  bronce:  "bg-[var(--data-warning)] text-white",
  plata:   "bg-gray-400 text-white",
  oro:     "bg-[var(--data-warning)] text-[var(--data-warning)]",
  diamante:"bg-[var(--data-info)] text-[var(--data-info)]",
};

/** Calcula scores RFM simplificados basados en los datos disponibles */
function getRFMScores(c: SegmentedCustomer, allCustomers: SegmentedCustomer[]) {
  const maxSpent = Math.max(...allCustomers.map(x => x.totalSpent), 1);
  const maxOrders = Math.max(...allCustomers.map(x => x.orderCount), 1);

  // Recencia: 100 si compró ayer, 0 si lleva 90+ días
  const r = c.daysSinceLast === null ? 0 : Math.max(0, Math.round(100 - (c.daysSinceLast / 90) * 100));
  // Frecuencia: relativa al cliente más frecuente
  const f = Math.min(100, Math.round((c.orderCount / maxOrders) * 100));
  // Monto: relativo al mayor gastador
  const m = Math.min(100, Math.round((c.totalSpent / maxSpent) * 100));

  return { r, f, m };
}

export default function CustomerSegmentationTab() {
  const [data, setData] = useState<SegmentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeSegment, setActiveSegment] = useState<SegmentLabel | "all">("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"tabla" | "rfm">("tabla");
  const [campaignSent, setCampaignSent] = useState<SegmentLabel | null>(null);

  useEffect(() => {
    fetch("/api/analytics/segments")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: SegmentsResponse) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  if (loading) return (
    <LoadingState message="Analizando segmentos..." />
  );
  if (error || !data) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <AlertTriangle className="h-10 w-10 text-[var(--data-warning)]" />
      <p className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted">Error al cargar segmentos</p>
      <button onClick={() => { setError(false); setLoading(true); fetch("/api/analytics/segments").then(r => r.ok ? r.json() : Promise.reject()).then(d => { setData(d); setLoading(false); }).catch(() => { setError(true); setLoading(false); }); }} className="text-xs text-primary font-bold underline">Reintentar</button>
    </div>
  );

  const filtered = data.customers.filter(c => {
    const matchSeg = activeSegment === "all" || c.segment === activeSegment;
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
    return matchSeg && matchSearch;
  });

  const totalCustomers = data.customers.length;

  const handleCampaign = (seg: SegmentLabel) => {
    setCampaignSent(seg);
    setTimeout(() => setCampaignSent(null), 2500);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
          <Users className="h-6 w-6 text-primary" />Segmentación de Clientes
        </SectionTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setView("tabla")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === "tabla" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>
            <BarChart3 className="h-3.5 w-3.5 inline mr-1" />Tabla
          </button>
          <button onClick={() => setView("rfm")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === "rfm" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>
            <TrendingUp className="h-3.5 w-3.5 inline mr-1" />RFM
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9 pr-4 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-sm w-44" />
          </div>
        </div>
      </div>

      {/* Gráfico de distribución por segmento */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 sm:p-5">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground mb-3">Distribución de clientes</CardTitle>
        <div className="flex h-8 rounded-xl overflow-hidden gap-0.5">
          {(Object.keys(SEGMENT_CONFIG) as SegmentLabel[]).map(seg => {
            const count = data.counts[seg] ?? 0;
            const pct = totalCustomers > 0 ? (count / totalCustomers) * 100 : 0;
            if (pct === 0) return null;
            return (
              <div
                key={seg}
                className={cn("flex items-center justify-center transition-all cursor-pointer", SEGMENT_CONFIG[seg].barColor, activeSegment === seg ? "opacity-100 ring-2 ring-white" : "opacity-80 hover:opacity-100")}
                style={{ width: `${pct}%` }}
                onClick={() => setActiveSegment(activeSegment === seg ? "all" : seg)}
                title={`${SEGMENT_CONFIG[seg].label}: ${count} (${pct.toFixed(0)}%)`}
              >
                {pct > 8 && <span className="text-white text-[length:var(--ts-2xs)] font-extrabold">{pct.toFixed(0)}%</span>}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          {(Object.keys(SEGMENT_CONFIG) as SegmentLabel[]).map(seg => {
            const cfg = SEGMENT_CONFIG[seg];
            const Icon = cfg.icon;
            const count = data.counts[seg] ?? 0;
            return (
              <button key={seg} onClick={() => setActiveSegment(activeSegment === seg ? "all" : seg)} className={cn("flex items-center gap-1.5 text-xs font-semibold transition-opacity", activeSegment !== "all" && activeSegment !== seg ? "opacity-40" : "opacity-100")}>
                <span className={cn("w-3 h-3 rounded-full", cfg.barColor)} />
                <Icon className={cn("h-3 w-3", cfg.color)} />
                <span className="text-[var(--text-secondary)] dark:text-muted">{cfg.label}</span>
                <span className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Segment pills */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setActiveSegment("all")} className={cn("px-3 py-1.5 rounded-full text-sm font-bold border transition", activeSegment === "all" ? "bg-primary text-white border-primary" : "border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface")}>
          Todos · {totalCustomers}
        </button>
        {(Object.keys(SEGMENT_CONFIG) as SegmentLabel[]).map(seg => {
          const cfg = SEGMENT_CONFIG[seg];
          const Icon = cfg.icon;
          const count = data.counts[seg] ?? 0;
          const active = activeSegment === seg;
          return (
            <button key={seg} onClick={() => setActiveSegment(seg)} className={cn("px-3 py-1.5 rounded-full text-sm font-bold border transition flex items-center gap-1.5", active ? "bg-primary text-white border-primary" : `${cfg.bg} ${cfg.color} ${cfg.border} hover:opacity-80`)}>
              <Icon className="h-3.5 w-3.5" />{cfg.label} · {count}
            </button>
          );
        })}
      </div>

      {/* KPI cards por segmento con acción */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {(Object.keys(SEGMENT_CONFIG) as SegmentLabel[]).map(seg => {
          const cfg = SEGMENT_CONFIG[seg];
          const Icon = cfg.icon;
          const count = data.counts[seg] ?? 0;
          const pct = totalCustomers > 0 ? ((count / totalCustomers) * 100).toFixed(0) : "0";
          const isSent = campaignSent === seg;
          return (
            <div key={seg} className={cn("rounded-xl border p-4 space-y-2", cfg.bg, cfg.border)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={cn("h-5 w-5", cfg.color)} />
                  <span className={cn("text-sm font-bold", cfg.color)}>{cfg.label}</span>
                </div>
              </div>
              <p className={cn("text-3xl font-extrabold", cfg.color)}>{count}</p>
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{pct}% del total</p>
              <button
                onClick={() => handleCampaign(seg)}
                disabled={count === 0}
                className={cn("w-full mt-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[length:var(--ts-xs)] font-bold transition-all", isSent ? "bg-[var(--accent-soft)] text-white" : "bg-white/60 dark:bg-black/20 text-[var(--text-secondary)] dark:text-muted hover:bg-white dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed")}
              >
                {isSent ? <>Enviado</> : <><Send className="h-3 w-3" />Enviar campaña</>}
              </button>
            </div>
          );
        })}
      </div>

      {/* Vista tabla o RFM */}
      {view === "tabla" ? (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-gray-50 dark:bg-surface border-b border-[var(--rule-base)] dark:border-card-border">
                <tr>
                  <th className="text-left px-4 py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Cliente</th>
                  <th className="text-left px-4 py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Segmento</th>
                  <th className="text-left px-4 py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Nivel</th>
                  <th className="text-right px-4 py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Pedidos</th>
                  <th className="text-right px-4 py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Total Gastado</th>
                  <th className="text-right px-4 py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Última compra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-[var(--text-tertiary)]">No se encontraron clientes</td></tr>
                )}
                {filtered.map(c => {
                  const cfg = SEGMENT_CONFIG[c.segment];
                  const Icon = cfg.icon;
                  return (
                    <tr key={c.phone} className="hover:bg-gray-50 dark:hover:bg-surface transition">
                      <td className="px-4 py-3">
                        <p className="font-bold text-[var(--text-primary)] dark:text-foreground">{c.name}</p>
                        <p className="text-xs text-[var(--text-tertiary)]">{c.phone}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold border", cfg.bg, cfg.color, cfg.border)}>
                          <Icon className="h-3 w-3" />{cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-extrabold uppercase", TIER_COLORS[c.loyaltyTier] ?? "bg-gray-200 text-[var(--text-secondary)]")}>{c.loyaltyTier}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-[var(--text-primary)] dark:text-foreground">{c.orderCount}</td>
                      <td className="px-4 py-3 text-right font-bold text-[var(--text-primary)] dark:text-foreground">S/{c.totalSpent.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-xs">
                        {c.daysSinceLast === null ? <span className="text-[var(--text-tertiary)]">—</span> : (
                          <span className={cn(c.daysSinceLast > 60 ? "text-[var(--data-error)] font-semibold" : c.daysSinceLast > 30 ? "text-[var(--data-warning)] font-semibold" : "text-[var(--text-secondary)] dark:text-muted")}>
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
      ) : (
        /* Vista RFM */
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-10 text-[var(--text-tertiary)] bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl">No se encontraron clientes</div>
          )}
          {filtered.slice(0, 50).map(c => {
            const { r, f, m } = getRFMScores(c, data.customers);
            const cfg = SEGMENT_CONFIG[c.segment];
            return (
              <div key={c.phone} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <p className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground">{c.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{c.phone}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-extrabold uppercase", TIER_COLORS[c.loyaltyTier] ?? "bg-gray-200 text-[var(--text-secondary)]")}>{c.loyaltyTier}</span>
                    <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold border", cfg.bg, cfg.color, cfg.border)}>
                      <cfg.icon className="h-3 w-3" />{cfg.label}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Recencia", value: r, desc: c.daysSinceLast !== null ? `hace ${c.daysSinceLast}d` : "sin compras", color: r >= 70 ? "bg-[var(--accent-soft)]" : r >= 40 ? "bg-[var(--data-warning)]" : "bg-[var(--data-error)]" },
                    { label: "Frecuencia", value: f, desc: `${c.orderCount} pedidos`, color: f >= 70 ? "bg-[var(--accent-soft)]" : f >= 40 ? "bg-[var(--data-warning)]" : "bg-[var(--data-error)]" },
                    { label: "Monto", value: m, desc: `S/${c.totalSpent.toFixed(0)}`, color: m >= 70 ? "bg-[var(--accent-soft)]" : m >= 40 ? "bg-[var(--data-warning)]" : "bg-[var(--data-error)]" },
                  ].map(metric => (
                    <div key={metric.label}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted">{metric.label}</span>
                        <span className="text-[length:var(--ts-2xs)] font-extrabold text-[var(--text-primary)] dark:text-foreground">{metric.value}</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", metric.color)} style={{ width: `${metric.value}%` }} />
                      </div>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{metric.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {filtered.length > 50 && (
            <p className="text-center text-xs text-[var(--text-tertiary)] py-2">Mostrando 50 de {filtered.length} clientes</p>
          )}
        </div>
      )}
    </div>
  );
}
