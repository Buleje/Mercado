"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

// ── Types ──────────────────────────────────────────────────────────────────────

type ScenarioId = "price-increase" | "delivery" | "drop-category" | "second-store";

type ScenarioResult = {
  label: string;
  before: number;
  after: number;
  unit: string;
  positive: boolean;
};

type Scenario = {
  id: ScenarioId;
  title: string;
  description: string;
  params: { id: string; label: string; min: number; max: number; step: number; default: number; unit: string }[];
};

// ── Scenarios definition ───────────────────────────────────────────────────────

const SCENARIOS: Scenario[] = [
  {
    id: "price-increase",
    title: "Subir precios",
    description: "Calcula el impacto en margen y volumen estimado si subes precios generales.",
    params: [
      { id: "pct", label: "Incremento de precio", min: 1, max: 30, step: 1, default: 10, unit: "%" },
      { id: "elasticity", label: "Sensibilidad del cliente (10=muy sensible)", min: 1, max: 10, step: 1, default: 5, unit: "/10" },
    ],
  },
  {
    id: "delivery",
    title: "Agregar delivery nocturno",
    description: "Estima ingresos adicionales si ofreces delivery entre 7pm y 10pm.",
    params: [
      { id: "orders_per_night", label: "Pedidos estimados por noche", min: 1, max: 30, step: 1, default: 8, unit: "pedidos" },
      { id: "avg_ticket", label: "Ticket promedio por pedido", min: 20, max: 200, step: 5, default: 45, unit: "S/" },
    ],
  },
  {
    id: "drop-category",
    title: "Dejar de vender una categoria",
    description: "Calcula cuanto revenue y margen perderias al eliminar tu categoria menos rentable.",
    params: [
      { id: "category_pct", label: "% de ventas que representa esa categoria", min: 1, max: 50, step: 1, default: 15, unit: "%" },
      { id: "customer_loss", label: "% clientes que compran SOLO esa categoria", min: 0, max: 30, step: 1, default: 8, unit: "%" },
    ],
  },
  {
    id: "second-store",
    title: "Abrir un segundo local",
    description: "Estima costos de apertura y revenue potencial basado en tu operacion actual.",
    params: [
      { id: "scale", label: "Tamano relativo al local actual", min: 30, max: 150, step: 10, default: 70, unit: "%" },
      { id: "ramp_months", label: "Meses para alcanzar el 100% del ritmo", min: 1, max: 12, step: 1, default: 4, unit: "meses" },
    ],
  },
];

// ── Simulation engine ──────────────────────────────────────────────────────────

