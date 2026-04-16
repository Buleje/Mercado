"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  DollarSign, Users, TrendingUp, Settings, RefreshCw,
  CheckCircle2, BarChart3, Calendar,
  Wallet, Award, Download, Plus, Trash2,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CashierStats {
  cashierId: string;
  cashierName: string;
  role: string;
  sales: number;
  revenue: number;
  cogs: number;
  profit: number;
}

interface DbCommissionRule {
  id: string;
  cashierId: string;
  label: string;
  minSales: number;
  maxSales: number | null;
  rate: number;
}

interface CommissionRule {
  cashierId: string;
  rate: number; // percentage (e.g. 3 = 3%)
  paid: boolean;
}

type Period = "este-mes" | "mes-anterior" | "esta-semana" | "personalizado";

// ─── Seed Data ────────────────────────────────────────────────────────────────

const SEED_STATS: CashierStats[] = [
  { cashierId: "cajera1",   cashierName: "María López",    role: "cajero",      sales: 234, revenue: 18420, cogs: 12890, profit: 5530 },
  { cashierId: "cajero2",   cashierName: "Carlos Ríos",    role: "cajero",      sales: 187, revenue: 14760, cogs: 10330, profit: 4430 },
  { cashierId: "almac1",    cashierName: "Juan Pérez",      role: "almacenero",  sales: 48,  revenue: 3890,  cogs: 2720,  profit: 1170 },
  { cashierId: "admin",     cashierName: "Admin Principal", role: "admin",       sales: 312, revenue: 24600, cogs: 17220, profit: 7380 },
];

