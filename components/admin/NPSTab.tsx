"use client";

import { useState, useMemo, useEffect, startTransition } from "react";
import { Star, ThumbsUp, ThumbsDown, Minus, TrendingUp, Download, Filter, MessageSquare } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type Survey = { id: string; customer: string; score: number; comment: string; date: string; channel: "tienda" | "delivery" | "whatsapp" };
type NPSTrend = { month: string; promoters: number; passives: number; detractors: number };

/** Map 1–5 star rating to a 0–10 NPS-compatible score */
function ratingToScore(rating: number): number {
  if (rating === 5) return 10;
  if (rating === 4) return 8;
  if (rating === 3) return 6;
  if (rating === 2) return 3;
  return 1;
}

/** Infer channel from review location field */
function locationToChannel(location: string): Survey["channel"] {
  const l = (location ?? "").toLowerCase();
  if (l.includes("delivery") || l.includes("domicilio") || l.includes("envío") || l.includes("envio")) return "delivery";
  if (l.includes("whatsapp") || l.includes("wsp") || l.includes("ws ")) return "whatsapp";
  return "tienda";
}

function classify(score: number) { return score >= 9 ? "promoter" : score >= 7 ? "passive" : "detractor"; }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }

export default function NPSTab() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [trends, setTrends] = useState<NPSTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterChannel, setFilterChannel] = useState<string>("all");
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

        // Build monthly trend (last 6 months)
        const byMonth: Record<string, { promoters: number; passives: number; detractors: number }> = {};
        mapped.forEach(s => {
          const month = new Date(s.date).toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
          if (!byMonth[month]) byMonth[month] = { promoters: 0, passives: 0, detractors: 0 };
          const type = classify(s.score);
          byMonth[month][type === "promoter" ? "promoters" : type === "passive" ? "passives" : "detractors"]++;
        });
        const trendData: NPSTrend[] = Object.entries(byMonth).map(([month, v]) => ({ month, ...v })).slice(-6);

        startTransition(() => {
          setSurveys(mapped);
          setTrends(trendData);
          setLoading(false);
        });
      })
      .catch(() => startTransition(() => setLoading(false)));
  }, []);

  const filtered = useMemo(() => filterChannel === "all" ? surveys : surveys.filter(s => s.channel === filterChannel), [surveys, filterChannel]);

  const promoters = filtered.filter(s => classify(s.score) === "promoter").length;
  const passives = filtered.filter(s => classify(s.score) === "passive").length;
  const detractors = filtered.filter(s => classify(s.score) === "detractor").length;
  const nps = filtered.length > 0 ? Math.round(((promoters - detractors) / filtered.length) * 100) : 0;
  const avgScore = filtered.length > 0 ? (filtered.reduce((s, sv) => s + sv.score, 0) / filtered.length).toFixed(1) : "0";

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><Star className="h-6 w-6 text-primary" /> NPS & Satisfacción</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Net Promoter Score y análisis de satisfacción del cliente</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setView("detail")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === "detail" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>Detalle</button>
          <button onClick={() => setView("trend")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === "trend" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>Tendencia</button>
        </div>
      </div>

      {/* NPS Gauge */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="col-span-2 lg:col-span-1 bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5 text-center">
          <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">NPS Score</p>
          <p className={cn("text-4xl font-extrabold", nps >= 50 ? "text-emerald-500" : nps >= 0 ? "text-amber-500" : "text-red-500")}>{nps}</p>
          <p className="text-[10px] text-gray-400 mt-1">{nps >= 50 ? "Excelente" : nps >= 0 ? "Bueno" : "Necesita mejorar"}</p>
        </div>
        {[
          { label: "Promedio", value: avgScore, sub: "/10", color: "text-blue-500" },
          { label: "Promotores", value: promoters, sub: `(${filtered.length > 0 ? ((promoters / filtered.length) * 100).toFixed(0) : 0}%)`, color: "text-emerald-500", icon: ThumbsUp },
          { label: "Pasivos", value: passives, sub: `(${filtered.length > 0 ? ((passives / filtered.length) * 100).toFixed(0) : 0}%)`, color: "text-amber-500", icon: Minus },
          { label: "Detractores", value: detractors, sub: `(${filtered.length > 0 ? ((detractors / filtered.length) * 100).toFixed(0) : 0}%)`, color: "text-red-500", icon: ThumbsDown },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            <p className={cn("text-xl sm:text-2xl font-extrabold", k.color)}>{k.value}<span className="text-xs text-gray-400 ml-1">{k.sub}</span></p>
          </div>
        ))}
      </div>

      {/* NPS bar */}
      <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
        <div className="flex h-4 rounded-full overflow-hidden">
          {filtered.length > 0 && (
            <>
              <div className="bg-emerald-500 transition-all" style={{ width: `${(promoters / filtered.length) * 100}%` }} />
              <div className="bg-amber-400 transition-all" style={{ width: `${(passives / filtered.length) * 100}%` }} />
              <div className="bg-red-500 transition-all" style={{ width: `${(detractors / filtered.length) * 100}%` }} />
            </>
          )}
        </div>
        <div className="flex justify-between text-[10px] font-semibold mt-2">
          <span className="text-emerald-600">Promotores (9-10)</span>
          <span className="text-amber-600">Pasivos (7-8)</span>
          <span className="text-red-600">Detractores (0-6)</span>
        </div>
      </div>

      {view === "detail" ? (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-gray-400" />
            {["all", "tienda", "delivery", "whatsapp"].map(c => (
              <button key={c} onClick={() => setFilterChannel(c)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", filterChannel === c ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>{c === "all" ? "Todos" : c.charAt(0).toUpperCase() + c.slice(1)}</button>
            ))}
            <button onClick={() => exportToCSV(filtered.map(s => ({ cliente: s.customer, puntaje: s.score, tipo: classify(s.score), canal: s.channel, comentario: s.comment, fecha: fmtDate(s.date) })), "nps-encuestas")} className="ml-auto text-xs text-primary font-semibold flex items-center gap-1"><Download className="h-3 w-3" /> CSV</button>
          </div>
          <div className="space-y-2">
            {loading ? (
              <div className="text-center py-8 text-sm text-gray-400">Cargando reseñas...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8">
                <Star className="h-10 w-10 text-gray-200 dark:text-surface mx-auto mb-2" />
                <p className="text-sm font-semibold text-gray-400">Sin reseñas disponibles</p>
              </div>
            ) : filtered.map(s => {
              const type = classify(s.score);
              return (
                <div key={s.id} className={cn("bg-white dark:bg-card rounded-xl border p-4 flex items-start gap-3", type === "promoter" ? "border-emerald-200 dark:border-emerald-900/30" : type === "passive" ? "border-amber-200 dark:border-amber-900/30" : "border-red-200 dark:border-red-900/30")}>
                  <div className={cn("h-10 w-10 rounded-full flex items-center justify-center text-lg font-extrabold shrink-0", type === "promoter" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : type === "passive" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400")}>
                    {s.score}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-bold text-sm text-gray-900 dark:text-foreground">{s.customer}</span>
                      <span className="text-[10px] bg-gray-100 dark:bg-surface px-1.5 py-0.5 rounded text-gray-500 dark:text-muted">{s.channel}</span>
                      <span className="text-[10px] text-gray-400">{fmtDate(s.date)}</span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-muted flex flex-wrap items-start gap-1"><MessageSquare className="h-3 w-3 shrink-0 mt-0.5" />{s.comment}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
          <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-4 flex flex-wrap items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Evolución NPS mensual</h3>
          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-6 text-sm text-gray-400">Cargando tendencia...</div>
            ) : trends.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Sin datos históricos suficientes</p>
            ) : trends.map(t => {
              const npsVal = t.promoters - t.detractors;
              const total = t.promoters + t.passives + t.detractors || 1;
              return (
                <div key={t.month} className="flex flex-wrap items-center gap-3">
                  <span className="w-14 text-xs font-bold text-gray-500 dark:text-muted shrink-0">{t.month}</span>
                  <div className="flex-1 flex h-5 rounded-full overflow-hidden bg-gray-100 dark:bg-surface">
                    <div className="bg-emerald-500 transition-all" style={{ width: `${(t.promoters / total) * 100}%` }} />
                    <div className="bg-amber-400 transition-all" style={{ width: `${(t.passives / total) * 100}%` }} />
                    <div className="bg-red-500 transition-all" style={{ width: `${(t.detractors / total) * 100}%` }} />
                  </div>
                  <span className={cn("w-10 text-xs font-extrabold text-right", npsVal >= 50 ? "text-emerald-500" : npsVal >= 0 ? "text-amber-500" : "text-red-500")}>{npsVal > 0 ? "+" : ""}{npsVal}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