function simulate(
  scenarioId: ScenarioId,
  params: Record<string, number>,
  data: BusinessData | null
): ScenarioResult[] {
  if (!data) return [];

  const { orders, sales } = data;
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const validOrders = orders.filter((o) => o.status !== "cancelado");

  const monthRev =
    validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= monthAgo).reduce((s, o) => s + o.total, 0) +
    sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo).reduce((s, sl) => s + sl.total, 0);

  const monthTxns =
    validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= monthAgo).length +
    sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo).length;

  const _avgTicket = monthTxns > 0 ? monthRev / monthTxns : 50; // available for future scenario params

  // Estimate margin from expenses
  const expMonth = data.expenses.totalMonth ?? monthRev * 0.7;
  const currentMargin = monthRev > 0 ? Math.max(0, (monthRev - expMonth) / monthRev) : 0.25;
  const currentProfit = monthRev * currentMargin;

  switch (scenarioId) {
    case "price-increase": {
      const pct = params.pct / 100;
      const elasticity = params.elasticity / 10; // 0..1
      // Price elasticity: volume decreases proportionally to elasticity
      const volumeReduction = pct * elasticity * 0.5; // max 50% reduction at max elasticity
      const newRevenue = monthRev * (1 + pct) * (1 - volumeReduction);
      const newProfit = newRevenue * (currentMargin + pct * 0.8); // margin improves
      const newTxns = monthTxns * (1 - volumeReduction);
      return [
        { label: "Ingresos mensuales", before: monthRev, after: newRevenue, unit: "S/", positive: newRevenue > monthRev },
        { label: "Utilidad mensual", before: currentProfit, after: newProfit, unit: "S/", positive: newProfit > currentProfit },
        { label: "Transacciones/mes", before: monthTxns, after: newTxns, unit: "txn", positive: false },
        { label: "Margen estimado", before: currentMargin * 100, after: (newProfit / newRevenue) * 100, unit: "%", positive: newProfit / newRevenue > currentMargin },
      ];
    }

    case "delivery": {
      const nightly = params.orders_per_night;
      const ticket = params.avg_ticket;
      const deliveryCost = nightly * 5; // S/5 per delivery (rider cost)
      const extraRev = nightly * ticket * 30; // monthly
      const extraProfit = extraRev * currentMargin - deliveryCost * 30;
      return [
        { label: "Ingresos extra/mes", before: 0, after: extraRev, unit: "S/", positive: true },
        { label: "Ingresos totales/mes", before: monthRev, after: monthRev + extraRev, unit: "S/", positive: true },
        { label: "Costo operativo extra", before: 0, after: deliveryCost * 30, unit: "S/", positive: false },
        { label: "Utilidad extra/mes", before: 0, after: Math.max(0, extraProfit), unit: "S/", positive: extraProfit > 0 },
      ];
    }

    case "drop-category": {
      const catPct = params.category_pct / 100;
      const customerLossPct = params.customer_loss / 100;
      const lostRev = monthRev * catPct;
      const lostCustomerRev = monthRev * (1 - catPct) * customerLossPct;
      const totalLoss = lostRev + lostCustomerRev;
      const newRev = monthRev - totalLoss;
      const savedCosts = lostRev * 0.6; // assume 60% COGS on dropped category
      const newProfit = newRev * currentMargin + savedCosts * 0.2;
      return [
        { label: "Ingresos mensuales", before: monthRev, after: newRev, unit: "S/", positive: false },
        { label: "Perdida directa", before: 0, after: totalLoss, unit: "S/", positive: false },
        { label: "Ahorro en costos", before: 0, after: savedCosts, unit: "S/", positive: true },
        { label: "Utilidad resultante", before: currentProfit, after: newProfit, unit: "S/", positive: newProfit > currentProfit },
      ];
    }

    case "second-store": {
      const scale = params.scale / 100;
      const rampMonths = params.ramp_months;
      const setupCost = 15000 * scale; // estimated setup
      const monthlyFixed = 3000 * scale; // rent + staff
      const projectedRev = monthRev * scale;
      const rampedRev = projectedRev * (1 / rampMonths); // avg during ramp
      const firstYearRev = rampedRev * rampMonths + projectedRev * (12 - rampMonths);
      const firstYearProfit = firstYearRev * currentMargin - monthlyFixed * 12 - setupCost;
      const breakeven = setupCost / Math.max(1, projectedRev * currentMargin - monthlyFixed);
      return [
        { label: "Revenue extra primer ano", before: 0, after: firstYearRev, unit: "S/", positive: true },
        { label: "Inversion inicial estimada", before: 0, after: setupCost, unit: "S/", positive: false },
        { label: "Costo fijo mensual", before: 0, after: monthlyFixed, unit: "S/", positive: false },
        { label: "Utilidad primer ano", before: 0, after: firstYearProfit, unit: "S/", positive: firstYearProfit > 0 },
        { label: "Meses para recuperar inversion", before: 0, after: Math.ceil(breakeven), unit: "meses", positive: breakeven <= 18 },
      ];
    }

    default:
      return [];
  }
}

// ── Bar chart CSS ──────────────────────────────────────────────────────────────

