"use client";

import { useMemo, useState, useEffect } from "react";
import { Package, DollarSign, Users, Settings, Shield, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

// -- Types --

type Severity = "critical" | "high" | "medium" | "low";

type Risk = {
  id: string;
  category: "inventario" | "financiero" | "clientes" | "operativo";
  severity: Severity;
  title: string;
  detail: string;
  action: string;
  impactEstimate?: string;
};

// -- Dismiss logic (7-day suppression) --

const DISMISS_KEY = "ai-risk-dismissed";

function getDismissed(): Record<string, number> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return {};
}

function dismissRisk(id: string) {
  const current = getDismissed();
  current[id] = Date.now();
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(current)); } catch { /* noop */ }
}

// -- Risk engine --

function detectRisks(data: BusinessData | null): Risk[] {
  if (!data) return [];

  const { products, orders, sales, customers } = data;
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const twoWeekAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);

  const risks: Risk[] = [];
  const validOrders = orders.filter((o) => o.status !== "cancelado");
  const activeProducts = products.filter((p) => p.active !== false);

  const revForPeriod = (from: string, to: string) => {
    const ord = validOrders
      .filter((o) => { const d = o.createdAt?.slice(0, 10) ?? ""; return d >= from && d <= to; })
      .reduce((s, o) => s + o.total, 0);
    const sal = sales
      .filter((s) => { const d = s.createdAt?.slice(0, 10) ?? ""; return d >= from && d <= to; })
      .reduce((s, sl) => s + sl.total, 0);
    return ord + sal;
  };

  // 1. Out of stock
  const outOfStock = activeProducts.filter((p) => (p.stock ?? 0) === 0);
  if (outOfStock.length > 0) {
    risks.push({
      id: "oos",
      category: "inventario",
      severity: outOfStock.length >= 5 ? "critical" : "high",
      title: outOfStock.length + " producto" + (outOfStock.length > 1 ? "s" : "") + " sin stock",
      detail: outOfStock.slice(0, 4).map((p) => p.name).join(", ") + (outOfStock.length > 4 ? "..." : ""),
      action: "Ir a Inventario y colocar orden de compra urgente",
      impactEstimate: "Pierdes ventas potenciales cada hora sin estos productos",
    });
  }

  // 2. Low stock
  const lowStock = activeProducts.filter(
    (p) => p.stock != null && p.stockMin != null && p.stock > 0 && p.stock <= p.stockMin
  );
  if (lowStock.length > 0) {
    risks.push({
      id: "low-stock",
      category: "inventario",
      severity: lowStock.length >= 5 ? "high" : "medium",
      title: lowStock.length + " producto" + (lowStock.length > 1 ? "s" : "") + " con stock critico",
      detail: lowStock.slice(0, 3).map((p) => p.name + " (" + p.stock + "/" + p.stockMin + ")").join(", "),
      action: "Programar pedido a proveedores antes del fin de semana",
      impactEstimate: "Se agotaran en 1-3 dias al ritmo actual",
    });
  }

  // 3. NUEVO: Overstock (>10x stockMin)
  const overstock = activeProducts.filter(
    (p) => p.stockMin != null && p.stock != null && p.stockMin > 0 && p.stock > p.stockMin * 10
  );
  if (overstock.length > 0) {
    const totalValue = overstock.reduce((s, p) => s + (p.price ?? 0) * ((p.stock ?? 0) - (p.stockMin ?? 0) * 3), 0);
    risks.push({
      id: "overstock",
      category: "inventario",
      severity: overstock.length >= 3 ? "medium" : "low",
      title: overstock.length + " producto" + (overstock.length > 1 ? "s" : "") + " con sobre-stock",
      detail: overstock.slice(0, 3).map((p) => p.name + " (" + p.stock + " uds, min: " + p.stockMin + ")").join(", "),
      action: "No recomprar hasta que bajen a niveles normales. Considerar ofertas para rotar",
      impactEstimate: totalValue > 0 ? "~S/" + Math.round(totalValue) + " en capital inmovilizado" : undefined,
    });
  }

  // 4. NUEVO: Dead stock (stock pero 0 ventas en 30 dias)
  const soldPids30d = new Set<string>();
  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
    for (const i of s.items) soldPids30d.add(String(i.productId));
  }
  const deadStock = activeProducts.filter(
    (p) => (p.stock ?? 0) > 0 && !soldPids30d.has(String(p.id))
  );
  if (deadStock.length >= 3) {
    const deadValue = deadStock.reduce((s, p) => s + (p.price ?? 0) * (p.stock ?? 0), 0);
    risks.push({
      id: "dead-stock",
      category: "inventario",
      severity: deadStock.length >= 8 ? "high" : "medium",
      title: deadStock.length + " productos sin venta en 30 dias",
      detail: deadStock.slice(0, 3).map((p) => p.name).join(", ") + (deadStock.length > 3 ? " y " + (deadStock.length - 3) + " mas" : ""),
      action: "Liquidar con descuento, armar combos, o donar antes de que venzan",
      impactEstimate: deadValue > 0 ? "S/" + Math.round(deadValue) + " en inventario muerto" : undefined,
    });
  }

  // 5. Facturas vencidas
  const overduePayables = data.alerts?.overduePayables ?? 0;
  if (overduePayables > 0) {
    risks.push({
      id: "overdue-pay",
      category: "financiero",
      severity: overduePayables >= 3 ? "critical" : "high",
      title: overduePayables + " factura" + (overduePayables > 1 ? "s" : "") + " vencida" + (overduePayables > 1 ? "s" : ""),
      detail: "Pagos a proveedores fuera de plazo - riesgo de corte de credito",
      action: "Revisar Cuentas por Pagar y pagar hoy las mas urgentes",
      impactEstimate: "Riesgo de perder credito con proveedores",
    });
  }

  // 6. Revenue drop semanal
  const revWeek = revForPeriod(weekAgo, now.toISOString().slice(0, 10));
  const revPrevWeek = revForPeriod(twoWeekAgo, weekAgo);
  if (revPrevWeek > 0 && revWeek < revPrevWeek * 0.75) {
    const dropPct = Math.round((1 - revWeek / revPrevWeek) * 100);
    risks.push({
      id: "revenue-drop",
      category: "financiero",
      severity: "high",
      title: "Caida de ventas del " + dropPct + "% vs semana anterior",
      detail: "Esta semana: S/" + revWeek.toFixed(0) + " vs S/" + revPrevWeek.toFixed(0) + " la semana pasada",
      action: "Revisar causas: promociones activas, stock, horarios de atencion",
      impactEstimate: "Dejaste de vender ~S/" + Math.round(revPrevWeek - revWeek) + " esta semana",
    });
  }

  // 7. NUEVO: Tendencia negativa (3+ semanas bajando)
  const weeklyRevenues: number[] = [];
  for (let w = 0; w < 4; w++) {
    const end = new Date(now.getTime() - w * 7 * 86_400_000).toISOString().slice(0, 10);
    const start = new Date(now.getTime() - (w + 1) * 7 * 86_400_000).toISOString().slice(0, 10);
    weeklyRevenues.push(revForPeriod(start, end));
  }
  let consecutiveDeclines = 0;
  for (let i = 0; i < weeklyRevenues.length - 1; i++) {
    if (weeklyRevenues[i] < weeklyRevenues[i + 1] && weeklyRevenues[i + 1] > 0) {
      consecutiveDeclines++;
    } else break;
  }
  if (consecutiveDeclines >= 3) {
    const totalDrop = weeklyRevenues[3] > 0 ? Math.round((1 - weeklyRevenues[0] / weeklyRevenues[3]) * 100) : 0;
    risks.push({
      id: "trend-decline",
      category: "financiero",
      severity: "critical",
      title: consecutiveDeclines + " semanas consecutivas de caida en ventas",
      detail: "Tendencia negativa sostenida: bajaste " + totalDrop + "% en el ultimo mes",
      action: "URGENTE: Investigar causas raiz - competencia, precios, calidad de servicio",
      impactEstimate: "Si continua, riesgo de no cubrir gastos fijos en 2-3 semanas",
    });
  }

  // 8. NUEVO: Riesgo de liquidez
  const expMonth = data.expenses?.totalMonth ?? 0;
  const revMonth = revForPeriod(monthAgo, now.toISOString().slice(0, 10));
  if (expMonth > 0 && revMonth > 0) {
    const cashRatio = revMonth / expMonth;
    if (cashRatio < 1.1) {
      risks.push({
        id: "liquidity",
        category: "financiero",
        severity: cashRatio < 0.9 ? "critical" : "high",
        title: cashRatio < 1 ? "Gastos superan ingresos este mes" : "Liquidez ajustada - margen muy bajo",
        detail: "Ingresos: S/" + Math.round(revMonth) + " vs Gastos: S/" + Math.round(expMonth) + " (ratio: " + cashRatio.toFixed(2) + ")",
        action: cashRatio < 1 ? "URGENTE: Reducir gastos variables y acelerar cobros de fiados" : "Monitorear gastos de cerca, priorizar cobros pendientes",
        impactEstimate: cashRatio < 1 ? "Deficit de S/" + Math.round(expMonth - revMonth) + " este mes" : "Solo S/" + Math.round(revMonth - expMonth) + " de colchon",
      });
    }
  }

  // 9. NUEVO: Erosion de margen
  const prodMargins: { name: string; margin: number }[] = [];
  for (const p of activeProducts) {
    if (p.price && p.costPrice && p.costPrice > 0) {
      const margin = ((p.price - p.costPrice) / p.price) * 100;
      if (margin < 10) prodMargins.push({ name: p.name, margin });
    }
  }
  if (prodMargins.length >= 3) {
    risks.push({
      id: "margin-erosion",
      category: "financiero",
      severity: prodMargins.some((p) => p.margin < 0) ? "high" : "medium",
      title: prodMargins.length + " productos con margen menor al 10%",
      detail: prodMargins.slice(0, 3).map((p) => p.name + " (" + p.margin.toFixed(1) + "%)").join(", "),
      action: "Renegociar costo con proveedor o subir precio gradualmente",
      impactEstimate: "Trabaja casi sin ganancia en estos items",
    });
  }

  // 10. Clientes inactivos
  const recentBuyers = new Set<string>();
  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
    if (s.customerPhone) recentBuyers.add(s.customerPhone);
  }
  for (const o of validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
    if (o.customer?.phone) recentBuyers.add(o.customer.phone);
  }

  const inactiveCount = customers.filter((c) => c.phone && !recentBuyers.has(c.phone)).length;
  if (inactiveCount > 0 && customers.length > 0) {
    const inactivePct = inactiveCount / customers.length;
    if (inactivePct > 0.5) {
      risks.push({
        id: "inactive-customers",
        category: "clientes",
        severity: inactivePct > 0.7 ? "high" : "medium",
        title: inactiveCount + " clientes inactivos en 30 dias",
        detail: (inactivePct * 100).toFixed(0) + "% de tu base no ha comprado en un mes",
        action: "Enviar promocion de retorno por WhatsApp a clientes inactivos",
        impactEstimate: "Recuperar 10% = ~" + Math.round(inactiveCount * 0.1) + " clientes mas",
      });
    }
  }

  // 11. VIP inactivos
  const spendMap: Record<string, number> = {};
  for (const o of validOrders) {
    const phone = o.customer?.phone;
    if (phone) spendMap[phone] = (spendMap[phone] ?? 0) + o.total;
  }
  for (const s of sales) {
    if (s.customerPhone) spendMap[s.customerPhone] = (spendMap[s.customerPhone] ?? 0) + s.total;
  }
  const spendValues = Object.values(spendMap).sort((a, b) => b - a);
  const vipThreshold = spendValues[Math.floor(customers.length * 0.1)] ?? Infinity;
  const vipInactive = customers.filter((c) => {
    if (!c.phone) return false;
    const spend = spendMap[c.phone] ?? 0;
    return spend >= vipThreshold && !recentBuyers.has(c.phone);
  }).length;
  if (vipInactive > 0) {
    risks.push({
      id: "vip-inactive",
      category: "clientes",
      severity: "high",
      title: vipInactive + " cliente" + (vipInactive > 1 ? "s" : "") + " VIP sin comprar en 30 dias",
      detail: "Tus mejores clientes no han regresado este mes",
      action: "Llamar personalmente o enviar oferta exclusiva a estos clientes",
      impactEstimate: "Un VIP perdido puede costar S/200+ al mes",
    });
  }

  // 12. NUEVO: Concentracion de ingresos
  if (spendValues.length >= 10) {
    const top10Pct = Math.ceil(spendValues.length * 0.1);
    const top10Revenue = spendValues.slice(0, top10Pct).reduce((a, b) => a + b, 0);
    const totalRevenue = spendValues.reduce((a, b) => a + b, 0);
    const concentrationPct = totalRevenue > 0 ? (top10Revenue / totalRevenue) * 100 : 0;
    if (concentrationPct > 70) {
      risks.push({
        id: "concentration",
        category: "clientes",
        severity: concentrationPct > 85 ? "high" : "medium",
        title: Math.round(concentrationPct) + "% de ingresos vienen de solo " + top10Pct + " clientes",
        detail: "Alta dependencia de pocos clientes - si pierdes 1, te afecta mucho",
        action: "Diversificar base: atraer nuevos clientes con promociones de primera compra",
        impactEstimate: "Perder 1 cliente top = perder ~S/" + Math.round(top10Revenue / top10Pct) + "/mes",
      });
    }
  }

  // 13. Tasa de cancelacion
  const cancelledMonth = orders.filter(
    (o) => o.status === "cancelado" && (o.createdAt?.slice(0, 10) ?? "") >= monthAgo
  ).length;
  const totalOrdersMonth = orders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= monthAgo).length;
  const cancelRate = totalOrdersMonth > 0 ? cancelledMonth / totalOrdersMonth : 0;
  if (cancelRate > 0.15) {
    risks.push({
      id: "cancel-rate",
      category: "operativo",
      severity: cancelRate > 0.3 ? "critical" : "high",
      title: "Tasa de cancelacion alta: " + (cancelRate * 100).toFixed(0) + "%",
      detail: cancelledMonth + " pedidos cancelados de " + totalOrdersMonth + " este mes",
      action: "Investigar causas: stock, tiempos de entrega, precios",
      impactEstimate: cancelledMonth + " ventas perdidas este mes",
    });
  }

  // 14. Backlog de pedidos
  const pendingOrders = orders.filter((o) => o.status === "pendiente");
  if (pendingOrders.length > 5) {
    risks.push({
      id: "pending-overflow",
      category: "operativo",
      severity: pendingOrders.length > 10 ? "high" : "medium",
      title: pendingOrders.length + " pedidos pendientes acumulados",
      detail: "Backlog elevado puede generar insatisfaccion en clientes",
      action: "Priorizar atencion de pedidos mas antiguos primero",
      impactEstimate: "S/" + Math.round(pendingOrders.reduce((s, o) => s + o.total, 0)) + " en pedidos esperando",
    });
  }

  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return risks.sort((a, b) => order[a.severity] - order[b.severity]);
}

