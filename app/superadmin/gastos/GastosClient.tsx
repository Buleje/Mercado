"use client";

/**
 * GastosClient — /superadmin/gastos. Panel de salud financiera de la plataforma
 * Buleje SaaS: (1) P&L (MRR vs gasto real → utilidad, margen, break-even),
 * (2) gastos REALES con alta/edición, dona, tendencia vs tope, búsqueda/agrupar y
 * CSV, (3) presupuesto global + por categoría, (4) costos ESTIMADOS de infra por
 * tienda + margen. Orquesta useGastos() + sub-componentes. Brandon 2026-06-30.
 */

import { useState } from "react";
import {
  Wallet, Server, TrendingUp, TrendingDown, Download, RefreshCw, DollarSign, FileText,
  LayoutDashboard, Receipt, History, type LucideIcon,
} from "@buleje/design-system/icons";
import { SAKpiCard } from "@/components/superadmin/_shared/SAKpiCard";
import SuperadminChartCard from "@/components/superadmin/_shared/SuperadminChartCard";
import { AdminTabShell } from "../_components/_shared";
import { useGastos } from "./use-gastos";
import { fmtPen, expensesToCSV, type Expense } from "./gastos-helpers";
import { generatePnlPDF } from "./pnl-pdf";
import { PnlHero } from "./PnlHero";
import { SpendHealthBanner } from "./SpendHealthBanner";
import { BudgetPanel } from "./BudgetPanel";
import { ExpenseForm } from "./ExpenseForm";
import { ExpensesTable } from "./ExpensesTable";
import { TrendChart } from "./TrendChart";
import { CategoryDonut } from "./CategoryDonut";
import { HistoryTable } from "./HistoryTable";
import { HistoryInsights } from "./HistoryInsights";
import { TenantCostsPanel } from "./TenantCostsPanel";

const TOOL =
  "inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]";

type TabId = "resumen" | "registro" | "historial" | "costos";
const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "resumen", label: "Resumen", icon: LayoutDashboard },
  { id: "registro", label: "Registro", icon: Receipt },
  { id: "historial", label: "Historial", icon: History },
  { id: "costos", label: "Costos por tienda", icon: Server },
];

export default function GastosClient() {
  const g = useGastos();
  const [tab, setTab] = useState<TabId>("resumen");
  const [editing, setEditing] = useState<Expense | null>(null);

  const runRate = g.summary?.monthlyRunRatePen ?? 0;
  const prev = g.summary?.prevMonthRunRatePen ?? 0;
  const delta = prev > 0 ? ((runRate - prev) / prev) * 100 : null;

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
    <AdminTabShell
      title="Gastos de plataforma"
      description="Ingresos vs gasto real, presupuesto, historial y costos de infra por tienda."
      icon={Wallet}
      kicker="Plataforma · Finanzas"
      actions={
        <div className="flex items-center gap-2">
          <button onClick={exportPnl} className={TOOL}>
            <FileText className="h-4 w-4" /> P&L PDF
          </button>
          <button onClick={() => void g.load()} disabled={g.busy} className={TOOL}>
            <RefreshCw className="h-4 w-4" /> Actualizar
          </button>
        </div>
      }
    >
      {/* Tab bar segmentado (mismo patrón de pestañas del panel) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold transition ${
                tab === id
                  ? "bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        {tab === "registro" && g.expenses.length > 0 && (
          <button onClick={downloadCSV} className={TOOL}>
            <Download className="h-4 w-4" /> CSV
          </button>
        )}
      </div>

      {g.err && (
        <p className="rounded-lg bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-600,#dc2626)]">{g.err}</p>
      )}

      {/* ── Resumen: salud financiera ─────────────────────────────────────── */}
      {tab === "resumen" && (
        <>
          <PnlHero mrrPen={g.mrrPen} runRatePen={runRate} payingTenants={g.payingTenants} />

          <SpendHealthBanner
            runRatePen={runRate}
            prevRunRatePen={prev}
            recurringMonthlyPen={g.summary?.recurringMonthlyPen ?? 0}
            budgetPen={g.budget}
          />

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

          {/* Mapa del dinero: ¿va subiendo? · ¿dónde se va? — antes escondido en
              el tab Registro; en el Resumen ejecutivo es lo primero que se mira. */}
          <div className="grid gap-3 lg:grid-cols-2">
            <SuperadminChartCard
              kicker="Tendencia"
              title="Gasto de los últimos 6 meses"
              description="Barras = gasto real por mes; la línea punteada es tu tope."
              density="compact"
            >
              <TrendChart trend={g.summary?.trend ?? []} budgetPen={g.budget} />
            </SuperadminChartCard>
            <SuperadminChartCard
              kicker="Distribución"
              title="¿Dónde se va la plata?"
              description="Reparto del gasto de este mes por categoría."
              density="compact"
            >
              <CategoryDonut data={g.summary?.byCategory ?? []} />
            </SuperadminChartCard>
          </div>

          <SuperadminChartCard
            kicker="Control"
            title="Presupuesto mensual"
            description="Tope global y por categoría; te avisamos por email al cruzar un tope."
            density="compact"
          >
            <BudgetPanel
              budget={g.budget}
              budgetByCategory={g.budgetByCategory}
              runRatePen={runRate}
              byCategory={g.summary?.byCategory ?? []}
              busy={g.busy}
              onSaveBudget={(v) => void g.saveBudget(v)}
              onSaveBudgetByCategory={(next) => void g.saveBudgetByCategory(next)}
            />
          </SuperadminChartCard>
        </>
      )}

      {/* ── Registro: alta/edición + distribución ─────────────────────────── */}
      {tab === "registro" && (
        <>
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
            <div className="grid gap-5 sm:grid-cols-2 lg:col-span-2">
              <SuperadminChartCard title="Por categoría" density="compact">
                <CategoryDonut data={g.summary?.byCategory ?? []} />
              </SuperadminChartCard>
              <SuperadminChartCard title="Tendencia (6 meses)" density="compact">
                <TrendChart trend={g.summary?.trend ?? []} budgetPen={g.budget} />
              </SuperadminChartCard>
            </div>
          </div>

          <SuperadminChartCard
            title="Gastos reales"
            description="Facturas y costos recurrentes de la plataforma (Buleje SaaS)."
            density="compact"
          >
            <ExpensesTable
              expenses={g.expenses}
              loading={g.loading}
              busy={g.busy}
              fxRate={g.fxRate}
              onEdit={(x) => setEditing(x)}
              onDelete={(id) => void g.removeExpense(id)}
              onSaveFx={(rate) => void g.saveFxRate(rate)}
            />
          </SuperadminChartCard>
        </>
      )}

      {/* ── Historial mensual ─────────────────────────────────────────────── */}
      {tab === "historial" && (
        <>
          <HistoryInsights history={g.history} />
          <SuperadminChartCard
            kicker="Detalle"
            title="Historial mensual"
            description="Cierre real congelado por mes; expandí un mes para ver el desglose por categoría."
            density="compact"
          >
            <HistoryTable history={g.history} />
          </SuperadminChartCard>
        </>
      )}

      {/* ── Costos de infra por tienda ────────────────────────────────────── */}
      {tab === "costos" && <TenantCostsPanel costs={g.costs} loading={g.loading} />}
    </AdminTabShell>
  );
}
