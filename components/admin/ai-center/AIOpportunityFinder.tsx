"use client";

import { useState, useMemo } from "react";
import { TrendingUp, ChevronDown, ChevronUp, Clock, Users, Package, Repeat2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

// ── Types ──────────────────────────────────────────────────────────────────────

type OpportunityCategory = "trending" | "crosssell" | "horario" | "clientes" | "inventario";

type Opportunity = {
  id: string;
  category: OpportunityCategory;
  title: string;
  data: string;
  impact: string;
  action: string;
  estimatedRevenue?: number;
};

// ── Analysis engine ────────────────────────────────────────────────────────────

function findOpportunities(data: BusinessData | null): Opportunity[] {
  if (!data) return [];

  const { products, orders, sales, customers } = data;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const prevWeekAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);

  const validOrders = orders.filter((o) => o.status !== "cancelado");
  const opportunities: Opportunity[] = [];

  // ── 1. Trending products ──────────────────────────────────────────────
  const weekQty: Record<string, { name: string; qty: number; cat: string }> = {};
  const prevWeekQty: Record<string, number> = {};

  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo)) {
    for (const i of s.items) {
      const pid = String(i.productId);
      if (!weekQty[pid]) {
        const prod = products.find((p) => String(p.id) === pid);
        weekQty[pid] = { name: i.name, qty: 0, cat: prod?.category ?? "General" };
      }
      weekQty[pid].qty += i.quantity;
    }
  }

  for (const s of sales.filter((s) => {
    const d = s.createdAt?.slice(0, 10) ?? "";
    return d >= prevWeekAgo && d < weekAgo;
  })) {
    for (const i of s.items) {
      const pid = String(i.productId);
      prevWeekQty[pid] = (prevWeekQty[pid] ?? 0) + i.quantity;
    }
  }

  const trending = Object.entries(weekQty)
    .map(([pid, cur]) => {
      const prev = prevWeekQty[pid] ?? 0;
      const growth = prev > 0 ? (cur.qty - prev) / prev : cur.qty > 0 ? 1 : 0;
      return { pid, ...cur, growth };
    })
    .filter((p) => p.growth >= 0.3 && p.qty >= 3)
    .sort((a, b) => b.growth - a.growth)
    .slice(0, 2);

  for (const t of trending) {
    const prod = products.find((p) => String(p.id) === t.pid);
    const rev = prod?.price ? t.qty * prod.price : 0;
    opportunities.push({
      id: `trend-${t.pid}`,
      category: "trending",
      title: `${t.name} subio ${(t.growth * 100).toFixed(0)}% esta semana`,
      data: `${t.qty} unidades vendidas vs ${Math.round(t.qty / (1 + t.growth))} la semana anterior`,
      impact: rev > 0 ? `Genero S/${rev.toFixed(0)} en ventas esta semana` : "Producto en tendencia ascendente",
      action: `Asegurar stock alto de "${t.name}" y considerar oferta combo`,
      estimatedRevenue: rev > 0 ? Math.round(rev * 1.3) : undefined,
    });
  }

  // ── 2. Cross-sell opportunities ───────────────────────────────────────
  const coOccurrence: Record<string, Record<string, number>> = {};
  const productTxns: Record<string, number> = {};

  for (const s of sales.filter((s) => s.items.length >= 2 && (s.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
    const pids = s.items.map((i) => String(i.productId));
    for (let a = 0; a < pids.length; a++) {
      productTxns[pids[a]] = (productTxns[pids[a]] ?? 0) + 1;
      for (let b = a + 1; b < pids.length; b++) {
        const key = [pids[a], pids[b]].sort().join("|");
        if (!coOccurrence[key]) coOccurrence[key] = { count: 0 } as Record<string, number>;
        coOccurrence[key].count = (coOccurrence[key].count ?? 0) + 1;
      }
    }
  }

  const bestPair = Object.entries(coOccurrence)
    .map(([key, v]) => ({ key, count: v.count ?? 0 }))
    .sort((a, b) => b.count - a.count)[0];

  if (bestPair && bestPair.count >= 3) {
    const [pid1, pid2] = bestPair.key.split("|");
    const n1 = products.find((p) => String(p.id) === pid1)?.name ?? pid1;
    const n2 = products.find((p) => String(p.id) === pid2)?.name ?? pid2;
    const baseCount = Math.max(productTxns[pid1] ?? 1, productTxns[pid2] ?? 1);
    const pct = baseCount > 0 ? Math.round((bestPair.count / baseCount) * 100) : 0;
    opportunities.push({
      id: `cross-${bestPair.key}`,
      category: "crosssell",
      title: `Combo natural: ${n1} + ${n2}`,
      data: `${pct}% de clientes que compran uno, compran el otro`,
      impact: "Activar venta cruzada puede aumentar el ticket promedio",
      action: `Crear pack combo "${n1} + ${n2}" con pequeno descuento`,
      estimatedRevenue: bestPair.count * 5,
    });
  }

  // ── 3. Peak hours ─────────────────────────────────────────────────────
  const hourSales: Record<number, number[]> = {};
  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
    const h = new Date(s.createdAt ?? "").getHours();
    if (!isNaN(h)) {
      if (!hourSales[h]) hourSales[h] = [];
      hourSales[h].push(s.total);
    }
  }

  const hourAvgs = Object.entries(hourSales).map(([h, vals]) => ({
    hour: parseInt(h),
    avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    count: vals.length,
  }));

  const overallAvg = hourAvgs.reduce((s, h) => s + h.avg, 0) / (hourAvgs.length || 1);
  const peakHour = hourAvgs.filter((h) => h.avg > overallAvg * 1.3 && h.count >= 5).sort((a, b) => b.avg - a.avg)[0];

  if (peakHour) {
    const pctAbove = ((peakHour.avg / overallAvg - 1) * 100).toFixed(0);
    opportunities.push({
      id: "peak-hour",
      category: "horario",
      title: `Hora pico: entre ${peakHour.hour}:00 y ${peakHour.hour + 1}:00`,
      data: `${pctAbove}% mas ventas que el promedio en esa hora`,
      impact: "Maximizar atencion y disponibilidad en el horario de mayor demanda",
      action: `Asegurar caja disponible y stock completo de ${peakHour.hour}:00 a ${peakHour.hour + 1}:00`,
    });
  }

  // ── 4. Inactive customer recovery ────────────────────────────────────
  const recentBuyers = new Set<string>();
  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
    if (s.customerPhone) recentBuyers.add(s.customerPhone);
  }
  for (const o of validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
    if (o.customer?.phone) recentBuyers.add(o.customer.phone);
  }

  const inactive = customers.filter((c) => c.phone && !recentBuyers.has(c.phone));
  if (inactive.length >= 5) {
    const avgSpend = inactive.reduce((s, c) => s + (c.totalSpent ?? 50), 0) / inactive.length;
    const potential = Math.round(inactive.length * 0.2 * avgSpend);
    opportunities.push({
      id: "inactive-recovery",
      category: "clientes",
      title: `${inactive.length} clientes listos para reactivar`,
      data: `Sin compra en 30+ dias — historial de compras regular previo`,
      impact: "Recuperar el 20% puede generar ventas adicionales este mes",
      action: "Enviar cupon de descuento del 10% con validez de 7 dias",
      estimatedRevenue: potential,
    });
  }

  // ── 5. Slow-moving inventory ─────────────────────────────────────────
  const soldPids = new Set<string>();
  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo)) {
    for (const i of s.items) soldPids.add(String(i.productId));
  }

  const stagnant = products
    .filter((p) => p.active !== false && (p.stock ?? 0) > 0 && !soldPids.has(String(p.id)))
    .slice(0, 3);

  if (stagnant.length > 0) {
    const totalValue = stagnant.reduce((s, p) => s + (p.price ?? 0) * (p.stock ?? 0), 0);
    opportunities.push({
      id: "slow-inventory",
      category: "inventario",
      title: `${stagnant.length} producto${stagnant.length > 1 ? "s" : ""} sin venta esta semana`,
      data: `${stagnant.map((p) => p.name).join(", ")} — capital inmovilizado: S/${totalValue.toFixed(0)}`,
      impact: "Rotar este stock libera capital y mejora el flujo de caja",
      action: "Crear oferta de liquidacion o incluirlos en combos de la semana",
      estimatedRevenue: Math.round(totalValue * 0.3),
    });
  }

  return opportunities.slice(0, 6);
}

