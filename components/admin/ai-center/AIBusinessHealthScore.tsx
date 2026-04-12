"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

// ── Types ──────────────────────────────────────────────────────────────────────

type SubScore = {
  label: string;
  key: string;
  score: number;
  max: number;
  explanation: string;
  trend: "up" | "down" | "stable";
  trendDelta: number;
  target: number;
};

type HealthHistory = {
  fecha: string;
  score: number;
  desglose: { label: string; key: string; score: number; max: number }[];
};

type InventoryDaysRow = {
  name: string;
  stock: number;
  salesPerDay: number;
  daysRemaining: number;
  suggestedPurchase: number;
};

type ProductRotation = {
  estrella: { name: string; weeklyQty: number }[];
  normal: { name: string; weeklyQty: number }[];
  lento: { name: string; weeklyQty: number }[];
  muerto: string[];
};

type FiadoRisk = {
  total: number;
  count: number;
  ratio: number;
  level: "ALTO" | "MEDIO" | "BAJO";
  recommendation: string;
  penalty: number;
};

type HealthPriority = {
  area: string;
  pct: number;
  action: string;
};

// ── Score color helper ─────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 85) return { ring: "stroke-emerald-500", text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500", label: "Excelente", labelBg: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300" };
  if (score >= 65) return { ring: "stroke-green-500", text: "text-green-600 dark:text-green-400", bg: "bg-green-500", label: "Saludable", labelBg: "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300" };
  if (score >= 45) return { ring: "stroke-amber-500", text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500", label: "Moderado", labelBg: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300" };
  return { ring: "stroke-red-500", text: "text-red-600 dark:text-red-400", bg: "bg-red-500", label: "Critico", labelBg: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300" };
}

// ── Score engine ───────────────────────────────────────────────────────────────

function computeHealthScore(
  data: BusinessData | null,
  fiadoPenalty: number = 0,
  prevEntry: HealthHistory | null = null
): { total: number; subs: SubScore[] } {
  if (!data) return { total: 0, subs: [] };

  const { products, orders, sales, customers, expenses } = data;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const prevMonthAgo = new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);

  const validOrders = orders.filter((o) => o.status !== "cancelado");

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

  // Helper: get trend vs previous entry
  function getTrend(key: string, currentScore: number): { trend: "up" | "down" | "stable"; delta: number } {
    if (!prevEntry) return { trend: "stable", delta: 0 };
    const prev = prevEntry.desglose.find((d) => d.key === key);
    if (!prev) return { trend: "stable", delta: 0 };
    const prevPct = (prev.score / prev.max) * 100;
    const currPct = (currentScore / (key === "ventas" ? 25 : key === "inventario" ? 20 : key === "finanzas" ? 20 : key === "clientes" ? 15 : key === "operaciones" ? 10 : 10)) * 100;
    const delta = Math.round(currPct - prevPct);
    if (delta > 2) return { trend: "up", delta };
    if (delta < -2) return { trend: "down", delta };
    return { trend: "stable", delta };
  }

  // 1. Ventas (25)
  let salesScore = 25;
  const salesDelta = revPrevMonth > 0 ? (revMonth - revPrevMonth) / revPrevMonth : 0;
  if (salesDelta < -0.3) salesScore -= 15;
  else if (salesDelta < -0.1) salesScore -= 8;
  else if (salesDelta >= 0.1) salesScore = Math.min(25, salesScore + 3);
  if (revMonth === 0) salesScore = 0;
  salesScore = Math.max(0, Math.min(25, salesScore));
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
    ? `${outOfStock.length} agotado${outOfStock.length > 1 ? "s" : ""}, ${lowStock.length} stock bajo, ${overstock.length} sobrestock`
    : lowStock.length > 0
    ? `${lowStock.length} producto${lowStock.length > 1 ? "s" : ""} con stock bajo`
    : overstock.length > 0
    ? `${overstock.length} producto${overstock.length > 1 ? "s" : ""} con sobrestock`
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
  const recentBuyers = new Set<string>();
  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
    if (s.customerPhone) recentBuyers.add(s.customerPhone);
  }
  for (const o of validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
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
    ? `${(retentionRate * 100).toFixed(0)}% retencion 30d, ${newCustomers} nuevos este mes`
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

  const t1 = getTrend("ventas", salesScore);
  const t2 = getTrend("inventario", invScore);
  const t3 = getTrend("finanzas", finScore);
  const t4 = getTrend("clientes", custScore);
  const t5 = getTrend("operaciones", opsScore);
  const t6 = getTrend("crecimiento", growthScore);

  const subs: SubScore[] = [
    { label: "Ventas", key: "ventas", score: salesScore, max: 25, explanation: salesLabel, trend: t1.trend, trendDelta: t1.delta, target: 20 },
    { label: "Inventario", key: "inventario", score: invScore, max: 20, explanation: invLabel, trend: t2.trend, trendDelta: t2.delta, target: 16 },
    { label: "Finanzas", key: "finanzas", score: finScore, max: 20, explanation: finLabel, trend: t3.trend, trendDelta: t3.delta, target: 15 },
    { label: "Clientes", key: "clientes", score: custScore, max: 15, explanation: custLabel, trend: t4.trend, trendDelta: t4.delta, target: 12 },
    { label: "Operaciones", key: "operaciones", score: opsScore, max: 10, explanation: opsLabel, trend: t5.trend, trendDelta: t5.delta, target: 8 },
    { label: "Crecimiento", key: "crecimiento", score: growthScore, max: 10, explanation: growthLabel, trend: t6.trend, trendDelta: t6.delta, target: 7 },
  ];

  let total = subs.reduce((s, sub) => s + sub.score, 0);
  total = Math.max(0, total - fiadoPenalty);
  return { total, subs };
}

