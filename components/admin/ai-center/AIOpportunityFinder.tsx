"use client";

import { useState, useMemo } from "react";
import {
  TrendingUp, ChevronDown, ChevronUp, Clock, Users, Package,
  Repeat2, DollarSign, Star, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

// -- Types --

type OpportunityCategory = "trending" | "crosssell" | "horario" | "clientes" | "inventario" | "margen" | "seasonal";

type Priority = "high" | "medium" | "low";

type Opportunity = {
  id: string;
  category: OpportunityCategory;
  priority: Priority;
  title: string;
  data: string;
  impact: string;
  action: string;
  estimatedRevenue?: number;
};

// -- Analysis engine --

function findOpportunities(data: BusinessData | null): Opportunity[] {
  if (!data) return [];

  const { products, orders, sales, customers } = data;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const prevWeekAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);

  const validOrders = orders.filter((o) => o.status !== "cancelado");
  const activeProducts = products.filter((p) => p.active !== false);
  const opportunities: Opportunity[] = [];

  // -- 1. Trending products --
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
    .slice(0, 3);

  for (const t of trending) {
    const prod = products.find((p) => String(p.id) === t.pid);
    const rev = prod?.price ? t.qty * prod.price : 0;
    opportunities.push({
      id: `trend-${t.pid}`,
      category: "trending",
      priority: t.growth >= 0.8 ? "high" : "medium",
      title: `${t.name} subio ${(t.growth * 100).toFixed(0)}% esta semana`,
      data: `${t.qty} uds vendidas vs ${Math.round(t.qty / (1 + t.growth))} semana anterior`,
      impact: rev > 0 ? `Genero S/${rev.toFixed(0)} esta semana` : "Producto en tendencia",
      action: `Asegurar stock de "${t.name}" y considerar oferta combo`,
      estimatedRevenue: rev > 0 ? Math.round(rev * 1.3) : undefined,
    });
  }

  // -- 2. Cross-sell (top 3 pares) --
  const coOccurrence: Record<string, number> = {};
  const productTxns: Record<string, number> = {};

  for (const s of sales.filter((s) => s.items.length >= 2 && (s.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
    const pids = [...new Set(s.items.map((i) => String(i.productId)))];
    for (let a = 0; a < pids.length; a++) {
      productTxns[pids[a]] = (productTxns[pids[a]] ?? 0) + 1;
      for (let b = a + 1; b < pids.length; b++) {
        const key = [pids[a], pids[b]].sort().join("|");
        coOccurrence[key] = (coOccurrence[key] ?? 0) + 1;
      }
    }
  }

  const topPairs = Object.entries(coOccurrence)
    .map(([key, count]) => ({ key, count }))
    .filter((p) => p.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  for (const pair of topPairs) {
    const [pid1, pid2] = pair.key.split("|");
    const n1 = products.find((p) => String(p.id) === pid1)?.name ?? pid1;
    const n2 = products.find((p) => String(p.id) === pid2)?.name ?? pid2;
    const p1 = products.find((p) => String(p.id) === pid1);
    const p2 = products.find((p) => String(p.id) === pid2);
    const baseCount = Math.max(productTxns[pid1] ?? 1, productTxns[pid2] ?? 1);
    const pct = baseCount > 0 ? Math.round((pair.count / baseCount) * 100) : 0;
    const comboPrice = ((p1?.price ?? 0) + (p2?.price ?? 0)) * 0.9;
    opportunities.push({
      id: `cross-${pair.key}`,
      category: "crosssell",
      priority: pct >= 50 ? "high" : "medium",
      title: `Combo: ${n1} + ${n2}`,
      data: `${pct}% de clientes compran ambos (${pair.count} veces en 30 dias)`,
      impact: "Pack combo puede aumentar ticket promedio un 15-20%",
      action: `Crear pack a S/${comboPrice.toFixed(0)} (10% dcto) y ponerlo cerca de caja`,
      estimatedRevenue: Math.round(pair.count * 5),
    });
  }

  // -- 3. Peak hours --
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
      priority: parseInt(pctAbove) >= 50 ? "high" : "medium",
      title: `Hora pico: ${peakHour.hour}:00 - ${peakHour.hour + 1}:00`,
      data: `${pctAbove}% mas ventas que el promedio`,
      impact: "Maximizar atencion en horario de mayor demanda",
      action: `Caja disponible y stock listo de ${peakHour.hour}:00 a ${peakHour.hour + 1}:00`,
    });
  }

  // -- 4. Dead hours (extend or promote) --
  const deadHour = hourAvgs.filter((h) => h.count >= 3 && h.avg < overallAvg * 0.5).sort((a, b) => a.avg - b.avg)[0];
  if (deadHour && peakHour) {
    opportunities.push({
      id: "dead-hour",
      category: "horario",
      priority: "low",
      title: `Hora muerta: ${deadHour.hour}:00 - ${deadHour.hour + 1}:00`,
      data: `Solo ${((deadHour.avg / overallAvg) * 100).toFixed(0)}% del promedio de venta`,
      impact: "Happy hour o promo puede activar ventas en este horario",
      action: `Probar oferta tipo "2x1 entre ${deadHour.hour}:00 y ${deadHour.hour + 1}:00" por 1 semana`,
    });
  }

  // -- 5. Inactive customer recovery --
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
      priority: inactive.length >= 20 ? "high" : "medium",
      title: `${inactive.length} clientes para reactivar`,
      data: `Sin compra en 30+ dias — gasto promedio previo: S/${avgSpend.toFixed(0)}`,
      impact: "Recuperar 20% = S/" + potential + " en ventas adicionales",
      action: "Enviar cupon 10% off por WhatsApp con validez de 7 dias",
      estimatedRevenue: potential,
    });
  }

  // -- 6. NEW: High-margin products to promote --
  const highMargin = activeProducts
    .filter((p) => p.price && p.costPrice && p.costPrice > 0)
    .map((p) => ({
      ...p,
      margin: ((p.price! - p.costPrice!) / p.price!) * 100,
      profit: p.price! - p.costPrice!,
    }))
    .filter((p) => p.margin >= 40)
    .sort((a, b) => b.profit - a.profit);

  // Cross-reference: high margin but low sales
  const weekSoldQty: Record<string, number> = {};
  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo)) {
    for (const i of s.items) weekSoldQty[String(i.productId)] = (weekSoldQty[String(i.productId)] ?? 0) + i.quantity;
  }

  const underPromoted = highMargin
    .filter((p) => (weekSoldQty[String(p.id)] ?? 0) < 3)
    .slice(0, 3);

  if (underPromoted.length > 0) {
    const avgProfit = underPromoted.reduce((s, p) => s + p.profit, 0) / underPromoted.length;
    opportunities.push({
      id: "high-margin-promo",
      category: "margen",
      priority: underPromoted.some((p) => p.margin >= 60) ? "high" : "medium",
      title: `${underPromoted.length} producto${underPromoted.length > 1 ? "s" : ""} con margen alto sin impulsar`,
      data: underPromoted.map((p) => p.name + " (" + p.margin.toFixed(0) + "% margen)").join(", "),
      impact: `Cada venta extra genera ~S/${avgProfit.toFixed(0)} de ganancia neta`,
      action: "Colocar en zona visible, ofrecer como sugerencia y publicar en WhatsApp",
      estimatedRevenue: Math.round(avgProfit * 10),
    });
  }

  // -- 7. NEW: Category momentum (seasonal signal) --
  const catWeek: Record<string, number> = {};
  const catPrevWeek: Record<string, number> = {};

  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo)) {
    for (const i of s.items) {
      const prod = products.find((p) => String(p.id) === String(i.productId));
      const cat = prod?.category ?? "General";
      catWeek[cat] = (catWeek[cat] ?? 0) + i.quantity * (i.price ?? 0);
    }
  }

  for (const s of sales.filter((s) => {
    const d = s.createdAt?.slice(0, 10) ?? "";
    return d >= prevWeekAgo && d < weekAgo;
  })) {
    for (const i of s.items) {
      const prod = products.find((p) => String(p.id) === String(i.productId));
      const cat = prod?.category ?? "General";
      catPrevWeek[cat] = (catPrevWeek[cat] ?? 0) + i.quantity * (i.price ?? 0);
    }
  }

  const risingCats = Object.entries(catWeek)
    .map(([cat, rev]) => {
      const prev = catPrevWeek[cat] ?? 0;
      const growth = prev > 0 ? (rev - prev) / prev : 0;
      return { cat, rev, growth };
    })
    .filter((c) => c.growth >= 0.25 && c.rev >= 50)
    .sort((a, b) => b.growth - a.growth);

  if (risingCats.length > 0) {
    const top = risingCats[0];
    opportunities.push({
      id: `cat-rise-${top.cat}`,
      category: "seasonal",
      priority: top.growth >= 0.5 ? "high" : "medium",
      title: `Categoria "${top.cat}" subio ${(top.growth * 100).toFixed(0)}% esta semana`,
      data: `S/${top.rev.toFixed(0)} esta semana vs S/${(top.rev / (1 + top.growth)).toFixed(0)} la anterior`,
      impact: "Posible demanda estacional — aprovechar el momentum",
      action: `Reforzar stock de "${top.cat}" y destacar en vitrina/WhatsApp`,
      estimatedRevenue: Math.round(top.rev * 0.3),
    });
  }

  // -- 8. Slow-moving inventory --
  const soldPids = new Set<string>();
  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo)) {
    for (const i of s.items) soldPids.add(String(i.productId));
  }

  const stagnant = activeProducts
    .filter((p) => (p.stock ?? 0) > 0 && !soldPids.has(String(p.id)))
    .slice(0, 5);

  if (stagnant.length > 0) {
    const totalValue = stagnant.reduce((s, p) => s + (p.price ?? 0) * (p.stock ?? 0), 0);
    opportunities.push({
      id: "slow-inventory",
      category: "inventario",
      priority: totalValue >= 500 ? "high" : "medium",
      title: `${stagnant.length} producto${stagnant.length > 1 ? "s" : ""} sin venta esta semana`,
      data: stagnant.map((p) => p.name).join(", ") + ` — capital: S/${totalValue.toFixed(0)}`,
      impact: "Rotar este stock libera capital y mejora flujo de caja",
      action: "Crear oferta de liquidacion o incluir en combos semanales",
      estimatedRevenue: Math.round(totalValue * 0.3),
    });
  }

  // -- 9. NEW: Ticket upsell --
  const recentTickets = sales
    .filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo)
    .map((s) => s.total)
    .filter((t) => t > 0);

  if (recentTickets.length >= 10) {
    const avgTicket = recentTickets.reduce((a, b) => a + b, 0) / recentTickets.length;
    const belowAvg = recentTickets.filter((t) => t < avgTicket * 0.7).length;
    const belowPct = (belowAvg / recentTickets.length) * 100;
    if (belowPct >= 40) {
      opportunities.push({
        id: "ticket-upsell",
        category: "clientes",
        priority: belowPct >= 60 ? "high" : "medium",
        title: `${belowPct.toFixed(0)}% de ventas con ticket bajo`,
        data: `${belowAvg} de ${recentTickets.length} ventas estan por debajo de S/${(avgTicket * 0.7).toFixed(0)}`,
        impact: "Subir ticket promedio S/5 puede generar S/" + Math.round(recentTickets.length * 5 * 4) + "/mes",
        action: "Ofrecer producto complementario en caja: 'Te llevo tambien...?'",
        estimatedRevenue: Math.round(recentTickets.length * 5 * 4),
      });
    }
  }

  // Sort by priority then estimated revenue
  const pOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  opportunities.sort((a, b) => {
    const pd = pOrder[a.priority] - pOrder[b.priority];
    if (pd !== 0) return pd;
    return (b.estimatedRevenue ?? 0) - (a.estimatedRevenue ?? 0);
  });

  return opportunities.slice(0, 10);
}

