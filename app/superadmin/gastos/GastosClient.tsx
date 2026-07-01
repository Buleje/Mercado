"use client";

/**
 * GastosClient — /superadmin/gastos. Panel de salud financiera de la plataforma
 * Buleje SaaS: (1) P&L (MRR vs gasto real → utilidad, margen, break-even),
 * (2) gastos REALES con alta/edición, dona, tendencia vs tope, búsqueda/agrupar y
 * CSV, (3) presupuesto global + por categoría, (4) costos ESTIMADOS de infra por
 * tienda + margen. Orquesta useGastos() + sub-componentes. Brandon 2026-06-30.
 */

import { useMemo, useState } from "react";
import {
  Wallet, Server, TrendingUp, TrendingDown, Building2, Download, RefreshCw, DollarSign, FileText,
} from "@buleje/design-system/icons";
import { SAKpiCard } from "@/components/superadmin/_shared/SAKpiCard";
import { useGastos } from "./use-gastos";
import { fmtPen, expensesToCSV, type Expense } from "./gastos-helpers";
import { generatePnlPDF } from "./pnl-pdf";
import { PnlHero } from "./PnlHero";
import { BudgetPanel } from "./BudgetPanel";
import { ExpenseForm } from "./ExpenseForm";
import { ExpensesTable } from "./ExpensesTable";
import { TrendChart } from "./TrendChart";
import { CategoryDonut } from "./CategoryDonut";

const CARD = "rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4";
const TOOL =
  "inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]";