// ── Priorities from weak areas ─────────────────────────────────────────────────

function computePriorities(subs: SubScore[]): HealthPriority[] {
  const ACTION_MAP: Record<string, string> = {
    ventas: "Lanza una promo o revisa precios para reactivar ventas",
    inventario: "Repone productos agotados y liquida sobrestock",
    finanzas: "Revisa gastos del mes y cobra pagos vencidos",
    clientes: "Contacta clientes inactivos con un mensaje o descuento",
    operaciones: "Investiga por que se cancelan pedidos y corrige",
    crecimiento: "Prueba un nuevo canal de venta o producto estrella",
  };

  return subs
    .map((s) => ({ area: s.label, key: s.key, pct: Math.round((s.score / s.max) * 100) }))
    .filter((s) => s.pct < 75)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3)
    .map((s) => ({
      area: s.area,
      pct: s.pct,
      action: ACTION_MAP[s.key] ?? "Revisa esta area para mejorar",
    }));
}

// ── Inventory days calculation ─────────────────────────────────────────────────

function computeInventoryDays(data: BusinessData): InventoryDaysRow[] {
  const { products, orders, sales } = data;
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);

  const qtySold: Record<string, number> = {};
  const validOrders = orders.filter((o) => o.status !== "cancelado");
  for (const o of validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
    for (const item of o.items) {
      const key = item.id ?? item.name;
      qtySold[key] = (qtySold[key] ?? 0) + item.quantity;
    }
  }
  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
    for (const item of s.items) {
      const key = String(item.productId) ?? item.name;
      qtySold[key] = (qtySold[key] ?? 0) + item.quantity;
    }
  }

  const rows: InventoryDaysRow[] = [];
  for (const p of products.filter((pr) => pr.active !== false && (pr.stock ?? 0) > 0)) {
    const sold = qtySold[p.id] ?? qtySold[p.name] ?? 0;
    const salesPerDay = sold / 30;
    const daysRemaining = salesPerDay > 0 ? (p.stock ?? 0) / salesPerDay : 999;
    // Suggest purchase: enough for 14 days minus current stock
    const suggestedPurchase = salesPerDay > 0 ? Math.max(0, Math.ceil(salesPerDay * 14) - (p.stock ?? 0)) : 0;
    rows.push({
      name: p.name,
      stock: p.stock ?? 0,
      salesPerDay: Math.round(salesPerDay * 10) / 10,
      daysRemaining: Math.round(daysRemaining),
      suggestedPurchase,
    });
  }

  rows.sort((a, b) => a.daysRemaining - b.daysRemaining);
  return rows.slice(0, 10);
}

// ── Product rotation ───────────────────────────────────────────────────────────

