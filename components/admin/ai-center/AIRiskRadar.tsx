"use client";

import { useMemo } from "react";
import { Package, DollarSign, Users, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

// ── Types ──────────────────────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium" | "low";

type Risk = {
  id: string;
  category: "inventario" | "financiero" | "clientes" | "operativo";
  severity: Severity;
  title: string;
  detail: string;
  action: string;
};

// ── Risk engine ────────────────────────────────────────────────────────────────

function detectRisks(data: BusinessData | null): Risk[] {
  if (!data) return [];

  const { products, orders, sales, customers } = data;
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);

  const risks: Risk[] = [];
  const validOrders = orders.filter((o) => o.status !== "cancelado");
  const activeProducts = products.filter((p) => p.active !== false);

  // ── INVENTARIO ────────────────────────────────────────────────────────

  const outOfStock = activeProducts.filter((p) => (p.stock ?? 0) === 0);
  if (outOfStock.length > 0) {
    risks.push({
      id: "oos",
      category: "inventario",
      severity: outOfStock.length >= 5 ? "critical" : "high",
      title: `${outOfStock.length} producto${outOfStock.length > 1 ? "s" : ""} sin stock`,
      detail: outOfStock.slice(0, 4).map((p) => p.name).join(", ") + (outOfStock.length > 4 ? "..." : ""),
      action: "Ir a Inventario y colocar orden de compra urgente",
    });
  }

  const lowStock = activeProducts.filter(
    (p) => p.stock != null && p.stockMin != null && p.stock > 0 && p.stock <= p.stockMin
  );
  if (lowStock.length > 0) {
    risks.push({
      id: "low-stock",
      category: "inventario",
      severity: lowStock.length >= 5 ? "high" : "medium",
      title: `${lowStock.length} producto${lowStock.length > 1 ? "s" : ""} con stock critico`,
      detail: lowStock.slice(0, 3).map((p) => `${p.name} (${p.stock}/${p.stockMin})`).join(", "),
      action: "Programar pedido a proveedores antes del fin de semana",
    });
  }

  // ── FINANCIERO ────────────────────────────────────────────────────────

  const overduePayables = data.alerts?.overduePayables ?? 0;
  if (overduePayables > 0) {
    risks.push({
      id: "overdue-pay",
      category: "financiero",
      severity: overduePayables >= 3 ? "critical" : "high",
      title: `${overduePayables} factura${overduePayables > 1 ? "s" : ""} vencida${overduePayables > 1 ? "s" : ""}`,
      detail: `Pagos a proveedores fuera de plazo — riesgo de corte de credito`,
      action: "Revisar Cuentas por Pagar y pagar hoy las mas urgentes",
    });
  }

  // Revenue trend risk
  const revWeek = validOrders
    .filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= weekAgo)
    .reduce((s, o) => s + o.total, 0) +
    sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo)
      .reduce((s, sl) => s + sl.total, 0);

  const twoWeekAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
  const revPrevWeek = validOrders
    .filter((o) => {
      const d = o.createdAt?.slice(0, 10) ?? "";
      return d >= twoWeekAgo && d < weekAgo;
    })
    .reduce((s, o) => s + o.total, 0);

  if (revPrevWeek > 0 && revWeek < revPrevWeek * 0.75) {
    risks.push({
      id: "revenue-drop",
      category: "financiero",
      severity: "high",
      title: "Caida de ventas mayor al 25% vs semana anterior",
      detail: `Esta semana: S/${revWeek.toFixed(0)} vs S/${revPrevWeek.toFixed(0)} la semana pasada`,
      action: "Revisar causas: promociones activas, stock, horarios de atencion",
    });
  }

  // ── CLIENTES ──────────────────────────────────────────────────────────

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
        title: `${inactiveCount} clientes inactivos en 30 dias`,
        detail: `${(inactivePct * 100).toFixed(0)}% de tu base no ha comprado en un mes`,
        action: "Enviar promocion de retorno a clientes inactivos",
      });
    }
  }

  // VIP customers not buying
  const spendMap: Record<string, number> = {};
  for (const o of validOrders) {
    const phone = o.customer?.phone;
    if (phone) spendMap[phone] = (spendMap[phone] ?? 0) + o.total;
  }
  for (const s of sales) {
    if (s.customerPhone) spendMap[s.customerPhone] = (spendMap[s.customerPhone] ?? 0) + s.total;
  }
  const vipThreshold = Object.values(spendMap).sort((a, b) => b - a)[Math.floor(customers.length * 0.1)] ?? Infinity;
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
      title: `${vipInactive} cliente${vipInactive > 1 ? "s" : ""} VIP sin comprar en 30 dias`,
      detail: "Tus mejores clientes no han regresado este mes",
      action: "Llamar personalmente o enviar oferta exclusiva a estos clientes",
    });
  }

  // ── OPERATIVO ─────────────────────────────────────────────────────────

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
      title: `Tasa de cancelacion alta: ${(cancelRate * 100).toFixed(0)}%`,
      detail: `${cancelledMonth} pedidos cancelados de ${totalOrdersMonth} este mes`,
      action: "Investigar causas: stock, tiempos de entrega, precios",
    });
  }

  const pendingOrders = orders.filter((o) => o.status === "pendiente");
  if (pendingOrders.length > 5) {
    risks.push({
      id: "pending-overflow",
      category: "operativo",
      severity: pendingOrders.length > 10 ? "high" : "medium",
      title: `${pendingOrders.length} pedidos pendientes acumulados`,
      detail: "Backlog elevado puede generar insatisfaccion en clientes",
      action: "Priorizar atencion de pedidos mas antiguos primero",
    });
  }

  // Sort by severity
  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return risks.sort((a, b) => order[a.severity] - order[b.severity]);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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
    dot: "bg-blue-500",
    badge: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-800/50",
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

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  data: BusinessData | null;
  compact?: boolean;
}

export default function AIRiskRadar({ data, compact = false }: Props) {
  const risks = useMemo(() => detectRisks(data), [data]);

  const countBySev = (s: Severity) => risks.filter((r) => r.severity === s).length;
  const critical = countBySev("critical");
  const high = countBySev("high");
  const medium = countBySev("medium");

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Radar de Riesgos
        </h2>
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
            <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400">
              {medium} medio{medium > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {risks.length === 0 ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400 py-3">
          Sin riesgos detectados. El negocio opera con normalidad.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {(compact ? risks.slice(0, 4) : risks).map((risk) => {
            const sev = SEV_CONFIG[risk.severity];
            const CatIcon = CAT_ICONS[risk.category] ?? Settings;
            return (
              <div
                key={risk.id}
                className={cn("rounded-lg border p-3 flex items-start gap-3", sev.border)}
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
                  {!compact && (
                    <div className="flex items-center gap-1 mt-1">
                      <CatIcon className="w-3 h-3 text-gray-400" />
                      <p className="text-xs text-[#2d6a4f] dark:text-[#52b788] font-medium">{risk.action}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {compact && risks.length > 4 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
              +{risks.length - 4} riesgo{risks.length - 4 > 1 ? "s" : ""} mas en la pestaña Diagnostico
            </p>
          )}
        </div>
      )}
    </div>
  );
}
