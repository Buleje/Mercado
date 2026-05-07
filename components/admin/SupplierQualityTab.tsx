"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";
import { useState, useMemo } from "react";
import {
  ShieldCheck, Download, Search, Eye, X, Star,
  AlertTriangle, TrendingDown, TrendingUp,
  ThumbsUp, ThumbsDown,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type QualityIncident = {
  id: string;
  date: string;
  type: "producto-dañado" | "cantidad-incorrecta" | "retraso" | "precio-errado" | "calidad-insuficiente";
  description: string;
  severity: "baja" | "media" | "alta" | "crítica";
  resolved: boolean;
};

type SupplierQuality = {
  id: string;
  name: string;
  category: string;
  onTimeDelivery: number;   // 0-100%
  qualityScore: number;     // 0-100%
  priceScore: number;       // 0-100%
  serviceScore: number;     // 0-100%
  overallScore: number;     // 0-100%
  totalOrders: number;
  lastDelivery: string;
  trend: "up" | "down" | "stable";
  incidents: QualityIncident[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const scoreColor = (s: number) =>
  s >= 80 ? "text-[var(--data-success-500)]" : s >= 60 ? "text-[var(--data-warning-600)]" : "text-[var(--data-error-600)]";

const scoreBg = (s: number) =>
  s >= 80 ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" : s >= 60 ? "bg-amber-100 dark:bg-amber-900/30" : "bg-red-100 dark:bg-red-900/30";

const severityColor: Record<string, string> = {
  baja: "text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
  media: "text-[var(--data-warning-500)] bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30",
  alta: "text-[var(--data-warning-500)] bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30",
  "crítica": "text-[var(--data-error-500)] bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30",
};

// ── Seed Data ─────────────────────────────────────────────────────────────────

const SUPPLIERS: SupplierQuality[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SupplierQualityTab() {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"overallScore" | "onTimeDelivery" | "qualityScore" | "priceScore">("overallScore");
  const [detail, setDetail] = useState<SupplierQuality | null>(null);

  const stats = useMemo(() => {
    const avgScore = Math.round(SUPPLIERS.reduce((s, sp) => s + sp.overallScore, 0) / SUPPLIERS.length);
    const excellent = SUPPLIERS.filter(sp => sp.overallScore >= 85).length;
    const atRisk = SUPPLIERS.filter(sp => sp.overallScore < 75).length;
    const openIncidents = SUPPLIERS.reduce((s, sp) => s + sp.incidents.filter(i => !i.resolved).length, 0);
    return { avgScore, excellent, atRisk, openIncidents };
  }, []);

  const sorted = useMemo(() => {
    let list = [...SUPPLIERS];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
    }
    list.sort((a, b) => b[sortField] - a[sortField]);
    return list;
  }, [search, sortField]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Calidad de Proveedores
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Scoring automático, incidencias y ranking de proveedores</p>
        </div>
        <button onClick={() => exportToCSV(SUPPLIERS.map(s => ({ proveedor: s.name, categoria: s.category, puntualidad: s.onTimeDelivery + "%", calidad: s.qualityScore + "%", precio: s.priceScore + "%", servicio: s.serviceScore + "%", general: s.overallScore + "%", pedidos: s.totalOrders, incidentes: s.incidents.length })), "calidad-proveedores")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Score promedio", value: stats.avgScore + "%", color: scoreColor(stats.avgScore), bg: scoreBg(stats.avgScore), icon: Star },
          { label: "Excelentes (≥85)", value: String(stats.excellent), color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: ThumbsUp },
          { label: "En riesgo (<75)", value: String(stats.atRisk), color: "text-[var(--data-error-500)]", bg: "bg-[var(--data-error-50)] dark:bg-red-950/30", icon: ThumbsDown },
          { label: "Incidentes abiertos", value: String(stats.openIncidents), color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30", icon: AlertTriangle },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className={cn("rounded-xl p-4 flex items-start gap-3", bg)}>
            <Icon className={cn("h-5 w-5 mt-0.5", color)} />
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{label}</p>
              <p className={cn("text-xl font-extrabold", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar proveedor o categoría..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
        </div>
        <select value={sortField} onChange={e => setSortField(e.target.value as typeof sortField)} className="px-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
          <option value="overallScore">Ranking general</option>
          <option value="onTimeDelivery">Puntualidad</option>
          <option value="qualityScore">Calidad producto</option>
          <option value="priceScore">Competitividad precio</option>
        </select>
      </div>

      {/* Ranking Table */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="text-left text-xs font-bold text-[var(--text-tertiary)] bg-gray-50 dark:bg-surface"><th className="px-2 sm:px-4 py-2 sm:py-3">#</th><th className="px-2 sm:px-4 py-2 sm:py-3">Proveedor</th><th className="px-2 sm:px-4 py-2 sm:py-3">Categoría</th><th className="px-2 sm:px-4 py-2 sm:py-3">Puntualidad</th><th className="px-2 sm:px-4 py-2 sm:py-3">Calidad</th><th className="px-2 sm:px-4 py-2 sm:py-3">Precio</th><th className="px-2 sm:px-4 py-2 sm:py-3">Servicio</th><th className="px-2 sm:px-4 py-2 sm:py-3">General</th><th className="px-2 sm:px-4 py-2 sm:py-3">Trend</th><th className="px-2 sm:px-4 py-2 sm:py-3">Incid.</th><th className="px-2 sm:px-4 py-2 sm:py-3"></th></tr></thead>
            <tbody>
              {sorted.map((s, i) => (
                <tr key={s.id} className="border-t border-[var(--rule-soft)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/20">
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-extrabold text-[var(--text-tertiary)]">{i + 1}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-primary)] dark:text-foreground">{s.name}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)]">{s.category}</td>
                  <td className={cn("px-2 sm:px-4 py-2 sm:py-3 font-bold", scoreColor(s.onTimeDelivery))}>{s.onTimeDelivery}%</td>
                  <td className={cn("px-2 sm:px-4 py-2 sm:py-3 font-bold", scoreColor(s.qualityScore))}>{s.qualityScore}%</td>
                  <td className={cn("px-2 sm:px-4 py-2 sm:py-3 font-bold", scoreColor(s.priceScore))}>{s.priceScore}%</td>
                  <td className={cn("px-2 sm:px-4 py-2 sm:py-3 font-bold", scoreColor(s.serviceScore))}>{s.serviceScore}%</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-sm font-extrabold px-2 py-0.5 rounded-full", scoreBg(s.overallScore), scoreColor(s.overallScore))}>{s.overallScore}%</span></td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3">{s.trend === "up" ? <TrendingUp className="h-4 w-4 text-[var(--data-success-500)]" /> : s.trend === "down" ? <TrendingDown className="h-4 w-4 text-[var(--data-error-500)]" /> : <span className="text-[var(--text-tertiary)]">—</span>}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3">{s.incidents.filter(inc => !inc.resolved).length > 0 && <span className="bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 text-[var(--data-error-500)] text-xs font-bold px-2 py-0.5 rounded-full">{s.incidents.filter(inc => !inc.resolved).length}</span>}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3"><button onClick={() => setDetail(s)} className="text-primary hover:underline text-xs font-bold"><Eye className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="modal-backdrop p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6 w-full max-w-lg space-y-4 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{detail.name}</CardTitle>
                <p className="text-xs text-[var(--text-tertiary)]">{detail.category} · {detail.totalOrders} pedidos · Última entrega: {detail.lastDelivery}</p>
              </div>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {[["Puntualidad", detail.onTimeDelivery], ["Calidad", detail.qualityScore], ["Precio", detail.priceScore], ["Servicio", detail.serviceScore]].map(([k, v]) => (
                <div key={k as string} className={cn("rounded-xl p-3", scoreBg(v as number))}>
                  <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{k as string}</p>
                  <p className={cn("text-lg font-extrabold", scoreColor(v as number))}>{v as number}%</p>
                </div>
              ))}
            </div>

            <div>
              <h4 className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm mb-2">Historial de Incidentes ({detail.incidents.length})</h4>
              {detail.incidents.length === 0 ? (
                <p className="text-xs text-[var(--text-tertiary)] italic">Sin incidentes registrados ✓</p>
              ) : (
                <div className="space-y-2">
                  {detail.incidents.map(inc => (
                    <div key={inc.id} className="bg-gray-50 dark:bg-surface rounded-lg p-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={cn("px-1.5 py-0.5 rounded font-bold", severityColor[inc.severity])}>{inc.severity.toUpperCase()}</span>
                        <span className="text-[var(--text-tertiary)]">{inc.date}</span>
                        <span className={cn("ml-auto text-xs font-bold", inc.resolved ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{inc.resolved ? "Resuelto" : "Abierto"}</span>
                      </div>
                      <p className="text-[var(--text-secondary)] dark:text-muted">{inc.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