// -- Risk Score Calculator --

function computeRiskScore(risks: Risk[]): number {
  if (risks.length === 0) return 0;
  const weights: Record<Severity, number> = { critical: 25, high: 15, medium: 8, low: 3 };
  const raw = risks.reduce((s, r) => s + weights[r.severity], 0);
  return Math.min(100, raw);
}

// -- Helpers --

const SEV_CONFIG: Record<Severity, { label: string; dot: string; badge: string; border: string }> = {
  critical: {
    label: "Critico",
    dot: "bg-red-500",
    badge: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-800/50",
  },
  high: {
    label: "Alto",
    dot: "bg-amber-500",
    badge: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-800/50",
  },
  medium: {
    label: "Medio",
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-800/50",
  },
  low: {
    label: "Bajo",
    dot: "bg-gray-400",
    badge: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
    border: "border-gray-200 dark:border-gray-700",
  },
};

const CAT_ICONS: Record<string, React.ElementType> = {
  inventario: Package,
  financiero: DollarSign,
  clientes: Users,
  operativo: Settings,
};

const CAT_LABELS: Record<string, string> = {
  inventario: "Inventario",
  financiero: "Financiero",
  clientes: "Clientes",
  operativo: "Operativo",
};

// -- Component --

interface Props {
  data: BusinessData | null;
  compact?: boolean;
}