function BarChart({ results }: { results: ScenarioResult[] }) {
  if (results.length === 0) return null;

  const allValues = results.flatMap((r) => [Math.abs(r.before), Math.abs(r.after)]);
  const maxVal = Math.max(...allValues, 1);

  return (
    <div className="mt-4 space-y-3">
      {results.map((r) => {
        const beforePct = (Math.abs(r.before) / maxVal) * 100;
        const afterPct = (Math.abs(r.after) / maxVal) * 100;
        const fmt = (v: number) => {
          if (r.unit === "S/") return `S/${Math.round(v).toLocaleString("es-PE")}`;
          if (r.unit === "%") return `${v.toFixed(1)}%`;
          return `${Math.round(v)} ${r.unit}`;
        };
        return (
          <div key={r.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600 dark:text-gray-400">{r.label}</span>
            </div>
            {r.before > 0 && (
              <div className="mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-12 text-right">Antes</span>
                  <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                    <div
                      className="h-full bg-gray-300 dark:bg-gray-600 rounded"
                      style={{ width: `${beforePct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-24 text-right">{fmt(r.before)}</span>
                </div>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-12 text-right">Despues</span>
                <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded",
                      r.positive ? "bg-[#2d6a4f]" : "bg-red-400 dark:bg-red-600"
                    )}
                    style={{ width: `${afterPct}%`, transition: "width 0.6s ease" }}
                  />
                </div>
                <span className={cn(
                  "text-xs font-semibold w-24 text-right",
                  r.positive ? "text-[#2d6a4f] dark:text-[#52b788]" : "text-red-600 dark:text-red-400"
                )}>
                  {fmt(r.after)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  data: BusinessData | null;
}

export default function AIWhatIfSimulator({ data }: Props) {
  const [activeScenario, setActiveScenario] = useState<ScenarioId>("price-increase");
  const scenario = SCENARIOS.find((s) => s.id === activeScenario)!;
  const [params, setParams] = useState<Record<string, number>>(() => {
    const p: Record<string, number> = {};
    SCENARIOS.forEach((s) => s.params.forEach((param) => { p[`${s.id}-${param.id}`] = param.default; }));
    return p;
  });

  const getParam = (paramId: string) => params[`${activeScenario}-${paramId}`] ?? scenario.params.find((p) => p.id === paramId)!.default;
  const setParam = (paramId: string, value: number) => {
    setParams((prev) => ({ ...prev, [`${activeScenario}-${paramId}`]: value }));
  };

  const currentParams = Object.fromEntries(scenario.params.map((p) => [p.id, getParam(p.id)]));
  const results = useMemo(() => simulate(activeScenario, currentParams, data), [activeScenario, currentParams, data]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Simulador de Escenarios
        </h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          Explora que pasaria si cambias una variable del negocio. Estimaciones basadas en tus datos actuales.
        </p>
      </div>

      {/* Scenario selector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveScenario(s.id)}
            className={cn(
              "p-2.5 rounded-lg border text-xs font-medium text-left transition-all",
              activeScenario === s.id
                ? "bg-[#2d6a4f] text-white border-[#2d6a4f] shadow-sm"
                : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-[#2d6a4f]/50"
            )}
          >
            {s.title}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls */}
        <div>
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{scenario.title}</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">{scenario.description}</p>
          <div className="flex flex-col gap-5">
            {scenario.params.map((p) => {
              const val = getParam(p.id);
              return (
                <div key={p.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm text-gray-700 dark:text-gray-300 font-medium">{p.label}</label>
                    <span className="text-sm font-bold text-[#2d6a4f] dark:text-[#52b788]">
                      {p.unit === "S/" ? `S/ ${val}` : `${val} ${p.unit}`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={val}
                    onChange={(e) => setParam(p.id, Number(e.target.value))}
                    className="w-full h-2 rounded-full appearance-none bg-gray-200 dark:bg-gray-700 accent-[#2d6a4f] cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    <span>{p.unit === "S/" ? `S/ ${p.min}` : `${p.min} ${p.unit}`}</span>
                    <span>{p.unit === "S/" ? `S/ ${p.max}` : `${p.max} ${p.unit}`}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Results */}
        <div>
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Resultado proyectado
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            Comparacion Antes vs Despues con los parametros actuales
          </p>

          {/* Table */}
          <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden mb-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Metrica</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Antes</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Despues</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const diff = r.after - r.before;
                  const fmt = (v: number) => {
                    if (r.unit === "S/") return `S/${Math.abs(Math.round(v)).toLocaleString("es-PE")}`;
                    if (r.unit === "%") return `${Math.abs(v).toFixed(1)}%`;
                    return `${Math.abs(Math.round(v))} ${r.unit}`;
                  };
                  return (
                    <tr
                      key={r.label}
                      className={cn("border-t border-gray-50 dark:border-gray-800", i % 2 === 0 ? "" : "bg-gray-50/50 dark:bg-gray-800/30")}
                    >
                      <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">{r.label}</td>
                      <td className="px-3 py-2 text-xs text-gray-500 text-right">{r.before > 0 ? fmt(r.before) : "—"}</td>
                      <td className={cn("px-3 py-2 text-xs font-semibold text-right", r.positive ? "text-[#2d6a4f] dark:text-[#52b788]" : "text-red-600 dark:text-red-400")}>
                        {fmt(r.after)}
                      </td>
                      <td className={cn("px-3 py-2 text-xs font-medium text-right", diff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                        {diff !== 0 ? `${diff >= 0 ? "+" : "-"}${fmt(Math.abs(diff))}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bar chart */}
          <BarChart results={results} />
        </div>
      </div>
    </div>
  );
}