function computeProductRotation(data: BusinessData): ProductRotation {
  const { products, orders, sales } = data;
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);

  const validOrders = orders.filter((o) => o.status !== "cancelado");

  const monthlySales: Record<string, number> = {};
  for (const o of validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
    for (const item of o.items) {
      const key = item.id ?? item.name;
      monthlySales[key] = (monthlySales[key] ?? 0) + item.quantity;
    }
  }
  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
    for (const item of s.items) {
      const key = String(item.productId) ?? item.name;
      monthlySales[key] = (monthlySales[key] ?? 0) + item.quantity;
    }
  }

  const result: ProductRotation = { estrella: [], normal: [], lento: [], muerto: [] };

  for (const p of products.filter((pr) => pr.active !== false)) {
    const sold = monthlySales[p.id] ?? monthlySales[p.name] ?? 0;
    const salesPerWeek = sold / 4.29;

    if (salesPerWeek > 5) result.estrella.push({ name: p.name, weeklyQty: Math.round(salesPerWeek * 10) / 10 });
    else if (salesPerWeek >= 1) result.normal.push({ name: p.name, weeklyQty: Math.round(salesPerWeek * 10) / 10 });
    else if (sold > 0) result.lento.push({ name: p.name, weeklyQty: Math.round(salesPerWeek * 10) / 10 });
    else result.muerto.push(p.name);
  }

  result.estrella.sort((a, b) => b.weeklyQty - a.weeklyQty);
  result.lento.sort((a, b) => a.weeklyQty - b.weeklyQty);

  return result;
}

// ── localStorage history helpers ───────────────────────────────────────────────

const HISTORY_KEY = "health-scores-history";

function loadHistory(): HealthHistory[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HealthHistory[];
  } catch {
    return [];
  }
}

function saveToHistory(score: number, subs: SubScore[]) {
  const today = new Date().toISOString().slice(0, 10);
  const history = loadHistory();

  const existingIndex = history.findIndex((h) => h.fecha === today);
  const entry: HealthHistory = {
    fecha: today,
    score,
    desglose: subs.map((s) => ({ label: s.label, key: s.key, score: s.score, max: s.max })),
  };

  if (existingIndex >= 0) {
    history[existingIndex] = entry;
  } else {
    history.push(entry);
  }

  const trimmed = history.slice(-56);
  const weekMap = new Map<string, HealthHistory>();
  for (const h of trimmed) {
    const d = new Date(h.fecha);
    const weekNum = `${d.getFullYear()}-W${String(Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay()) / 7)).padStart(2, "0")}-${d.getMonth()}`;
    weekMap.set(weekNum, h);
  }
  const weekly = Array.from(weekMap.values()).slice(-8);

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(weekly));
  } catch { /* storage full */ }

  return weekly;
}

// ── Trend arrow helper ─────────────────────────────────────────────────────────

function TrendArrow({ trend, delta }: { trend: "up" | "down" | "stable"; delta: number }) {
  if (trend === "stable") return <span className="text-[10px] text-gray-400">—</span>;
  if (trend === "up") return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
      ▲ +{Math.abs(delta)}%
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
      ▼ -{Math.abs(delta)}%
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  data: BusinessData | null;
}