export default function AIRiskRadar({ data, compact = false }: Props) {
  const allRisks = useMemo(() => detectRisks(data), [data]);

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const dismissed = getDismissed();
    const validIds = new Set<string>();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    for (const [id, ts] of Object.entries(dismissed)) {
      if (Date.now() - ts < sevenDays) validIds.add(id);
    }
    setDismissedIds(validIds);
  }, []);

  const risks = useMemo(
    () => allRisks.filter((r) => !dismissedIds.has(r.id)),
    [allRisks, dismissedIds]
  );

  const handleDismiss = (riskId: string) => {
    dismissRisk(riskId);
    setDismissedIds((prev) => new Set([...prev, riskId]));
  };

  const riskScore = useMemo(() => computeRiskScore(risks), [risks]);

  const countBySev = (s: Severity) => risks.filter((r) => r.severity === s).length;
  const critical = countBySev("critical");
  const high = countBySev("high");
  const medium = countBySev("medium");

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of risks) counts[r.category] = (counts[r.category] ?? 0) + 1;
    return counts;
  }, [risks]);

  const scoreColor = riskScore >= 70 ? "text-red-600 dark:text-red-400" :
    riskScore >= 40 ? "text-amber-600 dark:text-amber-400" :
    riskScore >= 15 ? "text-emerald-600 dark:text-emerald-400" :
    "text-emerald-600 dark:text-emerald-400";

  const scoreLabel = riskScore >= 70 ? "Critico" :
    riskScore >= 40 ? "Elevado" :
    riskScore >= 15 ? "Moderado" : "Bajo";

  const scoreBg = riskScore >= 70 ? "bg-red-500" :
    riskScore >= 40 ? "bg-amber-500" :
    riskScore >= 15 ? "bg-emerald-500" :
    "bg-emerald-500";

  const dismissedCount = allRisks.length - risks.length;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Radar de Riesgos
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          {critical > 0 && (
            <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400">
              {critical} critico{critical > 1 ? "s" : ""}
            </span>
          )}
          {high > 0 && (
            <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
              {high} alto{high > 1 ? "s" : ""}
            </span>
          )}
          {medium > 0 && (
            <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
              {medium} medio{medium > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {!compact && risks.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className={cn("w-4 h-4", scoreColor)} />
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Nivel de riesgo</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("text-lg font-bold", scoreColor)}>{riskScore}</span>
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold",
                riskScore >= 70 ? "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400" :
                riskScore >= 40 ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400" :
                riskScore >= 15 ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400" :
                "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
              )}>{scoreLabel}</span>
            </div>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full transition-all duration-700", scoreBg)} style={{ width: riskScore + "%" }} />
          </div>
          <div className="flex items-center gap-3 mt-2">
            {Object.entries(catCounts).map(([cat, count]) => {
              const CatIcon = CAT_ICONS[cat] ?? Settings;
              return (
                <div key={cat} className="flex items-center gap-1">
                  <CatIcon className="w-3 h-3 text-gray-400" />
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">
                    {CAT_LABELS[cat] ?? cat}: {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {risks.length === 0 ? (
        <div className="py-3">
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Sin riesgos activos. El negocio opera con normalidad.
          </p>
          {dismissedCount > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {dismissedCount} riesgo{dismissedCount > 1 ? "s" : ""} ignorado{dismissedCount > 1 ? "s" : ""} (reaparecen en 7 dias)
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(compact ? risks.slice(0, 4) : risks).map((risk) => {
            const sev = SEV_CONFIG[risk.severity];
            const CatIcon = CAT_ICONS[risk.category] ?? Settings;
            return (
              <div
                key={risk.id}
                className={cn("rounded-lg border p-3 flex items-start gap-3 group", sev.border)}
              >
                <div className="mt-1 shrink-0">
                  <div className={cn("w-2 h-2 rounded-full", sev.dot)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      {risk.title}
                    </span>
                    <span className={cn("px-1.5 py-0 rounded text-xs font-medium", sev.badge)}>
                      {sev.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{risk.detail}</p>
                  {risk.impactEstimate && (
                    <p className="text-xs text-red-500/80 dark:text-red-400/60 mt-0.5 italic">
                      {risk.impactEstimate}
                    </p>
                  )}
                  {!compact && (
                    <div className="flex items-center gap-1 mt-1">
                      <CatIcon className="w-3 h-3 text-gray-400" />
                      <p className="text-xs text-[#00B4A6] dark:text-[#2dd4bf] font-medium">{risk.action}</p>
                    </div>
                  )}
                </div>
                {!compact && (
                  <button
                    onClick={() => handleDismiss(risk.id)}
                    title="Ignorar por 7 dias"
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <X className="w-3 h-3 text-gray-400" />
                  </button>
                )}
              </div>
            );
          })}
          {compact && risks.length > 4 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
              +{risks.length - 4} riesgo{risks.length - 4 > 1 ? "s" : ""} mas en la pestana Diagnostico
            </p>
          )}
          {!compact && dismissedCount > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center pt-1">
              {dismissedCount} riesgo{dismissedCount > 1 ? "s" : ""} oculto{dismissedCount > 1 ? "s" : ""} (reaparecen automaticamente)
            </p>
          )}
        </div>
      )}
    </div>
  );
}