"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

// ── Score engine ───────────────────────────────────────────────────────────────

type SubScore = {
  label: string;
  score: number;
  max: number;
  explanation: string;
};

function computeHealthScore(data: BusinessData | null): { total: number; subs: SubScore[] } {
  if (!data) return { total: 0, subs: [] };

  const { products, orders, sales, customers, expenses } = data;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const prevMonthAgo = new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);

  const validOrders = orders.filter((o) => o.status !== "cancelado");

  // Revenue helpers
  const revMonth = validOrders
    .filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= monthAgo)
    .reduce((s, o) => s + o.total, 0) +
    sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo)
      .reduce((s, sl) => s + sl.total, 0);

  const revPrevMonth = validOrders
    .filter((o) => {
      const d = o.createdAt?.slice(0, 10) ?? "";
      return d >= prevMonthAgo && d < monthAgo;
    })
    .reduce((s, o) => s + o.total, 0) +
    sales.filter((s) => {
      const d = s.createdAt?.slice(0, 10) ?? "";
      return d >= prevMonthAgo && d < monthAgo;
    }).reduce((s, sl) => s + sl.total, 0);

  const revWeek = validOrders
    .filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= weekAgo)
    .reduce((s, o) => s + o.total, 0) +
    sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo)
      .reduce((s, sl) => s + sl.total, 0);

  const revPrevWeek = validOrders
    .filter((o) => {
      const d = o.createdAt?.slice(0, 10) ?? "";
      const twoWeekAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
      return d >= twoWeekAgo && d < weekAgo;
    })
    .reduce((s, o) => s + o.total, 0);

  // 1. Ventas (25)
  let salesScore = 25;
  const salesDelta = revPrevMonth > 0 ? (revMonth - revPrevMonth) / revPrevMonth : 0;
  if (salesDelta < -0.3) salesScore -= 15;
  else if (salesDelta < -0.1) salesScore -= 8;
  else if (salesDelta >= 0.1) salesScore = Math.min(25, salesScore + 3);
  if (revMonth === 0) salesScore = 0;
  const salesLabel = revMonth === 0
    ? "Sin ventas este mes"
    : salesDelta < -0.2
    ? `Ventas bajaron ${(Math.abs(salesDelta) * 100).toFixed(0)}% vs mes anterior`
    : salesDelta > 0.1
    ? `Ventas subieron ${(salesDelta * 100).toFixed(0)}% vs mes anterior`
    : "Ventas estables";

  // 2. Inventario (20)
  const activeProducts = products.filter((p) => p.active !== false);
  const outOfStock = activeProducts.filter((p) => (p.stock ?? 0) === 0);
  const lowStock = activeProducts.filter(
    (p) => p.stock != null && p.stockMin != null && p.stock > 0 && p.stock <= p.stockMin
  );
  const overstockThreshold = 10;
  const overstock = activeProducts.filter(
    (p) => p.stockMin != null && p.stock != null && p.stock > p.stockMin * overstockThreshold
  );
  let invScore = 20;
  invScore -= outOfStock.length * 2;
  invScore -= lowStock.length * 1;
  invScore -= Math.min(5, overstock.length);
  invScore = Math.max(0, Math.min(20, invScore));
  const invLabel = outOfStock.length > 0
    ? `${outOfStock.length} producto${outOfStock.length > 1 ? "s" : ""} agotado${outOfStock.length > 1 ? "s" : ""}, ${lowStock.length} con stock bajo`
    : lowStock.length > 0
    ? `${lowStock.length} producto${lowStock.length > 1 ? "s" : ""} con stock bajo`
    : "Inventario en buen estado";

  // 3. Finanzas (20)
  const expMonth = expenses.totalMonth ?? 0;
  const margin = revMonth > 0 ? Math.max(0, (revMonth - expMonth) / revMonth) : 0;
  let finScore = 20;
  if (margin < 0.05) finScore = 5;
  else if (margin < 0.15) finScore = 12;
  else if (margin < 0.25) finScore = 16;
  const overduePayables = data.alerts?.overduePayables ?? 0;
  finScore -= Math.min(8, overduePayables * 2);
  finScore = Math.max(0, Math.min(20, finScore));
  const finLabel = margin < 0.1
    ? `Margen bajo (${(margin * 100).toFixed(1)}%), revisar gastos`
    : `Margen ${(margin * 100).toFixed(1)}% — ${overduePayables > 0 ? `${overduePayables} pagos vencidos` : "sin pagos vencidos"}`;

  // 4. Clientes (15)
  const month30 = monthAgo;
  const recentBuyers = new Set<string>();
  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= month30)) {
    if (s.customerPhone) recentBuyers.add(s.customerPhone);
  }
  for (const o of validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= month30)) {
    if (o.customer?.phone) recentBuyers.add(o.customer.phone);
  }
  const retentionRate = customers.length > 0 ? recentBuyers.size / customers.length : 0;
  const newCustomers = customers.filter((c) => (c.createdAt?.slice(0, 10) ?? "") >= monthAgo).length;
  let custScore = 15;
  if (retentionRate < 0.2) custScore -= 8;
  else if (retentionRate < 0.4) custScore -= 4;
  if (newCustomers > 5) custScore = Math.min(15, custScore + 2);
  custScore = Math.max(0, Math.min(15, custScore));
  const custLabel = retentionRate > 0
    ? `${(retentionRate * 100).toFixed(0)}% retencin 30d, ${newCustomers} nuevos este mes`
    : `${newCustomers} clientes nuevos este mes`;

  // 5. Operaciones (10)
  const cancelledMonth = orders.filter(
    (o) => o.status === "cancelado" && (o.createdAt?.slice(0, 10) ?? "") >= monthAgo
  ).length;
  const totalOrdersMonth = orders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= monthAgo).length;
  const cancelRate = totalOrdersMonth > 0 ? cancelledMonth / totalOrdersMonth : 0;
  let opsScore = 10;
  if (cancelRate > 0.2) opsScore -= 5;
  else if (cancelRate > 0.1) opsScore -= 2;
  opsScore = Math.max(0, Math.min(10, opsScore));
  const opsLabel = cancelRate > 0.1
    ? `Tasa cancelacion ${(cancelRate * 100).toFixed(0)}% — revisar pedidos`
    : "Operaciones sin alertas criticas";

  // 6. Crecimiento (10)
  let growthScore = 10;
  const growthDelta = revPrevWeek > 0 ? (revWeek - revPrevWeek) / revPrevWeek : 0;
  if (growthDelta < -0.15) growthScore = 3;
  else if (growthDelta < 0) growthScore = 6;
  else if (growthDelta > 0.1) growthScore = Math.min(10, growthScore + 2);
  growthScore = Math.max(0, Math.min(10, growthScore));
  const growthLabel = growthDelta >= 0
    ? `Semana: +${(growthDelta * 100).toFixed(0)}% vs semana anterior`
    : `Semana: ${(growthDelta * 100).toFixed(0)}% vs semana anterior`;

  const subs: SubScore[] = [
    { label: "Ventas", score: salesScore, max: 25, explanation: salesLabel },
    { label: "Inventario", score: invScore, max: 20, explanation: invLabel },
    { label: "Finanzas", score: finScore, max: 20, explanation: finLabel },
    { label: "Clientes", score: custScore, max: 15, explanation: custLabel },
    { label: "Operaciones", score: opsScore, max: 10, explanation: opsLabel },
    { label: "Crecimiento", score: growthScore, max: 10, explanation: growthLabel },
  ];

  const total = subs.reduce((s, sub) => s + sub.score, 0);
  return { total, subs };
}

