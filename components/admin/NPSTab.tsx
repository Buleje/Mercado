"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useMemo, useEffect, startTransition } from "react";
import { Star, ThumbsUp, ThumbsDown, Minus, TrendingUp, Download, Filter, MessageSquare, Loader2, AlertTriangle } from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

type Survey = { id: string; customer: string; score: number; comment: string; date: string; channel: "tienda" | "delivery" | "whatsapp" };
type NPSTrend = { month: string; promoters: number; passives: number; detractors: number; nps: number };

function ratingToScore(rating: number): number {
  if (rating === 5) return 10;
  if (rating === 4) return 8;
  if (rating === 3) return 6;
  if (rating === 2) return 3;
  return 1;
}

function locationToChannel(location: string): Survey["channel"] {
  const l = (location ?? "").toLowerCase();
  if (l.includes("delivery") || l.includes("domicilio") || l.includes("envío") || l.includes("envio")) return "delivery";
  if (l.includes("whatsapp") || l.includes("wsp") || l.includes("ws ")) return "whatsapp";
  return "tienda";
}

function classify(score: number) { return score >= 9 ? "promoter" : score >= 7 ? "passive" : "detractor"; }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }
function fmtMonth(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { month: "short", year: "2-digit" }); }

/** Gauge SVG semicircular para el NPS score */
function NPSGauge({ nps }: { nps: number }) {
  // nps va de -100 a +100
  const normalized = (nps + 100) / 200; // 0 a 1
  const startAngle = Math.PI;
  const endAngle = 2 * Math.PI;
  const angle = startAngle + normalized * (endAngle - startAngle);

  const cx = 100, cy = 90, r = 70;
  const needleX = cx + r * Math.cos(angle);
  const needleY = cy + r * Math.sin(angle);

  const color = nps >= 50 ? "#00B4A6" : nps >= 0 ? "#f59e0b" : "#ef4444";
  const label = nps >= 50 ? "Excelente" : nps >= 20 ? "Bueno" : nps >= 0 ? "Aceptable" : "Necesita mejora";

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 110" className="w-48 h-28">
        {/* Arco rojo */}
        <path d="M 30 90 A 70 70 0 0 1 76 27" fill="none" stroke="#fecaca" strokeWidth="14" strokeLinecap="round" />
        {/* Arco amarillo */}
        <path d="M 76 27 A 70 70 0 0 1 124 27" fill="none" stroke="#fde68a" strokeWidth="14" strokeLinecap="round" />
        {/* Arco verde */}
        <path d="M 124 27 A 70 70 0 0 1 170 90" fill="none" stroke="#a7f3d0" strokeWidth="14" strokeLinecap="round" />
        {/* Aguja */}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={color} strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill={color} />
        {/* Score */}
        <text x={cx} y={cy - 10} textAnchor="middle" className="font-extrabold" fontSize="22" fontWeight="800" fill={color}>{nps > 0 ? `+${nps}` : nps}</text>
      </svg>
      <p className="text-xs font-semibold mt-0 text-[var(--text-secondary)] dark:text-muted">{label}</p>
    </div>
  );
}

