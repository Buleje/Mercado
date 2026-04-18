"use client";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, Play, RotateCcw, Save, Trash2, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/* ── types ──────────────────────────────────────────────────── */
type Variable = {
  id: string;
  label: string;
  baseValue: number;
  unit: "%" | "S/" | "units" | "days";
  min: number;
  max: number;
  step: number;
};

type ScenarioResult = {
  revenue: number;
  costs: number;
  profit: number;
  margin: number;
  cashFlow: number;
  breakEvenDays: number;
};

type SavedScenario = {
  id: string;
  name: string;
  overrides: Record<string, number>;
  createdAt: string;
};

/* ── base variables ─────────────────────────────────────────── */
const BASE_VARIABLES: Variable[] = [];

/* ── helpers ────────────────────────────────────────────────── */
const fmt = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

function computeScenario(overrides: Record<string, number>): ScenarioResult {
  const get = (id: string) => overrides[id] ?? BASE_VARIABLES.find(v => v.id === id)?.baseValue ?? 0;
  const dailySales = get("dailyCustomers") * get("avgTicket");
  const monthlySales = dailySales * 30;
  const growthMultiplier = 1 + get("salesGrowth") / 100;
  const revenue = monthlySales * growthMultiplier;
  const grossProfit = revenue * (get("grossMargin") / 100);
  const shrinkageLoss = revenue * (get("shrinkage") / 100);
  const costs = get("opex") + shrinkageLoss;
  const profit = grossProfit - costs;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const dailyCashIn = (revenue / 30) * (30 / Math.max(get("paymentDays"), 1));
  const cashFlow = dailyCashIn * 30 - costs;
  const breakEvenDays = profit > 0 ? Math.ceil(costs / (grossProfit / 30)) : 999;
  return { revenue, costs, profit, margin, cashFlow, breakEvenDays };
}

