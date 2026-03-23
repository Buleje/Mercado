"use client";
 

import { useState, useMemo, useEffect } from "react";
import { Calculator, TrendingDown, Download } from "lucide-react";
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
          `${r.month},${r.payment.toFixed(2)},${r.principal.toFixed(2)},${r.interest.toFixed(2)},${r.balance.toFixed(2)}`
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
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Calculadora de Prestamo
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Calcula cuotas, interes y tabla de amortizacion
        </p>
      </div>

      {/* Inputs */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Monto (S/)
            </label>
            <input
              type="number"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              min="0"
              step="100"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-[#2d6a4f] focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Tasa anual (%)
            </label>
            <input
              type="number"
              value={annualRate}
              onChange={(e) => setAnnualRate(e.target.value)}
              min="0"
              max="200"
              step="0.5"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-[#2d6a4f] focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Plazo (meses)
            </label>
            <input
              type="number"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              min="1"
              max="360"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-[#2d6a4f] focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Ventas promedio/mes (S/)
            </label>
            <input
              type="number"
              value={avgMonthlySales}
              onChange={(e) => setAvgMonthlySales(e.target.value)}
              placeholder="Opcional"
              min="0"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-[#2d6a4f] focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      {p > 0 && m > 0 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Cuota mensual
              </p>
              <p className="mt-1 text-2xl font-bold text-[#2d6a4f]">
                {fmt(monthlyPayment)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Total a pagar
              </p>
              <p className="mt-1 text-2xl font-bold text-[#2d6a4f]">
                {fmt(totalPayment)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Interes total
              </p>
              <p className="mt-1 text-2xl font-bold text-amber-600">
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
                  ? "bg-red-50 dark:bg-red-900/10"
                  : salesRatio > 15
                  ? "bg-amber-50 dark:bg-amber-900/10"
                  : "bg-emerald-50 dark:bg-emerald-900/10"
              )}
            >
              <TrendingDown
                className={cn(
                  "mt-0.5 h-5 w-5 shrink-0",
                  salesRatio > 30
                    ? "text-red-500"
                    : salesRatio > 15
                    ? "text-amber-500"
                    : "text-emerald-500"
                )}
              />
              <p
                className={cn(
                  "text-sm font-medium",
                  salesRatio > 30
                    ? "text-red-700 dark:text-red-400"
                    : salesRatio > 15
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-emerald-700 dark:text-emerald-400"
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
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
            <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white">
              Proporcion capital vs interes
            </h3>
            <div className="h-6 overflow-hidden rounded-full">
              <div className="flex h-full">
                <div
                  className="flex items-center justify-center bg-[#2d6a4f] text-xs font-semibold text-white"
                  style={{ width: `${principalPct}%` }}
                >
                  {principalPct > 15 && `${principalPct.toFixed(0)}%`}
                </div>
                <div
                  className="flex items-center justify-center bg-[#f4a261] text-xs font-semibold text-white"
                  style={{ width: `${interestPct}%` }}
                >
                  {interestPct > 15 && `${interestPct.toFixed(0)}%`}
                </div>
              </div>
            </div>
            <div className="mt-2 flex gap-4">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-[#2d6a4f]" />
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  Capital ({fmt(p)})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-[#f4a261]" />
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  Interes ({fmt(totalInterest)})
                </span>
              </div>
            </div>
          </div>

          {/* Amortization table toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowTable(!showTable)}
              className="flex items-center gap-2 rounded-lg border border-[#2d6a4f] px-4 py-2 text-sm font-medium text-[#2d6a4f] transition hover:bg-[#2d6a4f]/5 dark:text-emerald-400"
            >
              <Calculator className="h-4 w-4" />
              {showTable ? "Ocultar tabla" : "Ver tabla de amortizacion"}
            </button>
            {showTable && (
              <button
                onClick={handleExport}
                className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Download className="h-4 w-4" />
                Exportar CSV
              </button>
            )}
          </div>

          {showTable && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#2d6a4f]/10 dark:bg-[#2d6a4f]/20">
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-700 dark:text-gray-300">
                      Mes
                    </th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-700 dark:text-gray-300">
                      Cuota
                    </th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-700 dark:text-gray-300">
                      Capital
                    </th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-700 dark:text-gray-300">
                      Interes
                    </th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-700 dark:text-gray-300">
                      Saldo
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
                  {rows.map((row, i) => (
                    <tr
                      key={row.month}
                      className={cn(
                        i % 2 === 0
                          ? "bg-white dark:bg-gray-900"
                          : "bg-gray-50 dark:bg-gray-800/40"
                      )}
                    >
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                        {row.month}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-gray-800 dark:text-gray-200">
                        {fmt(row.payment)}
                      </td>
                      <td className="px-4 py-2 text-right text-[#2d6a4f]">
                        {fmt(row.principal)}
                      </td>
                      <td className="px-4 py-2 text-right text-amber-600">
                        {fmt(row.interest)}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700 dark:text-gray-300">
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
        <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-12 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-sm text-gray-400">
            Ingresa los datos del prestamo para ver los calculos.
          </p>
        </div>
      )}
    </div>
  );
}