export default function NPSTab() {
  const [mountTime] = useState(() => Date.now());
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterChannel, setFilterChannel] = useState<string>("all");
  const [filterPeriod, setFilterPeriod] = useState<"7d" | "30d" | "90d" | "all">("all");
  const [view, setView] = useState<"detail" | "trend">("detail");

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.reviews) return;
        const reviews = data.reviews as Array<{ id: string; name: string; location: string; text: string; rating: number; date: string }>;
        const mapped: Survey[] = reviews.map(r => ({
          id: r.id,
          customer: r.name || "Cliente anónimo",
          score: ratingToScore(r.rating),
          comment: r.text || "",
          date: r.date,
          channel: locationToChannel(r.location),
        }));
        startTransition(() => { setSurveys(mapped); setLoading(false); });
      })
      .catch(() => startTransition(() => setLoading(false)));
  }, []);

  // Filtro por período
  const periodFiltered = useMemo(() => {
    if (filterPeriod === "all") return surveys;
    const days = filterPeriod === "7d" ? 7 : filterPeriod === "30d" ? 30 : 90;
    const cutoff = mountTime - days * 86400000;
    return surveys.filter(s => new Date(s.date).getTime() >= cutoff);
  }, [surveys, filterPeriod]);

  const filtered = useMemo(() => filterChannel === "all" ? periodFiltered : periodFiltered.filter(s => s.channel === filterChannel), [periodFiltered, filterChannel]);

  const promoters   = filtered.filter(s => classify(s.score) === "promoter").length;
  const passives    = filtered.filter(s => classify(s.score) === "passive").length;
  const detractors  = filtered.filter(s => classify(s.score) === "detractor").length;
  const nps = filtered.length > 0 ? Math.round(((promoters - detractors) / filtered.length) * 100) : 0;
  const avgScore = filtered.length > 0 ? (filtered.reduce((s, sv) => s + sv.score, 0) / filtered.length).toFixed(1) : "0";

  // Tendencia mensual
  const trends: NPSTrend[] = useMemo(() => {
    const byMonth: Record<string, { promoters: number; passives: number; detractors: number }> = {};
    surveys.forEach(s => {
      const month = fmtMonth(s.date);
      if (!byMonth[month]) byMonth[month] = { promoters: 0, passives: 0, detractors: 0 };
      const type = classify(s.score);
      byMonth[month][type === "promoter" ? "promoters" : type === "passive" ? "passives" : "detractors"]++;
    });
    return Object.entries(byMonth)
      .map(([month, v]) => {
        const total = v.promoters + v.passives + v.detractors || 1;
        return { month, ...v, nps: Math.round(((v.promoters - v.detractors) / total) * 100) };
      })
      .slice(-6);
  }, [surveys]);

  const maxTrendNPS = Math.max(...trends.map(t => Math.abs(t.nps)), 1);

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2"><Star className="h-6 w-6 text-primary" /> NPS & Satisfacción</SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Net Promoter Score y análisis de satisfacción del cliente</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setView("detail")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === "detail" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>Detalle</button>
          <button onClick={() => setView("trend")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === "trend" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>Tendencia</button>
        </div>
      </div>

      {/* Gauge + KPIs principales */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Gauge grande */}
          <div className="flex flex-col items-center shrink-0">
            <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted mb-1">NPS Score</p>
            <NPSGauge nps={nps} />
            <p className="text-xs text-[var(--text-tertiary)] mt-1">{filtered.length} respuestas</p>
          </div>

          {/* Distribución visual */}
          <div className="flex-1 w-full min-w-0">
            <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted mb-2">Distribución</p>
            {filtered.length > 0 ? (
              <>
                <div className="flex h-5 rounded-full overflow-hidden mb-2">
                  <div className="bg-[var(--accent-soft)] transition-all flex items-center justify-center" style={{ width: `${(promoters / filtered.length) * 100}%` }}>
                    {(promoters / filtered.length) > 0.1 && <span className="text-white text-[length:var(--ts-2xs)] font-extrabold">{((promoters / filtered.length) * 100).toFixed(0)}%</span>}
                  </div>
                  <div className="bg-[var(--data-warning)] transition-all flex items-center justify-center" style={{ width: `${(passives / filtered.length) * 100}%` }}>
                    {(passives / filtered.length) > 0.1 && <span className="text-white text-[length:var(--ts-2xs)] font-extrabold">{((passives / filtered.length) * 100).toFixed(0)}%</span>}
                  </div>
                  <div className="bg-[var(--data-error)] transition-all flex items-center justify-center" style={{ width: `${(detractors / filtered.length) * 100}%` }}>
                    {(detractors / filtered.length) > 0.1 && <span className="text-white text-[length:var(--ts-2xs)] font-extrabold">{((detractors / filtered.length) * 100).toFixed(0)}%</span>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Promotores", value: promoters, pct: filtered.length > 0 ? ((promoters / filtered.length) * 100).toFixed(0) : "0", color: "text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: ThumbsUp, desc: "(9-10)" },
                    { label: "Pasivos",    value: passives,  pct: filtered.length > 0 ? ((passives / filtered.length) * 100).toFixed(0) : "0",  color: "text-[var(--data-warning)]",  bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/20",  icon: Minus,    desc: "(7-8)" },
                    { label: "Detract.",   value: detractors,pct: filtered.length > 0 ? ((detractors / filtered.length) * 100).toFixed(0) : "0",color: "text-[var(--data-error)]",   bg: "bg-[var(--data-error-50)] dark:bg-red-950/20",     icon: ThumbsDown,desc: "(0-6)" },
                  ].map(k => (
                    <div key={k.label} className={cn("rounded-xl p-2 text-center", k.bg)}>
                      <k.icon className={cn("h-4 w-4 mx-auto mb-1", k.color)} />
                      <p className={cn("text-lg font-extrabold", k.color)}>{k.value}</p>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted">{k.label} {k.desc}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--text-tertiary)] text-center py-4">Sin datos para este período</p>
            )}
          </div>

          {/* Score promedio */}
          <div className="flex flex-col items-center shrink-0 bg-gray-50 dark:bg-surface rounded-xl p-4 min-w-[80px]">
            <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Promedio</p>
            <p className="text-3xl font-extrabold text-[var(--data-success)]">{avgScore}</p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">/10</p>
          </div>
        </div>
      </div>

      {/* Filtros período + canal */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
        <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Período:</span>
        {(["7d", "30d", "90d", "all"] as const).map(p => (
          <button key={p} onClick={() => setFilterPeriod(p)} className={cn("px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors", filterPeriod === p ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>
            {p === "all" ? "Todo" : p}
          </button>
        ))}
        <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted ml-2">Canal:</span>
        {["all", "tienda", "delivery", "whatsapp"].map(c => (
          <button key={c} onClick={() => setFilterChannel(c)} className={cn("px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors", filterChannel === c ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>
            {c === "all" ? "Todos" : c.charAt(0).toUpperCase() + c.slice(1)}
          </button>
        ))}
        <button onClick={() => exportToCSV(filtered.map(s => ({ cliente: s.customer, puntaje: s.score, tipo: classify(s.score), canal: s.channel, comentario: s.comment, fecha: fmtDate(s.date) })), "nps-encuestas")} className="ml-auto text-xs text-primary font-semibold flex items-center gap-1">
          <Download className="h-3 w-3" /> CSV
        </button>
      </div>

      {/* Vista detalle: comentarios */}
      {view === "detail" && (
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-[var(--text-tertiary)]">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Cargando reseñas...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl">
              <Star className="h-10 w-10 text-gray-200 dark:text-surface mx-auto mb-2" />
              <p className="text-sm font-semibold text-[var(--text-tertiary)]">Sin reseñas para este filtro</p>
            </div>
          ) : filtered.map(s => {
            const type = classify(s.score);
            return (
              <div key={s.id} className={cn("bg-white dark:bg-card rounded-xl border p-4 flex items-start gap-3", type === "promoter" ? "border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30" : type === "passive" ? "border-[var(--data-warning)] dark:border-[var(--data-warning)]/30" : "border-[var(--data-error)] dark:border-[var(--data-error)]/30")}>
                <div className={cn("h-10 w-10 rounded-full flex items-center justify-center text-base font-extrabold shrink-0", type === "promoter" ? "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]" : type === "passive" ? "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]" : "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]")}>
                  {s.score}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground">{s.customer}</span>
                    <span className="text-[length:var(--ts-2xs)] bg-gray-100 dark:bg-surface px-1.5 py-0.5 rounded text-[var(--text-secondary)] dark:text-muted">{s.channel}</span>
                    <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{fmtDate(s.date)}</span>
                  </div>
                  {s.comment && (
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted flex items-start gap-1">
                      <MessageSquare className="h-3 w-3 shrink-0 mt-0.5 text-[var(--text-tertiary)]" />
                      {s.comment}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Vista tendencia */}
      {view === "trend" && (
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4 sm:p-5">
          <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Evolución NPS mensual
          </CardTitle>
          {loading ? (
            <div className="flex items-center justify-center py-6 gap-2 text-[var(--text-tertiary)]">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Cargando tendencia...</span>
            </div>
          ) : trends.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2 text-[var(--text-tertiary)]">
              <AlertTriangle className="h-8 w-8 opacity-40" />
              <p className="text-sm">Sin datos históricos suficientes</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Mini barras de NPS por mes */}
              <div className="flex items-end gap-2 h-24">
                {trends.map(t => {
                  const heightPct = Math.max(5, (Math.abs(t.nps) / maxTrendNPS) * 100);
                  const isPositive = t.nps >= 0;
                  return (
                    <div key={t.month} className="flex flex-col items-center gap-1 flex-1 min-w-0" title={`${t.month}: NPS ${t.nps}`}>
                      <span className={cn("text-[length:var(--ts-2xs)] font-extrabold", isPositive ? "text-[var(--data-success)]" : "text-[var(--data-error)]")}>{t.nps > 0 ? `+${t.nps}` : t.nps}</span>
                      <div className={cn("w-full rounded-t-lg transition-all", isPositive ? "bg-[var(--accent-soft)]" : "bg-[var(--data-error)]")} style={{ height: `${heightPct}%` }} />
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate w-full text-center">{t.month}</span>
                    </div>
                  );
                })}
              </div>

              {/* Tabla tendencia */}
              <div className="space-y-2">
                {trends.map(t => {
                  const total = t.promoters + t.passives + t.detractors || 1;
                  return (
                    <div key={t.month} className="flex items-center gap-3">
                      <span className="w-14 text-xs font-bold text-[var(--text-secondary)] dark:text-muted shrink-0">{t.month}</span>
                      <div className="flex-1 flex h-4 rounded-full overflow-hidden bg-gray-100 dark:bg-surface">
                        <div className="bg-[var(--accent-soft)] transition-all" style={{ width: `${(t.promoters / total) * 100}%` }} />
                        <div className="bg-[var(--data-warning)] transition-all" style={{ width: `${(t.passives / total) * 100}%` }} />
                        <div className="bg-[var(--data-error)] transition-all" style={{ width: `${(t.detractors / total) * 100}%` }} />
                      </div>
                      <span className={cn("w-10 text-xs font-extrabold text-right shrink-0", t.nps >= 50 ? "text-[var(--data-success)]" : t.nps >= 0 ? "text-[var(--data-warning)]" : "text-[var(--data-error)]")}>
                        {t.nps > 0 ? "+" : ""}{t.nps}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