export default function AIBusinessHealthScore({ data }: Props) {
  const [fiadoRisk, setFiadoRisk] = useState<FiadoRisk | null>(null);
  const [fiadoLoading, setFiadoLoading] = useState(false);
  const [history, setHistory] = useState<HealthHistory[]>([]);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [showAllRotation, setShowAllRotation] = useState(false);

  // Fetch fiados on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchFiados() {
      setFiadoLoading(true);
      try {
        const res = await fetch("/api/fiados?status=ACTIVO");
        if (!res.ok) throw new Error("fetch failed");
        const fiados = await res.json() as { total: number; pagado?: number }[];
        const totalFiado = fiados.reduce((s, f) => s + (f.total - (f.pagado ?? 0)), 0);
        if (!cancelled) {
          setFiadoRisk({
            total: totalFiado,
            count: fiados.length,
            ratio: 0,
            level: "BAJO",
            recommendation: "",
            penalty: 0,
          });
        }
      } catch {
        if (!cancelled) setFiadoRisk(null);
      } finally {
        if (!cancelled) setFiadoLoading(false);
      }
    }
    fetchFiados();
    return () => { cancelled = true; };
  }, []);

  const computedFiadoRisk = useMemo((): FiadoRisk | null => {
    if (!fiadoRisk || !data) return fiadoRisk;
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    const validOrders = data.orders.filter((o) => o.status !== "cancelado");
    const revMonth = validOrders
      .filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= monthAgo)
      .reduce((s, o) => s + o.total, 0) +
      data.sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo)
        .reduce((s, sl) => s + sl.total, 0);

    const ratio = revMonth > 0 ? (fiadoRisk.total / revMonth) * 100 : 0;
    let level: FiadoRisk["level"] = "BAJO";
    let penalty = 0;
    let recommendation = "Nivel de fiado saludable. Manten el control.";

    if (ratio > 20) {
      level = "ALTO";
      penalty = 5;
      recommendation = "El fiado supera el 20% de tus ventas. Reduce creditos y cobra los pendientes urgente.";
    } else if (ratio > 10) {
      level = "MEDIO";
      penalty = 2;
      recommendation = "El fiado esta entre 10-20%. Monitorea de cerca y establece limites por cliente.";
    }

    return { ...fiadoRisk, ratio, level, penalty, recommendation };
  }, [fiadoRisk, data]);

  const fiadoPenalty = computedFiadoRisk?.penalty ?? 0;

  // Get previous entry for trend comparison
  const prevEntry = useMemo(() => {
    if (history.length < 2) return null;
    return history[history.length - 2];
  }, [history]);

  const { total, subs } = useMemo(() => computeHealthScore(data, fiadoPenalty, prevEntry), [data, fiadoPenalty, prevEntry]);
  const colors = scoreColor(total);

  // Compute total trend delta
  const totalTrendDelta = useMemo(() => {
    if (!prevEntry) return 0;
    return total - prevEntry.score;
  }, [total, prevEntry]);

  const priorities = useMemo(() => computePriorities(subs), [subs]);

  // Save to history when score changes
  useEffect(() => {
    if (total > 0) {
      const updated = saveToHistory(total, subs);
      setHistory(updated);
    }
  }, [total, subs]);

  // Load history on mount
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const inventoryDays = useMemo(() => (data ? computeInventoryDays(data) : []), [data]);
  const rotation = useMemo(() => (data ? computeProductRotation(data) : null), [data]);

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (total / 100) * circumference;

  // WhatsApp share
  const shareWhatsApp = useCallback(() => {
    const lines = [
      `*Salud del Negocio: ${total}/100 (${colors.label})*`,
      "",
      ...subs.map((s) => {
        const pct = Math.round((s.score / s.max) * 100);
        const trendLabel = s.trend === "up" ? "Sube" : s.trend === "down" ? "Baja" : "Estable";
        return `${trendLabel} · ${s.label}: ${s.score}/${s.max} (${pct}%)`;
      }),
    ];
    if (priorities.length > 0) {
      lines.push("", "*Prioridades:*");
      priorities.forEach((p) => lines.push(`${p.area}: ${p.action}`));
    }
    if (computedFiadoRisk && computedFiadoRisk.level !== "BAJO") {
      lines.push("", `Fiado: S/${computedFiadoRisk.total.toFixed(0)} (${computedFiadoRisk.ratio.toFixed(1)}% de ventas)`);
    }
    lines.push("", `Fecha: ${new Date().toLocaleDateString("es-PE")}`);

    const url = `https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [total, colors.label, subs, priorities, computedFiadoRisk]);

  return (
    <div className="space-y-5">
      {/* ── Main Health Score Card ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Salud del Negocio
          </h2>
          <button
            onClick={shareWhatsApp}
            className="text-xs px-2.5 py-1 rounded-lg bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-950/50 transition-colors"
            title="Compartir por WhatsApp"
          >
            Compartir
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Circle score */}
          <div className="relative flex items-center justify-center shrink-0">
            <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
              <circle cx="70" cy="70" r={radius} fill="none" className="stroke-gray-100 dark:stroke-gray-800" strokeWidth="12" />
              <circle
                cx="70" cy="70" r={radius} fill="none"
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
              {totalTrendDelta !== 0 && (
                <span className={cn(
                  "mt-0.5 text-[10px] font-medium",
                  totalTrendDelta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                )}>
                  {totalTrendDelta > 0 ? "▲" : "▼"} {totalTrendDelta > 0 ? "+" : ""}{totalTrendDelta} vs anterior
                </span>
              )}
            </div>
          </div>

          {/* Sub-scores */}
          <div className="flex-1 w-full flex flex-col gap-2.5">
            {subs.map((sub) => {
              const pct = (sub.score / sub.max) * 100;
              const c = scoreColor(pct);
              const targetPct = (sub.target / sub.max) * 100;
              const atTarget = sub.score >= sub.target;
              return (
                <div key={sub.key}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{sub.label}</span>
                      <TrendArrow trend={sub.trend} delta={sub.trendDelta} />
                    </div>
                    <div className="flex items-center gap-2">
                      {!atTarget && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          meta: {sub.target}
                        </span>
                      )}
                      <span className={cn("text-xs font-semibold", c.text)}>
                        {sub.score}/{sub.max}
                      </span>
                    </div>
                  </div>
                  <div className="relative h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-700", c.bg)}
                      style={{ width: `${pct}%` }}
                    />
                    {/* Target marker */}
                    <div
                      className="absolute top-0 h-full w-0.5 bg-gray-400 dark:bg-gray-500"
                      style={{ left: `${targetPct}%` }}
                      title={`Meta: ${sub.target}/${sub.max}`}
                    />
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub.explanation}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Quick Priority Chips ───────────────────────────────────────────── */}
      {priorities.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
            Prioridades Inmediatas
          </h3>
          <div className="space-y-2.5">
            {priorities.map((p, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{p.area}</span>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                      p.pct < 40 ? "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                        : "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"
                    )}>
                      {p.pct}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{p.action}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tendencia historica ────────────────────────────────────────────── */}
      {history.length > 1 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Tendencia de Salud
            </h3>
            {totalTrendDelta !== 0 && (
              <span className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                totalTrendDelta > 0
                  ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                  : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
              )}>
                {totalTrendDelta > 0 ? "+" : ""}{totalTrendDelta} pts
              </span>
            )}
          </div>

          {/* Reference lines */}
          <div className="relative">
            <div className="absolute left-0 right-0 bottom-[70%] border-t border-dashed border-emerald-200 dark:border-emerald-800/40 z-0">
              <span className="absolute -top-2.5 right-0 text-[8px] text-emerald-500 dark:text-emerald-600">70</span>
            </div>
            <div className="absolute left-0 right-0 bottom-[50%] border-t border-dashed border-amber-200 dark:border-amber-800/40 z-0">
              <span className="absolute -top-2.5 right-0 text-[8px] text-amber-500 dark:text-amber-600">50</span>
            </div>

            <div className="flex items-end gap-1.5 h-28 relative z-10">
              {history.map((h, i) => {
                const heightPct = Math.max(5, h.score);
                const barColor = h.score >= 85
                  ? "bg-emerald-500 dark:bg-emerald-400"
                  : h.score >= 65
                  ? "bg-green-500 dark:bg-green-400"
                  : h.score >= 45
                  ? "bg-amber-500 dark:bg-amber-400"
                  : "bg-red-500 dark:bg-red-400";
                const weekLabel = new Date(h.fecha).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
                return (
                  <div
                    key={h.fecha}
                    className="flex-1 flex flex-col items-center gap-1 relative"
                    onMouseEnter={() => setHoveredBar(i)}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    {hoveredBar === i && (
                      <div className="absolute -top-10 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap z-20 pointer-events-none">
                        <div className="font-medium">{weekLabel}: {h.score}/100</div>
                        {h.desglose && (
                          <div className="text-[10px] opacity-80 mt-0.5">
                            {h.desglose.slice(0, 3).map((d) => `${d.label}: ${d.score}`).join(" · ")}
                          </div>
                        )}
                      </div>
                    )}
                    <div
                      className={cn("w-full rounded-t transition-all duration-300 cursor-pointer hover:opacity-80", barColor)}
                      style={{ height: `${heightPct}%` }}
                    />
                    <span className="text-[9px] text-gray-400 dark:text-gray-500 truncate w-full text-center">
                      {i === history.length - 1 ? "Hoy" : `S${history.length - i}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Riesgo de Fiado ───────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
          Riesgo de Fiado
        </h3>
        {fiadoLoading ? (
          <div className="flex items-center gap-2 py-3">
            <div className="w-4 h-4 border-2 border-[#00B4A6] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-gray-400">Cargando datos de fiado...</span>
          </div>
        ) : computedFiadoRisk ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center text-lg shrink-0",
                computedFiadoRisk.level === "ALTO"
                  ? "bg-red-100 dark:bg-red-950/30"
                  : computedFiadoRisk.level === "MEDIO"
                  ? "bg-amber-100 dark:bg-amber-950/30"
                  : "bg-emerald-100 dark:bg-emerald-950/30"
              )}>
                <span className="text-sm font-bold">S/</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded-full",
                    computedFiadoRisk.level === "ALTO"
                      ? "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                      : computedFiadoRisk.level === "MEDIO"
                      ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
                      : "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                  )}>
                    Riesgo {computedFiadoRisk.level}
                  </span>
                  <span className="text-xs text-gray-400">({computedFiadoRisk.ratio.toFixed(1)}% de ventas)</span>
                </div>
                <div className="flex gap-4 text-xs text-gray-600 dark:text-gray-400">
                  <span>Total: S/{computedFiadoRisk.total.toLocaleString("es-PE", { minimumFractionDigits: 0 })}</span>
                  <span>{computedFiadoRisk.count} fiados activos</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
              {computedFiadoRisk.recommendation}
            </p>
            {computedFiadoRisk.penalty > 0 && (
              <p className="text-xs text-red-500 dark:text-red-400">
                Penalizacion al score: -{computedFiadoRisk.penalty} puntos
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500 py-2">Sin datos de fiado</p>
        )}
      </div>

      {/* ── Dias de Inventario ─────────────────────────────────────────────── */}
      {inventoryDays.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <button
            onClick={() => setExpandedSection(expandedSection === "inventory" ? null : "inventory")}
            className="w-full flex items-center justify-between mb-3"
          >
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Dias de Inventario
            </h3>
            <span className="text-xs text-gray-400">
              {expandedSection === "inventory" ? "▲" : "▼"} {inventoryDays.filter((r) => r.daysRemaining < 7).length} urgentes
            </span>
          </button>

          {/* Quick summary always visible */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {inventoryDays.filter((r) => r.daysRemaining < 3).length > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 font-medium">
                Criticos: {inventoryDays.filter((r) => r.daysRemaining < 3).length} (&lt;3d)
              </span>
            )}
            {inventoryDays.filter((r) => r.daysRemaining >= 3 && r.daysRemaining < 7).length > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 font-medium">
                Alertas: {inventoryDays.filter((r) => r.daysRemaining >= 3 && r.daysRemaining < 7).length} (&lt;7d)
              </span>
            )}
          </div>

          {expandedSection === "inventory" && (
            <>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                Top 10 productos mas urgentes. &quot;Comprar&quot; = unidades para cubrir 14 dias.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      <th className="text-left py-2 text-gray-500 dark:text-gray-400 font-medium">Producto</th>
                      <th className="text-right py-2 text-gray-500 dark:text-gray-400 font-medium">Stock</th>
                      <th className="text-right py-2 text-gray-500 dark:text-gray-400 font-medium">Venta/dia</th>
                      <th className="text-right py-2 text-gray-500 dark:text-gray-400 font-medium">Dias rest.</th>
                      <th className="text-right py-2 text-gray-500 dark:text-gray-400 font-medium">Comprar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryDays.map((row, i) => {
                      const urgencyColor = row.daysRemaining < 3
                        ? "text-red-600 dark:text-red-400"
                        : row.daysRemaining < 7
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400";
                      return (
                        <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
                          <td className="py-1.5 text-gray-700 dark:text-gray-300 truncate max-w-[130px]">{row.name}</td>
                          <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{row.stock}</td>
                          <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{row.salesPerDay}</td>
                          <td className={cn("py-1.5 text-right font-semibold", urgencyColor)}>
                            {row.daysRemaining >= 999 ? "∞" : `${row.daysRemaining}d`}
                          </td>
                          <td className="py-1.5 text-right">
                            {row.suggestedPurchase > 0 ? (
                              <span className="text-[#00B4A6] dark:text-emerald-400 font-medium">+{row.suggestedPurchase}</span>
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {expandedSection !== "inventory" && (
            <div className="space-y-1">
              {inventoryDays.slice(0, 3).map((row, i) => {
                const urgencyColor = row.daysRemaining < 3
                    ? "text-red-600 dark:text-red-400"
                    : row.daysRemaining < 7
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-600 dark:text-emerald-400";
                return (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-400 truncate max-w-[180px]">{row.name}</span>
                    <span className={cn("font-semibold", urgencyColor)}>
                      {row.daysRemaining >= 999 ? "∞" : `${row.daysRemaining}d`}
                      {row.suggestedPurchase > 0 && (
                        <span className="text-gray-400 font-normal ml-1.5">(comprar +{row.suggestedPurchase})</span>
                      )}
                    </span>
                  </div>
                );
              })}
              {inventoryDays.length > 3 && (
                <p className="text-[10px] text-gray-400 mt-1">+{inventoryDays.length - 3} productos mas</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Rotacion de Productos ──────────────────────────────────────────── */}
      {rotation && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <button
            onClick={() => setExpandedSection(expandedSection === "rotation" ? null : "rotation")}
            className="w-full flex items-center justify-between mb-3"
          >
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Rotacion de Productos
            </h3>
            <span className="text-xs text-gray-400">
              {expandedSection === "rotation" ? "▲" : "▼"}
            </span>
          </button>

          {/* Summary badges — always visible */}
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300">
              Estrella: {rotation.estrella.length}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
              {rotation.normal.length} normales
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300">
              Lentos: {rotation.lento.length}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300">
              Sin movimiento: {rotation.muerto.length}
            </span>
          </div>

          {expandedSection === "rotation" && (
            <div className="space-y-3">
              {/* Dead products alert */}
              {rotation.muerto.length > 0 && (
                <div className="p-3 rounded-lg bg-red-50/50 dark:bg-red-950/10 border border-red-100 dark:border-red-800/30">
                  <p className="text-xs text-red-700 dark:text-red-400 font-medium mb-1">
                    {rotation.muerto.length} producto{rotation.muerto.length > 1 ? "s" : ""} sin movimiento en 30 dias:
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-300">
                    {rotation.muerto.slice(0, showAllRotation ? 20 : 5).join(", ")}
                    {!showAllRotation && rotation.muerto.length > 5 && ` y ${rotation.muerto.length - 5} mas`}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                    Considera aplicar descuento o eliminar estos productos del catalogo.
                  </p>
                </div>
              )}

              {/* Slow products with quantities */}
              {rotation.lento.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-800/30">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-1">
                    Productos lentos (venden poco por semana):
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {rotation.lento.slice(0, showAllRotation ? 15 : 5).map((p) => (
                      <span key={p.name} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                        {p.name} ({p.weeklyQty}/sem)
                      </span>
                    ))}
                    {!showAllRotation && rotation.lento.length > 5 && (
                      <span className="text-[10px] text-gray-400">+{rotation.lento.length - 5} mas</span>
                    )}
                  </div>
                </div>
              )}

              {/* Stars highlight with quantities */}
              {rotation.estrella.length > 0 && (
                <div className="p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-800/30">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium mb-1">
                    Productos estrella (alta rotacion):
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {rotation.estrella.slice(0, showAllRotation ? 15 : 8).map((p) => (
                      <span key={p.name} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                        {p.name} ({p.weeklyQty}/sem)
                      </span>
                    ))}
                    {!showAllRotation && rotation.estrella.length > 8 && (
                      <span className="text-[10px] text-gray-400">+{rotation.estrella.length - 8} mas</span>
                    )}
                  </div>
                </div>
              )}

              {(rotation.muerto.length > 5 || rotation.lento.length > 5 || rotation.estrella.length > 8) && (
                <button
                  onClick={() => setShowAllRotation(!showAllRotation)}
                  className="text-xs text-[#00B4A6] dark:text-emerald-400 hover:underline"
                >
                  {showAllRotation ? "Ver menos" : "Ver todos"}
                </button>
              )}
            </div>
          )}

          {/* Collapsed view — just the alerts */}
          {expandedSection !== "rotation" && (
            <div>
              {rotation.muerto.length > 0 && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {rotation.muerto.length} producto{rotation.muerto.length > 1 ? "s" : ""} sin movimiento — revisa pronto
                </p>
              )}
              {rotation.muerto.length === 0 && rotation.lento.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {rotation.lento.length} con rotacion lenta — considera promociones
                </p>
              )}
              {rotation.muerto.length === 0 && rotation.lento.length === 0 && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  Todos los productos tienen buena rotacion
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}