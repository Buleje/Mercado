"use client";


import { CardTitle, PageTitle } from "@buleje/design-system";
import { useState, useMemo } from "react";
import { Calculator, TrendingDown, Download } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

type AmortRow = {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

function calcAmortization(
  principal: number,
  annualRate: number,
  months: number
): AmortRow[] {
  if (principal <= 0 || months <= 0) return [];
  const monthly = annualRate / 100 / 12;
  const payment =
    monthly === 0
      ? principal / months
      : (principal * monthly) / (1 - Math.pow(1 + monthly, -months));

  const rows: AmortRow[] = [];
  let balance = principal;
  for (let m = 1; m <= months; m++) {
    const interest = balance * monthly;
    const princ = payment - interest;
    balance = Math.max(0, balance - princ);
    rows.push({
      month: m,
      payment,
      principal: princ,
      interest,
      balance,
    });
  }
  return rows;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function LoanCalculator() {
  const [principal, setPrincipal] = useState("10000");
  const [annualRate, setAnnualRate] = useState("24");
  const [months, setMonths] = useState("12");
  const [avgMonthlySales, setAvgMonthlySales] = useState("");
  const [showTable, setShowTable] = useState(false);

  const p = parseFloat(principal) || 0;
  const r = parseFloat(annualRate) || 0;
  const m = parseInt(months) || 0;

  const rows = useMemo(() => calcAmortization(p, r, m), [p, r, m]);

  const monthlyPayment = rows[0]?.payment ?? 0;
  const totalPayment = rows.reduce((s, row) => s + row.payment, 0);
  const totalInterest = totalPayment - p;
  const salesRatio =
    parseFloat(avgMonthlySales) > 0
      ? (monthlyPayment / parseFloat(avgMonthlySales)) * 100
      : null;

  // Bar chart data
  const totalPrincipalPaid = p;
  const principalPct =
    totalPayment > 0 ? (totalPrincipalPaid / totalPayment) * 100 : 0;
  const interestPct = 100 - principalPct;

  const handleExport = () => {
    if (rows.length === 0) return;
    const lines = [
      "Mes,Cuota,Capital,Interes,Saldo",
      ...rows.map(
        (r) =>
          `${r.month},${Number(r.payment).toFixed(2)},${Number(r.principal).toFixed(2)},${Number(r.interest).toFixed(2)},${Number(r.balance).toFixed(2)}`
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "amortizacion.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header — ADR-074 Phase 3 */}
      <div>
        <p className="text-xs uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] font-semibold">Finanzas / Herramienta</p>
        <PageTitle className="mt-1 text-fs-h1 font-semibold text-[var(--text-primary)]">
          Calculadora de Préstamo
        </PageTitle>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Calcula cuotas, interés y tabla de amortización
        </p>
      </div>

      {/* Inputs */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
              Monto (S/)
            </label>
            <input
              type="number"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              min="0"
              step="100"
              className="w-full rounded-lg border border-[var(--rule-base)] bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
              Tasa anual (%)
            </label>
            <input
              type="number"
              value={annualRate}
              onChange={(e) => setAnnualRate(e.target.value)}
              min="0"
              max="200"
              step="0.5"
              className="w-full rounded-lg border border-[var(--rule-base)] bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
              Plazo (meses)
            </label>
            <input
              type="number"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              min="1"
              max="360"
              className="w-full rounded-lg border border-[var(--rule-base)] bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
              Ventas promedio/mes (S/)
            </label>
            <input
              type="number"
              value={avgMonthlySales}
              onChange={(e) => setAvgMonthlySales(e.target.value)}
              placeholder="Opcional"
              min="0"
              className="w-full rounded-lg border border-[var(--rule-base)] bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      {p > 0 && m > 0 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
              <p className="text-xs uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] font-semibold">
                Cuota mensual
              </p>
              <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)] tabular-nums">
                {fmt(monthlyPayment)}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
              <p className="text-xs uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] font-semibold">
                Total a pagar
              </p>
              <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)] tabular-nums">
                {fmt(totalPayment)}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
              <p className="text-xs uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] font-semibold">
                Interés total
              </p>
              <p className="mt-1 text-2xl font-semibold text-[var(--data-warning-500)] tabular-nums">
                {fmt(totalInterest)}
              </p>
            </div>
          </div>

          {/* Recommendation */}
          {salesRatio !== null && (
            <div
              className={cn(
                "flex items-start gap-3 rounded-xl px-4 py-3",
                salesRatio > 30
                  ? "bg-[var(--data-error-50)]"
                  : salesRatio > 15
                  ? "bg-[var(--data-warning-50)]"
                  : "bg-[var(--accent-soft)]"
              )}
            >
              <TrendingDown
                className={cn(
                  "mt-0.5 h-5 w-5 shrink-0",
                  salesRatio > 30
                    ? "text-[var(--data-error-500)]"
                    : salesRatio > 15
                    ? "text-[var(--data-warning-500)]"
                    : "text-[var(--data-success-500)]"
                )}
              />
              <p
                className={cn(
                  "text-sm font-medium",
                  salesRatio > 30
                    ? "text-[var(--data-error-500)]"
                    : salesRatio > 15
                    ? "text-[var(--data-warning-500)]"
                    : "text-[var(--data-success-500)]"
                )}
              >
                La cuota mensual representa el {salesRatio.toFixed(1)}% de tus
                ventas promedio.{" "}
                {salesRatio > 30
                  ? "Es un compromiso alto — considera un plazo mayor."
                  : salesRatio > 15
                  ? "Es manejable, pero monitorea el flujo de caja."
                  : "Excelente ratio — la cuota es sostenible."}
              </p>
            </div>
          )}

          {/* Capital vs interest chart */}
          <div className="rounded-xl border border-[var(--rule-base)] bg-white p-5">
            <CardTitle className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
              Proporcion capital vs interes
            </CardTitle>
            <div className="h-6 overflow-hidden rounded-full">
              <div className="flex h-full">
                <div
                  className="flex items-center justify-center bg-primary text-xs font-semibold text-white"
                  style={{ width: `${principalPct}%` }}
                >
                  {principalPct > 15 && `${principalPct.toFixed(0)}%`}
                </div>
                <div
                  className="flex items-center justify-center bg-secondary text-xs font-semibold text-white"
                  style={{ width: `${interestPct}%` }}
                >
                  {interestPct > 15 && `${interestPct.toFixed(0)}%`}
                </div>
              </div>
            </div>
            <div className="mt-2 flex gap-4">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-primary" />
                <span className="text-xs text-[var(--text-secondary)]">
                  Capital ({fmt(p)})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-secondary" />
                <span className="text-xs text-[var(--text-secondary)]">
                  Interes ({fmt(totalInterest)})
                </span>
              </div>
            </div>
          </div>

          {/* Amortization table toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowTable(!showTable)}
              className="flex items-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/5"
            >
              <Calculator className="h-4 w-4" />
              {showTable ? "Ocultar tabla" : "Ver tabla de amortizacion"}
            </button>
            {showTable && (
              <button
                onClick={handleExport}
                className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-gray-200"
              >
                <Download className="h-4 w-4" />
                Exportar CSV
              </button>
            )}
          </div>

          {showTable && (
            <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary/10">
                    <th className="px-4 py-2.5 text-left font-semibold text-[var(--text-primary)]">
                      Mes
                    </th>
                    <th className="px-4 py-2.5 text-right font-semibold text-[var(--text-primary)]">
                      Cuota
                    </th>
                    <th className="px-4 py-2.5 text-right font-semibold text-[var(--text-primary)]">
                      Capital
                    </th>
                    <th className="px-4 py-2.5 text-right font-semibold text-[var(--text-primary)]">
                      Interes
                    </th>
                    <th className="px-4 py-2.5 text-right font-semibold text-[var(--text-primary)]">
                      Saldo
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {rows.map((row, i) => (
                    <tr
                      key={row.month}
                      className={cn(
                        i % 2 === 0
                          ? "bg-white"
                          : "bg-gray-50"
                      )}
                    >
                      <td className="px-4 py-2 text-[var(--text-secondary)]">
                        {row.month}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-[var(--text-primary)]">
                        {fmt(row.payment)}
                      </td>
                      <td className="px-4 py-2 text-right text-primary">
                        {fmt(row.principal)}
                      </td>
                      <td className="px-4 py-2 text-right text-[var(--data-warning-500)]">
                        {fmt(row.interest)}
                      </td>
                      <td className="px-4 py-2 text-right text-[var(--text-primary)]">
                        {fmt(row.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center rounded-xl border border-dashed border-[var(--rule-base)] bg-gray-50 py-12">
          <p className="text-sm text-[var(--text-tertiary)]">
            Ingresa los datos del prestamo para ver los calculos.
          </p>
        </div>
      )}
    </div>
  );
}