// -- Config --

const CAT_CONFIG: Record<OpportunityCategory, { label: string; icon: React.ElementType; color: string }> = {
  trending: { label: "Tendencia", icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" },
  crosssell: { label: "Venta cruzada", icon: Repeat2, color: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30" },
  horario: { label: "Horario", icon: Clock, color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" },
  clientes: { label: "Clientes", icon: Users, color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30" },
  inventario: { label: "Inventario", icon: Package, color: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30" },
  margen: { label: "Margen", icon: DollarSign, color: "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30" },
  seasonal: { label: "Temporal", icon: Sparkles, color: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30" },
};

const PRI_BADGE: Record<Priority, string> = {
  high: "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400",
  medium: "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400",
  low: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
};

const PRI_LABEL: Record<Priority, string> = { high: "Alta", medium: "Media", low: "Baja" };

// -- Component --

interface Props {
  data: BusinessData | null;
  compact?: boolean;
}

export default function AIOpportunityFinder({ data, compact = false }: Props) {
  const opportunities = useMemo(() => findOpportunities(data), [data]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<OpportunityCategory | null>(null);

  const filtered = filterCat ? opportunities.filter((o) => o.category === filterCat) : opportunities;
  const displayed = compact ? filtered.slice(0, 3) : filtered;

  const totalPotential = opportunities.reduce((s, o) => s + (o.estimatedRevenue ?? 0), 0);

  const activeCats = useMemo(() => {
    const cats = new Set(opportunities.map((o) => o.category));
    return [...cats] as OpportunityCategory[];
  }, [opportunities]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Oportunidades Detectadas
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {totalPotential > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold">
              ~S/{totalPotential.toLocaleString("es-PE")} potencial
            </span>
          )}
          {opportunities.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#00B4A6]/10 text-[#00B4A6] dark:text-[#2dd4bf] font-semibold">
              {opportunities.length}
            </span>
          )}
        </div>
      </div>

      {!compact && activeCats.length > 1 && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          <button
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
              !filterCat
                ? "bg-[#00B4A6] text-white border-[#00B4A6]"
                : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            )}
            onClick={() => setFilterCat(null)}
          >
            Todas
          </button>
          {activeCats.map((cat) => {
            const cfg = CAT_CONFIG[cat];
            return (
              <button
                key={cat}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                  filterCat === cat
                    ? "bg-[#00B4A6] text-white border-[#00B4A6]"
                    : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                )}
                onClick={() => setFilterCat(filterCat === cat ? null : cat)}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      )}

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
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                        {opp.title}
                      </p>
                      <span className={cn("text-[9px] px-1.5 py-0 rounded-full font-semibold shrink-0", PRI_BADGE[opp.priority])}>
                        {PRI_LABEL[opp.priority]}
                      </span>
                    </div>
                    {opp.estimatedRevenue != null && opp.estimatedRevenue > 0 && (
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
                    <div className="mt-2 p-2 rounded-lg bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10 border border-[#00B4A6]/20">
                      <p className="text-xs font-medium text-[#00B4A6] dark:text-[#2dd4bf]">
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