function scoreColor(score: number) {
  if (score >= 70) return { ring: "stroke-emerald-500", text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500", label: "Saludable", labelBg: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300" };
  if (score >= 50) return { ring: "stroke-amber-500", text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500", label: "Moderado", labelBg: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300" };
  return { ring: "stroke-red-500", text: "text-red-600 dark:text-red-400", bg: "bg-red-500", label: "Critico", labelBg: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300" };
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  data: BusinessData | null;
}

export default function AIBusinessHealthScore({ data }: Props) {
  const { total, subs } = useMemo(() => computeHealthScore(data), [data]);
  const colors = scoreColor(total);

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (total / 100) * circumference;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wide">
        Salud del Negocio
      </h2>

      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Circle score */}
        <div className="relative flex items-center justify-center shrink-0">
          <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
            <circle
              cx="70" cy="70" r={radius}
              fill="none"
              className="stroke-gray-100 dark:stroke-gray-800"
              strokeWidth="12"
            />
            <circle
              cx="70" cy="70" r={radius}
              fill="none"
              className={colors.ring}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: "stroke-dashoffset 1s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
            <span className={cn("text-4xl font-bold", colors.text)}>{total}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">/ 100</span>
            <span className={cn("mt-1 px-2 py-0.5 rounded-full text-xs font-semibold", colors.labelBg)}>
              {colors.label}
            </span>
          </div>
        </div>

        {/* Sub-scores */}
        <div className="flex-1 w-full flex flex-col gap-2.5">
          {subs.map((sub) => {
            const pct = (sub.score / sub.max) * 100;
            const c = scoreColor((sub.score / sub.max) * 100);
            return (
              <div key={sub.label}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{sub.label}</span>
                  <span className={cn("text-xs font-semibold", c.text)}>
                    {sub.score}/{sub.max}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700", c.bg)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub.explanation}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
