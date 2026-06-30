"use client";

/**
 * GastosClient — /superadmin/gastos (Brandon 2026-06-30). "¿En qué gasta la
 * plataforma?": (1) Gastos REALES (facturas de Buleje) con alta/baja, dona por
 * categoría, tendencia 6 meses, comparación vs mes anterior, presupuesto + alerta
 * de sobregasto y export CSV; (2) Costos ESTIMADOS de infra por tienda
 * (lib/cost-tracking) + margen.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wallet, Server, MessageSquare, Sparkles, CreditCard, Users, Megaphone,
  MoreHorizontal, TrendingUp, TrendingDown, Plus, Trash2, RefreshCw, Building2,
  Download, AlertTriangle, CheckCircle2,
} from "@buleje/design-system/icons";
import { SAKpiCard } from "@/components/superadmin/_shared/SAKpiCard";
import { csrfHeaders } from "@/lib/csrf-client";
import { CAT_KEYS, CAT_META, fmtPen, expensesToCSV, type Expense } from "./gastos-helpers";
import { CategoryDonut } from "./CategoryDonut";

type Summary = {
  count: number; recurringCount: number; monthlyRunRatePen: number; prevMonthRunRatePen: number;
  recurringMonthlyPen: number; thisMonthOneTimePen: number;
  byCategory: { category: string; amountPen: number }[]; trend: { label: string; totalPen: number }[];
};
type TenantCost = {
  tenantId: string; tenantName: string; plan: string;
  storageCost: number; computeCost: number; aiCost: number; totalCost: number; grossMargin: number;
};
type CostsData = { totalMonthlyCost: number; avgGrossMargin: number; tenants: TenantCost[] };

const CAT_ICONS: Record<string, typeof Server> = {
  infra: Server, mensajeria: MessageSquare, ia: Sparkles, pagos: CreditCard,
  personal: Users, marketing: Megaphone, otros: MoreHorizontal,
};
const INPUT =
  "h-12 w-full rounded-lg border-2 border-[var(--surface-border)] bg-[var(--surface-1)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] outline-none";
const emptyForm = { concept: "", category: "infra", amount: "", currency: "USD", recurring: true, period: "mensual", vendor: "" };

export default function GastosClient() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [costs, setCosts] = useState<CostsData | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"reales" | "costos">("reales");
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        fetch("/api/superadmin/platform-expenses", { credentials: "include", cache: "no-store" }),
        fetch("/api/superadmin/costs", { credentials: "include", cache: "no-store" }),
      ]);
      if (a.ok) {
        const j = await a.json();
        setExpenses(j.expenses ?? []);
        setSummary(j.summary ?? null);
        setBudget(typeof j.budgetPen === "number" ? j.budgetPen : null);
        setBudgetInput(typeof j.budgetPen === "number" ? String(j.budgetPen) : "");
      }
      if (b.ok) {
        const j = await b.json();
        setCosts({ totalMonthlyCost: j.totalMonthlyCost, avgGrossMargin: j.avgGrossMargin, tenants: j.tenants ?? [] });
      }
    } catch {
      setErr("No se pudieron cargar los gastos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const addExpense = useCallback(async () => {
    const amount = Number(form.amount);
    if (!form.concept.trim() || !Number.isFinite(amount) || amount <= 0) {
      setErr("Completá concepto y un monto válido."); return;
    }
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/superadmin/platform-expenses", {
        method: "POST", credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          concept: form.concept.trim(), category: form.category, amount, currency: form.currency,
          recurring: form.recurring, period: form.recurring ? form.period : "", vendor: form.vendor.trim(), notes: "",
        }),
      });
      if (!res.ok) { setErr("No se pudo guardar el gasto."); return; }
      setForm(emptyForm); await load();
    } finally { setBusy(false); }
  }, [form, load]);

  const removeExpense = useCallback(async (id: string) => {
    setBusy(true);
    try {
      await fetch("/api/superadmin/platform-expenses", {
        method: "DELETE", credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id }),
      });
      await load();
    } finally { setBusy(false); }
  }, [load]);

  const saveBudget = useCallback(async () => {
    const v = budgetInput.trim() === "" ? null : Number(budgetInput);
    if (v !== null && (!Number.isFinite(v) || v < 0)) { setErr("Presupuesto inválido."); return; }
    setBusy(true); setErr(null);
    try {
      await fetch("/api/superadmin/platform-expenses", {
        method: "PUT", credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ budgetPen: v }),
      });
      await load();
    } finally { setBusy(false); }
  }, [budgetInput, load]);

  const downloadCSV = useCallback(() => {
    const blob = new Blob(["﻿" + expensesToCSV(expenses)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "gastos-plataforma.csv"; a.click();
    URL.revokeObjectURL(url);
  }, [expenses]);

  const runRate = summary?.monthlyRunRatePen ?? 0;
  const prev = summary?.prevMonthRunRatePen ?? 0;
  const delta = prev > 0 ? ((runRate - prev) / prev) * 100 : null;
  const over = budget !== null && budget > 0 && runRate > budget;
  const maxTrend = useMemo(() => Math.max(1, ...(summary?.trend ?? []).map((t) => t.totalPen)), [summary]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SAKpiCard label="Gasto real / mes" value={fmtPen(runRate)} icon={Wallet}
          tone={over ? "bad" : "default"}
          sub={delta === null ? `${summary?.count ?? 0} gastos`
            : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(0)}% vs mes ant.`} />
        <SAKpiCard label="Costo infra estimado" value={fmtPen(costs?.totalMonthlyCost ?? 0)} icon={Server}
          sub={`${costs?.tenants.length ?? 0} tiendas`} />
        <SAKpiCard label="Margen bruto prom." value={`${(costs?.avgGrossMargin ?? 0).toFixed(0)}%`} icon={TrendingUp}
          tone={(costs?.avgGrossMargin ?? 0) >= 50 ? "good" : (costs?.avgGrossMargin ?? 0) >= 0 ? "warn" : "bad"} />
        <SAKpiCard label="Recurrente / mes" value={fmtPen(summary?.recurringMonthlyPen ?? 0)}
          icon={delta !== null && delta < 0 ? TrendingDown : TrendingUp} sub={`${summary?.recurringCount ?? 0} facturas fijas`} />
      </div>

      {/* Presupuesto + alerta */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--surface-border)] bg-[var(--surface-1)] p-3">
        <span className="text-sm font-bold text-[var(--text-secondary)]">Tope mensual (S/):</span>
        <input className={`${INPUT} w-32`} type="number" min="0" step="50" placeholder="sin tope"
          value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} />
        <button onClick={() => void saveBudget()} disabled={busy}
          className="h-10 rounded-lg bg-[var(--surface-2)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-3,var(--surface-2))]">Guardar</button>
        {budget !== null && budget > 0 && (
          over ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-error-600,#dc2626)]">
              <AlertTriangle className="h-4 w-4" /> Sobregasto: {fmtPen(runRate)} supera el tope de {fmtPen(budget)} (+{(((runRate - budget) / budget) * 100).toFixed(0)}%)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-success-600,#059669)]">
              <CheckCircle2 className="h-4 w-4" /> Dentro del tope · queda {fmtPen(budget - runRate)}
            </span>
          )
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["reales", "costos"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
              tab === t ? "bg-[var(--accent)] text-[var(--accent-contrast,#fff)]"
                : "bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
            {t === "reales" ? "Gastos reales" : "Costos por tienda"}
          </button>
        ))}
        {tab === "reales" && expenses.length > 0 && (
          <button onClick={downloadCSV} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <Download className="h-4 w-4" /> CSV
          </button>
        )}
        <button onClick={() => void load()} disabled={busy}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </div>

      {err && <p className="rounded-lg bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-600,#dc2626)]">{err}</p>}

      {tab === "reales" ? (
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Alta de gasto */}
          <form onSubmit={(e) => { e.preventDefault(); void addExpense(); }}
            className="space-y-3 rounded-xl border-2 border-[var(--surface-border)] bg-[var(--surface-1)] p-4 lg:col-span-1">
            <p className="flex items-center gap-2 text-sm font-extrabold text-[var(--text-primary)]"><Plus className="h-4 w-4" /> Nuevo gasto</p>
            <input className={INPUT} placeholder="Concepto (ej. Vercel Pro)" value={form.concept}
              onChange={(e) => setForm({ ...form, concept: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <select className={INPUT} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CAT_KEYS.map((k) => <option key={k} value={k}>{CAT_META[k].label}</option>)}
              </select>
              <select className={INPUT} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <option value="USD">USD</option><option value="PEN">PEN (S/)</option>
              </select>
            </div>
            <input className={INPUT} type="number" step="0.01" min="0" placeholder="Monto" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <input className={INPUT} placeholder="Proveedor (opcional)" value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} /> Recurrente
            </label>
            {form.recurring && (
              <select className={INPUT} value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
                <option value="mensual">Mensual</option><option value="anual">Anual</option>
              </select>
            )}
            <button type="submit" disabled={busy}
              className="h-12 w-full rounded-lg bg-[var(--accent)] text-sm font-extrabold text-[var(--accent-contrast,#fff)] disabled:opacity-50">
              {busy ? "Guardando…" : "Agregar gasto"}
            </button>
          </form>

          {/* Dona + tendencia + lista */}
          <div className="space-y-4 lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border-2 border-[var(--surface-border)] bg-[var(--surface-1)] p-4">
                <p className="mb-3 text-sm font-extrabold text-[var(--text-primary)]">Por categoría</p>
                <CategoryDonut data={summary?.byCategory ?? []} />
              </div>
              <div className="rounded-xl border-2 border-[var(--surface-border)] bg-[var(--surface-1)] p-4">
                <p className="mb-3 text-sm font-extrabold text-[var(--text-primary)]">Tendencia (6 meses)</p>
                <div className="flex h-32 items-end justify-between gap-1.5">
                  {(summary?.trend ?? []).map((t, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex w-full flex-1 items-end">
                        <div className="w-full rounded-t bg-[var(--accent)]" style={{ height: `${Math.max(4, (t.totalPen / maxTrend) * 100)}%` }} title={fmtPen(t.totalPen)} />
                      </div>
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{t.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border-2 border-[var(--surface-border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-2)] text-left text-xs uppercase text-[var(--text-tertiary)]">
                  <tr><th className="p-2">Concepto</th><th className="p-2">Categoría</th><th className="p-2 text-right">Monto</th><th className="p-2"></th></tr>
                </thead>
                <tbody>
                  {expenses.length === 0 && !loading && (
                    <tr><td colSpan={4} className="p-4 text-center text-[var(--text-tertiary)]">No hay gastos. Agregá el primero.</td></tr>
                  )}
                  {expenses.map((x) => {
                    const Icon = CAT_ICONS[x.category] ?? MoreHorizontal;
                    return (
                      <tr key={x.id} className="border-t border-[var(--surface-border)]">
                        <td className="p-2">
                          <span className="font-bold text-[var(--text-primary)]">{x.concept}</span>
                          {x.recurring && <span className="ml-1.5 text-xs text-[var(--text-tertiary)]">· {x.period || "mensual"}</span>}
                          {x.vendor && <span className="block text-xs text-[var(--text-tertiary)]">{x.vendor}</span>}
                        </td>
                        <td className="p-2"><span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]"><Icon className="h-3.5 w-3.5" />{CAT_META[x.category]?.label ?? x.category}</span></td>
                        <td className="p-2 text-right tabular-nums font-bold text-[var(--text-primary)]">
                          {x.currency === "USD" ? `$${x.amount.toFixed(2)}` : fmtPen(x.amount)}
                          <span className="block text-xs font-normal text-[var(--text-tertiary)]">{fmtPen(x.amountPen)}/mes</span>
                        </td>
                        <td className="p-2 text-right">
                          <button onClick={() => void removeExpense(x.id)} disabled={busy}
                            className="rounded p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-600,#dc2626)]" aria-label="Eliminar">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border-2 border-[var(--surface-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-2)] text-left text-xs uppercase text-[var(--text-tertiary)]">
              <tr>
                <th className="p-2">Tienda</th><th className="p-2">Plan</th>
                <th className="p-2 text-right">Storage</th><th className="p-2 text-right">Compute</th>
                <th className="p-2 text-right">IA</th><th className="p-2 text-right">Total</th><th className="p-2 text-right">Margen</th>
              </tr>
            </thead>
            <tbody>
              {(costs?.tenants ?? []).length === 0 && !loading && (
                <tr><td colSpan={7} className="p-4 text-center text-[var(--text-tertiary)]">Sin datos de costos.</td></tr>
              )}
              {(costs?.tenants ?? []).slice().sort((a, b) => b.totalCost - a.totalCost).map((t) => (
                <tr key={t.tenantId} className="border-t border-[var(--surface-border)]">
                  <td className="p-2"><span className="inline-flex items-center gap-1.5 font-bold text-[var(--text-primary)]"><Building2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />{t.tenantName}</span></td>
                  <td className="p-2 text-[var(--text-secondary)]">{t.plan}</td>
                  <td className="p-2 text-right tabular-nums text-[var(--text-secondary)]">{fmtPen(t.storageCost)}</td>
                  <td className="p-2 text-right tabular-nums text-[var(--text-secondary)]">{fmtPen(t.computeCost)}</td>
                  <td className="p-2 text-right tabular-nums text-[var(--text-secondary)]">{fmtPen(t.aiCost)}</td>
                  <td className="p-2 text-right tabular-nums font-bold text-[var(--text-primary)]">{fmtPen(t.totalCost)}</td>
                  <td className={`p-2 text-right tabular-nums font-bold ${t.grossMargin >= 0 ? "text-[var(--data-success-600,#059669)]" : "text-[var(--data-error-600,#dc2626)]"}`}>{t.grossMargin.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