export default function GastosClient() {
  const g = useGastos();
  const [tab, setTab] = useState<"reales" | "costos">("reales");
  const [editing, setEditing] = useState<Expense | null>(null);

  const runRate = g.summary?.monthlyRunRatePen ?? 0;
  const prev = g.summary?.prevMonthRunRatePen ?? 0;
  const delta = prev > 0 ? ((runRate - prev) / prev) * 100 : null;

  const tenants = useMemo(
    () => (g.costs?.tenants ?? []).slice().sort((a, b) => b.totalCost - a.totalCost),
    [g.costs],
  );

  const downloadCSV = () => {
    const blob = new Blob(["﻿" + expensesToCSV(g.expenses)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gastos-plataforma.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPnl = () => {
    generatePnlPDF({
      mrrPen: g.mrrPen,
      payingTenants: g.payingTenants,
      summary: g.summary,
      fxRate: g.fxRate,
      dateStr: new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" }),
    }).catch((err) => {
      g.setErr("No se pudo generar el PDF.");
      console.error("[gastos] pnl pdf", err);
    });
  };

  const onSubmitForm = async (input: Parameters<typeof g.addExpense>[0]) => {
    const ok = editing ? await g.updateExpense(editing.id, input) : await g.addExpense(input);
    if (ok && editing) setEditing(null);
    return ok;
  };

  return (
    <div className="space-y-5">
      {/* P&L: ¿gana o pierde la plataforma? */}
      <PnlHero mrrPen={g.mrrPen} runRatePen={runRate} payingTenants={g.payingTenants} />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SAKpiCard
          label="Gasto real / mes"
          value={fmtPen(runRate)}
          icon={Wallet}
          tone={g.budget !== null && g.budget > 0 && runRate > g.budget ? "bad" : "default"}
          sub={delta === null ? `${g.summary?.count ?? 0} gastos` : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(0)}% vs mes ant.`}
        />
        <SAKpiCard label="Ingresos (MRR)" value={fmtPen(g.mrrPen)} icon={DollarSign} tone="good" sub={`${g.payingTenants} tiendas que pagan`} />
        <SAKpiCard label="Costo infra estimado" value={fmtPen(g.costs?.totalMonthlyCost ?? 0)} icon={Server} sub={`${g.costs?.tenants.length ?? 0} tiendas`} />
        <SAKpiCard
          label="Margen bruto prom."
          value={`${(g.costs?.avgGrossMargin ?? 0).toFixed(0)}%`}
          icon={(g.costs?.avgGrossMargin ?? 0) >= 0 ? TrendingUp : TrendingDown}
          tone={(g.costs?.avgGrossMargin ?? 0) >= 50 ? "good" : (g.costs?.avgGrossMargin ?? 0) >= 0 ? "warn" : "bad"}
        />
      </div>

      {/* Presupuesto global + por categoría */}
      <BudgetPanel
        budget={g.budget}
        budgetByCategory={g.budgetByCategory}
        runRatePen={runRate}
        byCategory={g.summary?.byCategory ?? []}
        busy={g.busy}
        onSaveBudget={(v) => void g.saveBudget(v)}
        onSaveBudgetByCategory={(next) => void g.saveBudgetByCategory(next)}
      />

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {(["reales", "costos"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
              tab === t
                ? "bg-[var(--accent)] text-[var(--accent-contrast,#fff)]"
                : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t === "reales" ? "Gastos reales" : "Costos por tienda"}
          </button>
        ))}
        {tab === "reales" && g.expenses.length > 0 && (
          <button onClick={downloadCSV} className={TOOL}>
            <Download className="h-4 w-4" /> CSV
          </button>
        )}
        <button onClick={exportPnl} className={TOOL}>
          <FileText className="h-4 w-4" /> P&L PDF
        </button>
        <button onClick={() => void g.load()} disabled={g.busy} className={`${TOOL} ml-auto`}>
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </div>

      {g.err && (
        <p className="rounded-lg bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-600,#dc2626)]">{g.err}</p>
      )}

      {tab === "reales" ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <ExpenseForm
              key={editing?.id ?? "new"}
              initial={editing ?? undefined}
              busy={g.busy}
              onSubmit={onSubmitForm}
              onCancel={editing ? () => setEditing(null) : undefined}
            />
          </div>

          <div className="space-y-4 lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className={CARD}>
                <p className="mb-3 text-sm font-extrabold text-[var(--text-primary)]">Por categoría</p>
                <CategoryDonut data={g.summary?.byCategory ?? []} />
              </div>
              <div className={CARD}>
                <p className="mb-3 text-sm font-extrabold text-[var(--text-primary)]">Tendencia (6 meses)</p>
                <TrendChart trend={g.summary?.trend ?? []} budgetPen={g.budget} />
              </div>
            </div>
            <ExpensesTable
              expenses={g.expenses}
              loading={g.loading}
              busy={g.busy}
              fxRate={g.fxRate}
              onEdit={(x) => setEditing(x)}
              onDelete={(id) => void g.removeExpense(id)}
              onSaveFx={(rate) => void g.saveFxRate(rate)}
            />
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--rule-soft)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-sunken)] text-left text-sm font-bold text-[var(--text-tertiary)]">
              <tr>
                <th className="p-2">Tienda</th>
                <th className="p-2">Plan</th>
                <th className="p-2 text-right">Storage</th>
                <th className="p-2 text-right">Compute</th>
                <th className="p-2 text-right">IA</th>
                <th className="p-2 text-right">Total</th>
                <th className="p-2 text-right">Margen</th>
              </tr>
            </thead>
            <tbody>
              {tenants.length === 0 && !g.loading && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-[var(--text-tertiary)]">Sin datos de costos.</td>
                </tr>
              )}
              {tenants.map((t) => (
                <tr key={t.tenantId} className="border-t border-[var(--rule-soft)]">
                  <td className="p-2">
                    <span className="inline-flex items-center gap-1.5 font-bold text-[var(--text-primary)]">
                      <Building2 className="h-4 w-4 text-[var(--text-tertiary)]" />
                      {t.tenantName}
                    </span>
                  </td>
                  <td className="p-2 text-[var(--text-secondary)]">{t.plan}</td>
                  <td className="p-2 text-right tabular-nums text-[var(--text-secondary)]">{fmtPen(t.storageCost)}</td>
                  <td className="p-2 text-right tabular-nums text-[var(--text-secondary)]">{fmtPen(t.computeCost)}</td>
                  <td className="p-2 text-right tabular-nums text-[var(--text-secondary)]">{fmtPen(t.aiCost)}</td>
                  <td className="p-2 text-right tabular-nums font-bold text-[var(--text-primary)]">{fmtPen(t.totalCost)}</td>
                  <td className={`p-2 text-right tabular-nums font-bold ${t.grossMargin >= 0 ? "text-[var(--data-success-600,#059669)]" : "text-[var(--data-error-600,#dc2626)]"}`}>
                    {t.grossMargin.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