// ── Config ─────────────────────────────────────────────────────────────────────

const CAT_CONFIG: Record<OpportunityCategory, { label: string; icon: React.ElementType; color: string }> = {
  trending: { label: "Tendencia", icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" },
  crosssell: { label: "Venta cruzada", icon: Repeat2, color: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30" },
  horario: { label: "Horario", icon: Clock, color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30" },
  clientes: { label: "Clientes", icon: Users, color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30" },
  inventario: { label: "Inventario", icon: Package, color: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30" },
};

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  data: BusinessData | null;
  compact?: boolean;
}

export default function AIOpportunityFinder({ data, compact = false }: Props) {
  const opportunities = useMemo(() => findOpportunities(data), [data]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const displayed = compact ? opportunities.slice(0, 3) : opportunities;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Oportunidades Detectadas
        </h2>
        {opportunities.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#2d6a4f]/10 text-[#2d6a4f] dark:text-[#52b788] font-semibold">
            {opportunities.length} oportunidade{opportunities.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {opportunities.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-3">
          Acumulando datos para detectar oportunidades...
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {displayed.map((opp) => {
            const cfg = CAT_CONFIG[opp.category];
            const Icon = cfg.icon;
            const isExp = expanded === opp.id;
            return (
              <div
                key={opp.id}
                className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden"
              >
                <button
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  onClick={() => setExpanded(isExp ? null : opp.id)}
                >
                  <span className={cn("p-1.5 rounded-lg shrink-0", cfg.color)}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {opp.title}
                    </p>
                    {opp.estimatedRevenue && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        Potencial: S/{opp.estimatedRevenue.toLocaleString("es-PE")}
                      </p>
                    )}
                  </div>
                  {isExp ? (
                    <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                </button>
                {isExp && (
                  <div className="px-3 pb-3 pt-0 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">{opp.data}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{opp.impact}</p>
                    <div className="mt-2 p-2 rounded-lg bg-[#2d6a4f]/5 dark:bg-[#2d6a4f]/10 border border-[#2d6a4f]/20">
                      <p className="text-xs font-medium text-[#2d6a4f] dark:text-[#52b788]">
                        Accion sugerida: {opp.action}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {compact && opportunities.length > 3 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center pt-1">
              +{opportunities.length - 3} oportunidade{opportunities.length - 3 > 1 ? "s" : ""} mas en Diagnostico
            </p>
          )}
        </div>
      )}
    </div>
  );
}