const DEFAULT_RATES: CommissionRule[] = [
  { cashierId: "cajera1", rate: 3, paid: false },
  { cashierId: "cajero2", rate: 3, paid: false },
  { cashierId: "almac1",  rate: 2, paid: true },
  { cashierId: "admin",   rate: 1, paid: false },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtCompact(n: number) {
  if (n >= 1000) return `S/ ${(n / 1000).toFixed(1)}k`;
  return `S/ ${n.toFixed(0)}`;
}

const ROLE_LABEL: Record<string, string> = { admin: "Admin", cajero: "Cajero/a", almacenero: "Almacenero/a" };

const PERIOD_OPTIONS: { id: Period; label: string }[] = [
  { id: "este-mes",      label: "Este mes" },
  { id: "mes-anterior",  label: "Mes anterior" },
  { id: "esta-semana",   label: "Esta semana" },
  { id: "personalizado", label: "Personalizado" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ComisionesTab() {
  const [period, setPeriod] = useState<Period>("este-mes");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [stats, setStats] = useState<CashierStats[]>(SEED_STATS);
  const [rules, setRules] = useState<CommissionRule[]>(DEFAULT_RATES);
  const [dbRules, setDbRules] = useState<DbCommissionRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [toast, setToast] = useState("");

  // New tier form state
  const [newTier, setNewTier] = useState({ cashierId: "", label: "", minSales: 0, maxSales: "", rate: 3 });

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  // ─── Load commission rules from DB ────────────────────────────────────────────────

  const loadDbRules = useCallback(async () => {
    try {
      const res = await fetch("/api/commission-rules");
      if (res.ok) {
        const data: DbCommissionRule[] = await res.json();
        setDbRules(data);
      }
    } catch { /* silent — tiered calc falls back to flat rate */ }
  }, []);

  useEffect(() => { loadDbRules(); }, [loadDbRules]);

  async function handleAddTier() {
    if (!newTier.cashierId || newTier.rate <= 0) return;
    setSavingRule(true);
    try {
      const res = await fetch("/api/commission-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashierId: newTier.cashierId,
          label: newTier.label,
          minSales: newTier.minSales,
          maxSales: newTier.maxSales ? Number(newTier.maxSales) : null,
          rate: newTier.rate,
        }),
      });
      if (res.ok) {
        const created: DbCommissionRule = await res.json();
        setDbRules(prev => [...prev, created]);
        setNewTier({ cashierId: "", label: "", minSales: 0, maxSales: "", rate: 3 });
        showToast("Regla de comisión guardada");
      } else {
        showToast("Error al guardar la regla");
      }
    } catch { showToast("Error de conexión"); }
    setSavingRule(false);
  }

  async function handleDeleteTier(id: string) {
    await fetch(`/api/commission-rules?id=${id}`, { method: "DELETE" }).catch(() => {});
    setDbRules(prev => prev.filter(r => r.id !== id));
    showToast("Regla eliminada");
  }

  async function loadData() {
    setLoading(true);
    try {
      const now = new Date();
      let from = "";
      let to = "";

      if (period === "este-mes") {
        from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
        to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      } else if (period === "mes-anterior") {
        from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
        to = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];
      } else if (period === "esta-semana") {
        const day = now.getDay();
        const monday = new Date(now); monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
        from = monday.toISOString().split("T")[0];
        to = now.toISOString().split("T")[0];
      } else {
        from = customFrom;
        to = customTo;
      }

      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);

      const res = await fetch(`/api/commissions?${qs}`);
      if (res.ok) {
        const data: CashierStats[] = await res.json();
        if (data.length > 0) {
          setStats(data);
          // Ensure paid-toggle state exists for every real cashier returned
          setRules(prev => {
            const existing = new Map(prev.map(r => [r.cashierId, r]));
            return data.map(s => existing.get(s.cashierId) ?? { cashierId: s.cashierId, rate: 0, paid: false });
          });
        }
      }
    } catch {
      // Fallback to seed data silently
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const withCommissions = useMemo(() =>
    stats.map(s => {
      // Find the matching DB tier for this cashier's actual revenue
      const tiers = dbRules
        .filter(d => d.cashierId === s.cashierId)
        .sort((a, b) => b.minSales - a.minSales); // highest bracket first
      const matchedTier = tiers.find(d =>
        s.revenue >= d.minSales && (d.maxSales === null || s.revenue < d.maxSales)
      );
      const flatRule = rules.find(r => r.cashierId === s.cashierId);
      const rate = matchedTier ? matchedTier.rate : (flatRule?.rate ?? 0);
      const tierLabel = matchedTier?.label ?? "";
      const commission = Math.round(s.revenue * (rate / 100) * 100) / 100;
      return { ...s, rate, commission, paid: flatRule?.paid ?? false, tierLabel };
    }),
    [stats, rules, dbRules]
  );

  const totals = useMemo(() => ({
    revenue: withCommissions.reduce((sum, s) => sum + s.revenue, 0),
    profit: withCommissions.reduce((sum, s) => sum + s.profit, 0),
    commission: withCommissions.reduce((sum, s) => sum + s.commission, 0),
    pending: withCommissions.filter(s => !s.paid).reduce((sum, s) => sum + s.commission, 0),
  }), [withCommissions]);

  function updateRate(cashierId: string, rate: number) {
    setRules(prev => prev.map(r => r.cashierId === cashierId ? { ...r, rate } : r));
  }

  function togglePaid(cashierId: string) {
    setRules(prev => prev.map(r => r.cashierId === cashierId ? { ...r, paid: !r.paid } : r));
    showToast("Estado de pago actualizado");
  }

  function handleExport() {
    exportToCSV(withCommissions.map(s => ({
      Cajero: s.cashierName,
      Rol: ROLE_LABEL[s.role] ?? s.role,
      Ventas: s.sales,
      Ingresos: s.revenue,
      "Costo (COGS)": s.cogs,
      Ganancia: s.profit,
      "Tasa %": `${s.rate}%`,
      Comisión: s.commission,
      Estado: s.paid ? "Pagado" : "Pendiente",
    })), "comisiones_equipo");
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl shadow-lg text-sm font-bold flex flex-wrap items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Award className="h-6 w-6 text-primary" /> Comisiones del Equipo
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Seguimiento de ventas por cajero y cálculo de comisiones</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowConfig(!showConfig)} className={cn("px-2 sm:px-4 py-1.5 sm:py-2 border rounded-xl text-sm font-bold flex items-center gap-2 transition-all", showConfig ? "border-primary text-primary bg-primary/10" : "border-gray-300 dark:border-card-border text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent")}>
            <Settings className="h-4 w-4" /> Tasas
          </button>
          <button onClick={handleExport} className="px-2 sm:px-4 py-1.5 sm:py-2 border border-gray-300 dark:border-card-border rounded-xl text-sm font-bold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent flex flex-wrap items-center gap-2">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button onClick={loadData} disabled={loading} className="px-2 sm:px-4 py-1.5 sm:py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 flex flex-wrap items-center gap-2 disabled:opacity-60">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Actualizar
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="h-4 w-4 text-gray-500 dark:text-muted shrink-0" />
          <span className="text-sm font-bold text-gray-700 dark:text-foreground shrink-0">Período:</span>
          <div className="flex gap-2 flex-wrap">
            {PERIOD_OPTIONS.map(p => (
              <button key={p.id} onClick={() => setPeriod(p.id)} className={cn("px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all", period === p.id ? "border-primary bg-primary/10 text-primary" : "border-gray-200 dark:border-card-border text-gray-500 dark:text-muted hover:border-gray-400")}>
                {p.label}
              </button>
            ))}
          </div>
          {period === "personalizado" && (
            <div className="flex gap-2 items-center flex-wrap">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="border border-gray-300 dark:border-card-border rounded-xl px-3 py-1.5 text-xs bg-white dark:bg-surface text-gray-900 dark:text-foreground" />
              <span className="text-xs text-gray-500">—</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="border border-gray-300 dark:border-card-border rounded-xl px-3 py-1.5 text-xs bg-white dark:bg-surface text-gray-900 dark:text-foreground" />
              <button onClick={loadData} className="px-3 py-1.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary/90">Aplicar</button>
            </div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Ingresos totales", value: fmt(totals.revenue), icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Ganancia neta", value: fmt(totals.profit), icon: BarChart3, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Comisiones totales", value: fmt(totals.commission), icon: DollarSign, color: "text-violet-600 dark:text-violet-400" },
          { label: "Por pagar", value: fmt(totals.pending), icon: Wallet, color: "text-amber-600 dark:text-amber-400" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <k.icon className={cn("h-4 w-4", k.color)} />
              <p className="text-xs text-gray-500 dark:text-muted font-bold">{k.label}</p>
            </div>
            <p className={cn("text-xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Rate config panel */}
      {showConfig && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-3 sm:p-5 space-y-5">
          <h3 className="font-extrabold text-amber-900 dark:text-amber-300 flex flex-wrap items-center gap-2">
            <Settings className="h-4 w-4" /> Reglas de comisión por tramos
          </h3>

          {/* Existing DB tiers */}
          {dbRules.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Reglas guardadas</p>
              {dbRules.map(r => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 bg-white dark:bg-card rounded-xl p-3 border border-amber-100 dark:border-amber-900/20">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-foreground">{r.cashierId} <span className="text-xs text-gray-400 dark:text-muted font-normal">{r.label && `— ${r.label}`}</span></p>
                    <p className="text-xs text-gray-500 dark:text-muted">
                      Desde S/ {r.minSales.toLocaleString("es-PE")}{r.maxSales ? ` hasta S/ ${r.maxSales.toLocaleString("es-PE")}` : " en adelante"} → <strong>{r.rate}%</strong>
                    </p>
                  </div>
                  <button onClick={() => handleDeleteTier(r.id)} className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new tier form */}
          <div className="border-t border-amber-200 dark:border-amber-900/30 pt-4">
            <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-3">Nueva regla</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-foreground mb-1">Cajero ID</label>
                <select value={newTier.cashierId} onChange={e => setNewTier(v => ({ ...v, cashierId: e.target.value }))} className="w-full border border-gray-300 dark:border-card-border rounded-xl px-3 py-2 text-sm bg-white dark:bg-surface text-gray-900 dark:text-foreground">
                  <option value="">Seleccionar cajero…</option>
                  {stats.map(s => <option key={s.cashierId} value={s.cashierId}>{s.cashierName} ({s.cashierId})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-foreground mb-1">Etiqueta (opcional)</label>
                <input value={newTier.label} onChange={e => setNewTier(v => ({ ...v, label: e.target.value }))} placeholder="ej: Objetivo Q1" className="w-full border border-gray-300 dark:border-card-border rounded-xl px-3 py-2 text-sm bg-white dark:bg-surface text-gray-900 dark:text-foreground" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-foreground mb-1">Ingresos mín. (S/)</label>
                <input type="number" min={0} value={newTier.minSales} onChange={e => setNewTier(v => ({ ...v, minSales: Number(e.target.value) }))} className="w-full border border-gray-300 dark:border-card-border rounded-xl px-3 py-2 text-sm bg-white dark:bg-surface text-gray-900 dark:text-foreground" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-foreground mb-1">Ingresos máx. (S/, vacío = sin límite)</label>
                <input type="number" min={0} value={newTier.maxSales} onChange={e => setNewTier(v => ({ ...v, maxSales: e.target.value }))} placeholder="Sin límite" className="w-full border border-gray-300 dark:border-card-border rounded-xl px-3 py-2 text-sm bg-white dark:bg-surface text-gray-900 dark:text-foreground" />
              </div>
              <div className="sm:col-span-2 flex flex-wrap items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-700 dark:text-foreground mb-1">Tasa (%)</label>
                  <input type="number" min={0} max={20} step={0.5} value={newTier.rate} onChange={e => setNewTier(v => ({ ...v, rate: Number(e.target.value) }))} className="w-full border border-gray-300 dark:border-card-border rounded-xl px-3 py-2 text-sm bg-white dark:bg-surface text-gray-900 dark:text-foreground" />
                </div>
                <button onClick={handleAddTier} disabled={savingRule || !newTier.cashierId || newTier.rate <= 0} className="px-2 sm:px-4 py-1.5 sm:py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 flex flex-wrap items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  {savingRule ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Guardar
                </button>
              </div>
            </div>
          </div>

          {/* Legacy flat rate quick-edit */}
          <div className="border-t border-amber-200 dark:border-amber-900/30 pt-4">
            <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-3">Tasa plana rápida (no persiste)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {rules.map(r => {
                const cashier = stats.find(s => s.cashierId === r.cashierId);
                return (
                  <div key={r.cashierId} className="flex flex-wrap items-center gap-3 bg-white dark:bg-card rounded-xl p-3 border border-amber-100 dark:border-amber-900/20">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-foreground">{cashier?.cashierName ?? r.cashierId}</p>
                      <p className="text-xs text-gray-500 dark:text-muted">{ROLE_LABEL[cashier?.role ?? ""] ?? cashier?.role}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="number" min={0} max={20} step={0.5} value={r.rate} onChange={e => updateRate(r.cashierId, Number(e.target.value))} className="w-16 border border-gray-300 dark:border-card-border rounded-xl px-2 py-1.5 text-sm text-center bg-white dark:bg-surface text-gray-900 dark:text-foreground" />
                      <span className="text-sm font-bold text-gray-500 dark:text-muted">%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-amber-700 dark:text-amber-400">Las tasas de tramo se calculan sobre los ingresos brutos del período seleccionado.</p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-card-border">
          <h3 className="font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Detalle por empleado
          </h3>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="bg-gray-50 dark:bg-surface border-b border-gray-100 dark:border-card-border">
                  <tr>
                    {["Empleado", "Rol", "Ventas", "Ingresos", "Ganancia", "Tasa", "Comisión", "Estado"].map(h => (
                      <th key={h} className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-extrabold text-gray-500 dark:text-muted uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                  {withCommissions.map(s => (
                    <tr key={s.cashierId} className="hover:bg-gray-50 dark:hover:bg-accent/50 transition-colors">
                      <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-900 dark:text-foreground">{s.cashierName}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-500 dark:text-muted">{ROLE_LABEL[s.role] ?? s.role}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-700 dark:text-foreground">{s.sales}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-emerald-600 dark:text-emerald-400">{fmtCompact(s.revenue)}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-emerald-600 dark:text-emerald-400">{fmtCompact(s.profit)}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-500 dark:text-muted">
                        {s.rate}%{s.tierLabel && <span className="ml-1 text-xs text-primary font-normal">({s.tierLabel})</span>}
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 font-extrabold text-violet-600 dark:text-violet-400">{fmt(s.commission)}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3">
                        <button onClick={() => togglePaid(s.cashierId)} className={cn("px-2.5 py-1 rounded-xl text-xs font-bold transition-all", s.paid ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400")}>
                          {s.paid ? "Pagado" : "Pendiente"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 dark:bg-surface border-t border-gray-200 dark:border-card-border">
                  <tr>
                    <td colSpan={3} className="px-2 sm:px-4 py-2 sm:py-3 font-extrabold text-gray-900 dark:text-foreground text-xs uppercase">TOTAL</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-extrabold text-emerald-600 dark:text-emerald-400">{fmt(totals.revenue)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-extrabold text-emerald-600 dark:text-emerald-400">{fmt(totals.profit)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3" />
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-extrabold text-violet-600 dark:text-violet-400">{fmt(totals.commission)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-amber-600 dark:text-amber-400 font-bold text-xs">
                      {fmt(totals.pending)} por pagar
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-gray-100 dark:divide-card-border">
              {withCommissions.map(s => (
                <div key={s.cashierId} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-extrabold text-gray-900 dark:text-foreground">{s.cashierName}</p>
                      <p className="text-xs text-gray-500 dark:text-muted">{ROLE_LABEL[s.role] ?? s.role}</p>
                    </div>
                    <button onClick={() => togglePaid(s.cashierId)} className={cn("px-2.5 py-1 rounded-xl text-xs font-bold", s.paid ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400")}>
                      {s.paid ? "Pagado" : "Pendiente"}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                    <div><p className="text-gray-500 dark:text-muted font-bold">Ingresos</p><p className="font-extrabold text-emerald-600 dark:text-emerald-400">{fmtCompact(s.revenue)}</p></div>
                    <div><p className="text-gray-500 dark:text-muted font-bold">Ganancia</p><p className="font-extrabold text-emerald-600 dark:text-emerald-400">{fmtCompact(s.profit)}</p></div>
                    <div><p className="text-gray-500 dark:text-muted font-bold">Comisión ({s.rate}%{s.tierLabel ? ` · ${s.tierLabel}` : ""})</p><p className="font-extrabold text-violet-600 dark:text-violet-400">{fmt(s.commission)}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Info note */}
      <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-900/30 rounded-xl p-4">
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          <strong>ℹ️ Nota:</strong> Las comisiones se calculan sobre los ingresos brutos de cada cajero en el POS. Los datos se cargan desde <code className="font-mono">/api/commissions</code>. Para que aparezcan ventas reales, cada venta del POS debe registrar el <code className="font-mono">cashierId</code> del cajero activo.
        </p>
      </div>
    </div>
  );
}
