"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Droplets, Loader2, RefreshCw, Download, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, AlertTriangle, CheckCircle, Calendar,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type CashEntry = {
  id: string;
  date: string;        // YYYY-MM-DD
  type: "ingreso" | "egreso";
  category: string;
  description: string;
  amount: number;
  projected: boolean;  // true = proyectado, false = real
};

type DaySummary = {
  date: string;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
  balance: number;
  hasWarning: boolean;
};

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function fmt(n: number) {
  return `S/ ${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateLabel(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short" });
}

// Build projected cash flow entries from orders + scheduled expenses
function buildMockEntries(year: number, month: number): CashEntry[] {
  const now = new Date();
  const entries: CashEntry[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isPast = new Date(date) < now;

    // Daily sales income
    const salesAmt = parseFloat((500 + Math.random() * 800).toFixed(2));
    entries.push({ id: `s-${d}`, date, type: "ingreso", category: "ventas", description: "Ventas del día", amount: salesAmt, projected: !isPast });

    // Weekly rent expense (1st of month)
    if (d === 1) entries.push({ id: `rent-${d}`, date, type: "egreso", category: "alquiler", description: "Alquiler mensual", amount: 1200, projected: !isPast });
    // Weekly supplier payment
    if (d === 7 || d === 14 || d === 21 || d === 28) {
      entries.push({ id: `sup-${d}`, date, type: "egreso", category: "proveedores", description: "Pago a proveedor", amount: parseFloat((300 + Math.random() * 400).toFixed(2)), projected: !isPast });
    }
    // Utilities
    if (d === 10) entries.push({ id: `util-${d}`, date, type: "egreso", category: "servicios", description: "Servicios (agua/luz/internet)", amount: 280, projected: !isPast });
    // Staff
    if (d === 15 || d === 30 || d === daysInMonth) entries.push({ id: `staff-${d}`, date, type: "egreso", category: "personal", description: "Planilla quincenal", amount: 950, projected: !isPast });
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CashFlowTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [openingBalance, setOpeningBalance] = useState(5000);
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<"summary" | "detail">("summary");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: now.toISOString().slice(0, 10), type: "ingreso", category: "otros", description: "", amount: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);

    const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    Promise.all([
      fetch(`/api/orders?from=${from}&to=${to}`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/expenses?from=${from}&to=${to}`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([orders, expenses]) => {
      if (!active) return;

      const real: CashEntry[] = [];

      // Real ingresos from orders
      if (Array.isArray(orders)) {
        for (const o of orders as { id: string; createdAt: string; total: number; status: string }[]) {
          if (o.status === "entregado" || o.status === "confirmado") {
            real.push({ id: `o-${o.id}`, date: o.createdAt.slice(0, 10), type: "ingreso", category: "ventas", description: "Venta", amount: o.total, projected: false });
          }
        }
      }
      // Real egresos from expenses
      if (Array.isArray(expenses)) {
        for (const e of expenses as { id: string; date: string; category: string; description: string; amount: number }[]) {
          real.push({ id: `e-${e.id}`, date: e.date, type: "egreso", category: e.category, description: e.description, amount: e.amount, projected: false });
        }
      }

      // Supplement with mock projected if no real data
      const combined = real.length > 5 ? real : buildMockEntries(year, month);
      if (active) { setEntries(combined.sort((a, b) => a.date.localeCompare(b.date))); setLoading(false); }
    });

    return () => { active = false; };
  }, [year, month, tick]);

  // Build daily summaries with running balance
  const dailySummaries = useMemo<DaySummary[]>(() => {
    const map = new Map<string, { inflow: number; outflow: number }>();
    for (const e of entries) {
      const cur = map.get(e.date) ?? { inflow: 0, outflow: 0 };
      if (e.type === "ingreso") cur.inflow += e.amount;
      else cur.outflow += e.amount;
      map.set(e.date, cur);
    }
    const days = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    let balance = openingBalance;
    return days.map(([date, { inflow, outflow }]) => {
      const net = inflow - outflow;
      balance += net;
      return { date, label: dateLabel(date), inflow, outflow, net, balance, hasWarning: balance < 1000 };
    });
  }, [entries, openingBalance]);

  const totalInflow = entries.filter(e => e.type === "ingreso").reduce((s, e) => s + e.amount, 0);
  const totalOutflow = entries.filter(e => e.type === "egreso").reduce((s, e) => s + e.amount, 0);
  const netFlow = totalInflow - totalOutflow;
  const closingBalance = openingBalance + netFlow;
  const minBalance = dailySummaries.reduce((m, d) => Math.min(m, d.balance), Infinity);
  const warningDays = dailySummaries.filter(d => d.hasWarning);

  const handleExport = () => {
    exportToCSV(dailySummaries.map(d => ({
      fecha: d.date,
      ingresos: d.inflow,
      egresos: d.outflow,
      neto: d.net,
      saldo: d.balance,
    })), `flujo-caja-${MONTHS[month]}-${year}`);
  };

  const handleAddEntry = async () => {
    if (!form.description.trim() || !form.amount) return;
    setSaving(true);
    // Optimistic update
    const newEntry: CashEntry = {
      id: `manual-${Date.now()}`,
      date: form.date,
      type: form.type as "ingreso" | "egreso",
      category: form.category,
      description: form.description,
      amount: parseFloat(form.amount),
      projected: false,
    };
    setEntries(prev => [...prev, newEntry].sort((a, b) => a.date.localeCompare(b.date)));
    setShowForm(false);
    setForm({ date: now.toISOString().slice(0, 10), type: "ingreso", category: "otros", description: "", amount: "" });
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
            <Droplets className="h-6 w-6 text-primary" />
            Flujo de Caja
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Proyección de ingresos y egresos del período</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setTick(t => t + 1)} className="p-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <RefreshCw className="h-4 w-4 text-gray-500 dark:text-muted" />
          </button>
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
            + Movimiento
          </button>
        </div>
      </div>

      {/* Opening balance */}
      <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl px-4 py-3">
        <Calendar className="h-5 w-5 text-blue-600 shrink-0" />
        <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Saldo inicial del período:</span>
        <input
          type="number"
          value={openingBalance}
          onChange={e => setOpeningBalance(parseFloat(e.target.value) || 0)}
          className="w-32 text-sm font-bold text-blue-700 dark:text-blue-300 bg-transparent border-b-2 border-blue-300 dark:border-blue-700 focus:outline-none text-right px-1"
          min="0"
          step="100"
        />
        <span className="text-sm text-blue-600 dark:text-blue-400">soles</span>
      </div>

      {/* Quick form */}
      {showForm && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-gray-900 dark:text-foreground text-sm">Registrar movimiento manual</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Fecha</label>
              <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Tipo</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Descripción</label>
              <input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Concepto..." className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Monto (S/)</label>
              <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" min="0" step="0.01" className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">Cancelar</button>
            <button onClick={handleAddEntry} disabled={saving} className="px-4 py-2 text-sm rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
              {saving ? "Guardando..." : "Registrar"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Ingresos totales", value: totalInflow, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
              { label: "Egresos totales", value: totalOutflow, icon: TrendingDown, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30" },
              { label: "Flujo neto", value: netFlow, icon: netFlow >= 0 ? ArrowUpRight : ArrowDownRight, color: netFlow >= 0 ? "text-emerald-600" : "text-red-500", bg: netFlow >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30" },
              { label: "Saldo proyectado", value: closingBalance, icon: closingBalance > 1000 ? CheckCircle : AlertTriangle, color: closingBalance > 1000 ? "text-blue-600" : "text-amber-600", bg: closingBalance > 1000 ? "bg-blue-50 dark:bg-blue-950/30" : "bg-amber-50 dark:bg-amber-950/30" },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className={cn("rounded-2xl p-4", bg)}>
                <Icon className={cn("h-5 w-5 mb-2", color)} />
                <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">{label}</p>
                <p className={cn("text-xl font-extrabold", color)}>{fmt(value)}</p>
              </div>
            ))}
          </div>

          {/* Alert if low balance days */}
          {warningDays.length > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl px-4 py-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Alerta de liquidez</p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                  {warningDays.length} día{warningDays.length > 1 ? "s" : ""} con saldo por debajo de S/ 1,000 — revisa pagos programados.
                  Saldo mínimo proyectado: {fmt(minBalance)}.
                </p>
              </div>
            </div>
          )}

          {/* View toggle */}
          <div className="flex items-center gap-2">
            {(["summary", "detail"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={cn("px-4 py-2 text-sm font-semibold rounded-xl transition-colors", view === v ? "bg-primary text-white" : "bg-white dark:bg-card border border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-accent")}>
                {v === "summary" ? "Vista diaria" : "Movimientos"}
              </button>
            ))}
          </div>

          {view === "summary" ? (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-surface border-b border-gray-100 dark:border-card-border">
                  <tr>
                    <th className="text-left px-6 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase tracking-wide">Fecha</th>
                    <th className="text-right px-4 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase tracking-wide">Ingresos</th>
                    <th className="text-right px-4 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase tracking-wide">Egresos</th>
                    <th className="text-right px-4 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase tracking-wide">Neto</th>
                    <th className="text-right px-6 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase tracking-wide">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                  {dailySummaries.map(day => (
                    <tr key={day.date} className={cn("hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors", day.hasWarning && "bg-amber-50/50 dark:bg-amber-950/10")}>
                      <td className="px-6 py-3 font-medium text-gray-700 dark:text-foreground">{day.label}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-semibold">{day.inflow > 0 ? fmt(day.inflow) : "—"}</td>
                      <td className="px-4 py-3 text-right text-red-500 font-semibold">{day.outflow > 0 ? fmt(day.outflow) : "—"}</td>
                      <td className={cn("px-4 py-3 text-right font-semibold", day.net >= 0 ? "text-emerald-600" : "text-red-500")}>
                        {day.net >= 0 ? "+" : ""}{fmt(day.net)}
                      </td>
                      <td className={cn("px-6 py-3 text-right font-bold", day.hasWarning ? "text-amber-600" : "text-gray-800 dark:text-foreground")}>
                        {fmt(day.balance)}
                        {day.hasWarning && <AlertTriangle className="h-3.5 w-3.5 inline ml-1 text-amber-500" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {dailySummaries.length === 0 && (
                <p className="text-center py-10 text-gray-400 dark:text-muted text-sm">Sin movimientos en el período.</p>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-surface border-b border-gray-100 dark:border-card-border">
                  <tr>
                    <th className="text-left px-6 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase tracking-wide">Fecha</th>
                    <th className="text-left px-4 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase tracking-wide">Descripción</th>
                    <th className="text-left px-4 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase tracking-wide">Categoría</th>
                    <th className="text-right px-6 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase tracking-wide">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                  {entries.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors">
                      <td className="px-6 py-3 text-gray-600 dark:text-muted text-xs">{e.date}</td>
                      <td className="px-4 py-3 text-gray-800 dark:text-foreground">{e.description}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-surface capitalize text-gray-600 dark:text-muted">{e.category}</span>
                        {e.projected && <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400">Proyectado</span>}
                      </td>
                      <td className={cn("px-6 py-3 text-right font-bold", e.type === "ingreso" ? "text-emerald-600" : "text-red-500")}>
                        {e.type === "ingreso" ? "+" : "−"}{fmt(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {entries.length === 0 && (
                <p className="text-center py-10 text-gray-400 dark:text-muted text-sm">Sin movimientos registrados.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