/* ── component ──────────────────────────────────────────────── */
export default function ScenarioSimulatorTab() {
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState<SavedScenario[]>([]);
  const [saveName, setSaveName] = useState("");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);

  const baseResult = useMemo(() => computeScenario({}), []);
  const currentResult = useMemo(() => computeScenario(overrides), [overrides]);
  const compareResult = useMemo(() => {
    if (!compareId) return null;
    const sc = saved.find(s => s.id === compareId);
    return sc ? computeScenario(sc.overrides) : null;
  }, [compareId, saved]);

  const handleChange = (id: string, value: number) => {
    setOverrides(prev => ({ ...prev, [id]: value }));
  };
  const handleReset = () => setOverrides({});
  const handleSave = () => {
    if (!saveName.trim()) return;
    setSaved(prev => [...prev, { id: `s${Date.now()}`, name: saveName.trim(), overrides: { ...overrides }, createdAt: new Date().toISOString().slice(0, 10) }]);
    setSaveName("");
    setShowSaveModal(false);
  };
  const handleDelete = (id: string) => {
    setSaved(prev => prev.filter(s => s.id !== id));
    if (compareId === id) setCompareId(null);
  };
  const handleLoad = (sc: SavedScenario) => setOverrides({ ...sc.overrides });

  const diff = (current: number, base: number) => {
    const d = current - base;
    return d;
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <SectionTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground">Simulador de Escenarios</SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-1">Modifica variables y visualiza el impacto financiero en tiempo real</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleReset} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors border border-[var(--rule-base)] dark:border-card-border">
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
          <button onClick={() => setShowSaveModal(true)} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
            <Save className="h-4 w-4" /> Guardar escenario
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
        {[
          { label: "Ingreso mensual", value: currentResult.revenue, base: baseResult.revenue, format: fmt },
          { label: "Costos totales", value: currentResult.costs, base: baseResult.costs, format: fmt },
          { label: "Utilidad neta", value: currentResult.profit, base: baseResult.profit, format: fmt },
          { label: "Margen neto", value: currentResult.margin, base: baseResult.margin, format: fmtPct },
          { label: "Flujo caja", value: currentResult.cashFlow, base: baseResult.cashFlow, format: fmt },
          { label: "Break-even", value: currentResult.breakEvenDays, base: baseResult.breakEvenDays, format: (n: number) => n >= 999 ? "N/A" : `${n} días` },
        ].map(kpi => {
          const d = diff(kpi.value, kpi.base);
          return (
            <div key={kpi.label} className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4 ">
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted font-semibold">{kpi.label}</p>
              <p className={cn("text-lg font-extrabold mt-1", kpi.value < 0 ? "text-[var(--data-error)]" : "text-[var(--text-primary)] dark:text-foreground")}>{kpi.format(kpi.value)}</p>
              {d !== 0 && (
                <div className={cn("flex items-center gap-1 text-xs font-bold mt-1", d > 0 ? (kpi.label === "Costos totales" || kpi.label === "Break-even" ? "text-[var(--data-error)]" : "text-[var(--data-success)]") : (kpi.label === "Costos totales" || kpi.label === "Break-even" ? "text-[var(--data-success)]" : "text-[var(--data-error)]"))}>
                  {d > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  <span>{d > 0 ? "+" : ""}{kpi.label === "Margen neto" ? fmtPct(d) : kpi.format(d)} vs base</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Variables sliders */}
      <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 sm:p-6 ">
        <CardTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground mb-4">Variables del negocio</CardTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {BASE_VARIABLES.map(v => {
            const current = overrides[v.id] ?? v.baseValue;
            const isModified = overrides[v.id] !== undefined;
            return (
              <div key={v.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={cn("text-sm font-semibold", isModified ? "text-primary" : "text-[var(--text-primary)] dark:text-foreground")}>{v.label}</label>
                  <span className={cn("text-sm font-bold tabular-nums", isModified ? "text-primary" : "text-[var(--text-primary)] dark:text-foreground")}>
                    {v.unit === "S/" ? fmt(current) : v.unit === "%" ? `${current}%` : v.unit === "days" ? `${current} días` : current}
                  </span>
                </div>
                <input
                  type="range"
                  min={v.min}
                  max={v.max}
                  step={v.step}
                  value={current}
                  onChange={e => handleChange(v.id, parseFloat(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-[var(--text-tertiary)] dark:text-muted">
                  <span>{v.min}{v.unit === "%" ? "%" : ""}</span>
                  <span className="text-[var(--text-secondary)] dark:text-muted font-semibold">Base: {v.baseValue}{v.unit === "%" ? "%" : ""}</span>
                  <span>{v.max}{v.unit === "%" ? "%" : ""}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Comparison vs saved */}
      {compareResult && (
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 sm:p-6 ">
          <div className="flex items-center justify-between mb-4">
            <CardTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground">Comparación con: {saved.find(s => s.id === compareId)?.name}</CardTitle>
            <button onClick={() => setCompareId(null)} className="text-sm text-[var(--text-secondary)] dark:text-muted hover:text-[var(--data-error)]">Cerrar</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-base)] dark:border-card-border">
                  <th className="text-left py-2 text-[var(--text-secondary)] dark:text-muted font-semibold">Métrica</th>
                  <th className="text-right py-2 text-[var(--text-secondary)] dark:text-muted font-semibold">Actual</th>
                  <th className="text-right py-2 text-[var(--text-secondary)] dark:text-muted font-semibold">Guardado</th>
                  <th className="text-right py-2 text-[var(--text-secondary)] dark:text-muted font-semibold">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Ingreso", a: currentResult.revenue, b: compareResult.revenue },
                  { label: "Costos", a: currentResult.costs, b: compareResult.costs },
                  { label: "Utilidad", a: currentResult.profit, b: compareResult.profit },
                  { label: "Margen", a: currentResult.margin, b: compareResult.margin },
                ].map(row => (
                  <tr key={row.label} className="border-b border-[var(--rule-soft)] dark:border-card-border">
                    <td className="py-2 text-[var(--text-primary)] dark:text-foreground font-semibold">{row.label}</td>
                    <td className="py-2 text-right font-bold text-[var(--text-primary)] dark:text-foreground">{row.label === "Margen" ? fmtPct(row.a) : fmt(row.a)}</td>
                    <td className="py-2 text-right text-[var(--text-secondary)] dark:text-muted">{row.label === "Margen" ? fmtPct(row.b) : fmt(row.b)}</td>
                    <td className={cn("py-2 text-right font-bold", row.a - row.b > 0 ? "text-[var(--data-success)]" : row.a - row.b < 0 ? "text-[var(--data-error)]" : "text-[var(--text-secondary)]")}>
                      {row.a - row.b > 0 ? "+" : ""}{row.label === "Margen" ? fmtPct(row.a - row.b) : fmt(row.a - row.b)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Saved scenarios */}
      <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 sm:p-6 ">
        <CardTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground mb-4">Escenarios guardados</CardTitle>
        {saved.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)] dark:text-muted text-center py-8">No hay escenarios guardados</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
            {saved.map(sc => {
              const result = computeScenario(sc.overrides);
              return (
                <div key={sc.id} className="border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 hover:border-primary/50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm">{sc.name}</h4>
                    <button onClick={() => handleDelete(sc.id)} className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/30 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mb-3">{sc.createdAt} · {Object.keys(sc.overrides).length} variables</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs mb-3">
                    <span className={cn("font-bold", result.profit >= 0 ? "text-[var(--data-success)]" : "text-[var(--data-error)]")}>{fmt(result.profit)}</span>
                    <span className="text-[var(--text-tertiary)] dark:text-muted">utilidad</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => handleLoad(sc)} className="flex-1 text-xs font-semibold text-primary hover:bg-primary/10 rounded-lg py-2 transition-colors">
                      <Play className="h-3 w-3 inline mr-1" /> Cargar
                    </button>
                    <button onClick={() => setCompareId(sc.id)} className="flex-1 text-xs font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-accent rounded-lg py-2 transition-colors">
                      Comparar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Impact alert */}
      {currentResult.profit < 0 && (
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error)] dark:border-[var(--data-error)] rounded-xl p-4 flex flex-wrap items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-[var(--data-error)] shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-[var(--data-error)] dark:text-[var(--data-error)] text-sm">Escenario con pérdidas</h4>
            <p className="text-xs text-[var(--data-error)] dark:text-[var(--data-error)] mt-1">Con estas variables el negocio genera una pérdida de {fmt(Math.abs(currentResult.profit))} al mes. Ajusta las variables para encontrar un punto viable.</p>
          </div>
        </div>
      )}

      {/* Save modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowSaveModal(false)}>
          <div className="bg-white dark:bg-card rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 sm:px-6 py-4 border-b border-[var(--rule-soft)] dark:border-card-border">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">Guardar escenario</CardTitle>
              <button onClick={() => setShowSaveModal(false)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-3 sm:px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[var(--text-primary)] dark:text-foreground mb-1">Nombre del escenario</label>
                <input
                  type="text"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder="Ej: Expansión Q3 2025"
                  className="w-full px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary transition-colors"
                  autoFocus
                />
              </div>
              <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{Object.keys(overrides).length} variables modificadas</p>
              <div className="flex flex-wrap justify-end gap-3">
                <button onClick={() => setShowSaveModal(false)} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors">Cancelar</button>
                <button onClick={handleSave} disabled={!saveName.trim()} className="px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50">Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
