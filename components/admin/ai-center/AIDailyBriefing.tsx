"use client";

import { useMemo } from "react";
import { Sun, Sunset, Moon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

// ── Helpers ────────────────────────────────────────────────────────────────────

function getGreeting(): { text: string; icon: React.ElementType } {
  const h = new Date().getHours();
  if (h < 12) return { text: "Buenos dias", icon: Sun };
  if (h < 19) return { text: "Buenas tardes", icon: Sunset };
  return { text: "Buenas noches", icon: Moon };
}

function getDayName(): string {
  const days = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  return days[new Date().getDay()];
}

function fmt(n: number) {
  return `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(a: number, b: number): string {
  if (b === 0) return "0";
  return ((a / b - 1) * 100).toFixed(1);
}

// ── Analysis engine ────────────────────────────────────────────────────────────

function analyzeBusiness(data: BusinessData | null) {
  if (!data) return null;

  const { products, orders, sales, customers } = data;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const prev14 = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);

  // Revenue helpers
  const validOrders = orders.filter((o) => o.status !== "cancelado");

  const revenueFor = (from: string, to: string) => {
    const ord = validOrders
      .filter((o) => {
        const d = o.createdAt?.slice(0, 10) ?? "";
        return d >= from && d <= to;
      })
      .reduce((s, o) => s + o.total, 0);
    const sal = sales
      .filter((s) => {
        const d = s.createdAt?.slice(0, 10) ?? "";
        return d >= from && d <= to;
      })
      .reduce((s, sl) => s + sl.total, 0);
    return ord + sal;
  };

  const txnCount = (from: string, to: string) => {
    const ord = validOrders.filter((o) => {
      const d = o.createdAt?.slice(0, 10) ?? "";
      return d >= from && d <= to;
    }).length;
    const sal = sales.filter((s) => {
      const d = s.createdAt?.slice(0, 10) ?? "";
      return d >= from && d <= to;
    }).length;
    return ord + sal;
  };

  const todayRevenue = revenueFor(today, today);
  const yestRevenue = revenueFor(yesterday, yesterday);
  const weekRevenue = revenueFor(weekAgo, today);
  const prevWeekRevenue = revenueFor(prev14, weekAgo);
  const todayTxns = txnCount(today, today);
  const yestTxns = txnCount(yesterday, yesterday);

  // Day-of-week average from historical sales
  const dayOfWeek = now.getDay();
  const dayRevenues: number[] = [];
  for (let w = 1; w <= 4; w++) {
    const d = new Date(now.getTime() - w * 7 * 86_400_000);
    const ds = d.toISOString().slice(0, 10);
    dayRevenues.push(revenueFor(ds, ds));
  }
  // Inventory alerts
  const activeProducts = products.filter((p) => p.active !== false);
  const outOfStock = activeProducts.filter((p) => (p.stock ?? 0) === 0);
  const lowStock = activeProducts.filter(
    (p) => p.stock != null && p.stockMin != null && p.stock > 0 && p.stock <= p.stockMin
  );

  // Estimate days until stockout (simplified: assume daily rate from last 7 days)
  const weekSalesQty: Record<string, number> = {};
  const weekSalesArr = sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo);
  const weekOrdersArr = validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= weekAgo);
  for (const s of weekSalesArr) {
    for (const i of s.items) {
      const pid = String(i.productId);
      weekSalesQty[pid] = (weekSalesQty[pid] ?? 0) + i.quantity;
    }
  }
  for (const o of weekOrdersArr) {
    for (const i of o.items) {
      const pid = String(i.id);
      weekSalesQty[pid] = (weekSalesQty[pid] ?? 0) + i.quantity;
    }
  }

  const criticalProducts = lowStock.slice(0, 3).map((p) => {
    const dailyRate = (weekSalesQty[String(p.id)] ?? 1) / 7;
    const daysLeft = dailyRate > 0 ? Math.floor((p.stock ?? 0) / dailyRate) : 99;
    return { name: p.name, stock: p.stock ?? 0, daysLeft };
  });

  // Pending orders / fiados
  const pendingOrders = orders.filter((o) => o.status === "pendiente");
  const pendingRevenue = pendingOrders.reduce((s, o) => s + o.total, 0);

  // Customer insights
  const month30 = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const recentBuyers = new Set<string>();
  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= month30)) {
    if (s.customerPhone) recentBuyers.add(s.customerPhone);
  }
  for (const o of validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= month30)) {
    if (o.customer?.phone) recentBuyers.add(o.customer.phone);
  }
  const inactiveLast30 = customers.filter((c) => c.phone && !recentBuyers.has(c.phone)).length;

  // Day-of-week performance insight
  const dayPerf: Record<number, number[]> = {};
  for (const s of sales) {
    const d = new Date(s.createdAt ?? "");
    if (!isNaN(d.getTime())) {
      const dow = d.getDay();
      if (!dayPerf[dow]) dayPerf[dow] = [];
      dayPerf[dow].push(s.total);
    }
  }
  const todayDowAvg = dayPerf[dayOfWeek]
    ? dayPerf[dayOfWeek].reduce((a, b) => a + b, 0) / dayPerf[dayOfWeek].length
    : 0;
  const overallDayAvg =
    Object.values(dayPerf).flat().reduce((a, b) => a + b, 0) /
    (Object.values(dayPerf).flat().length || 1);
  const dayMultiplier = overallDayAvg > 0 ? todayDowAvg / overallDayAvg : 1;

  // Top selling category today
  const catQty: Record<string, number> = {};
  for (const s of weekSalesArr) {
    for (const i of s.items) {
      const prod = activeProducts.find((p) => String(p.id) === String(i.productId));
      const cat = prod?.category ?? "General";
      catQty[cat] = (catQty[cat] ?? 0) + i.quantity;
    }
  }
  const topCategory = Object.entries(catQty).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "abarrotes";

  // Tasks
  const tasks: string[] = [];
  if (outOfStock.length > 0)
    tasks.push(`Reabastecer ${outOfStock.slice(0, 2).map((p) => p.name).join(" y ")} (stock agotado)`);
  if (pendingOrders.length > 0)
    tasks.push(`Atender ${pendingOrders.length} pedido${pendingOrders.length > 1 ? "s" : ""} pendiente${pendingOrders.length > 1 ? "s" : ""}`);
  if (criticalProducts.length > 0)
    tasks.push(`Pedir ${criticalProducts[0].name} — quedan ${criticalProducts[0].daysLeft} dias de stock`);
  if (inactiveLast30 > 5)
    tasks.push(`Contactar a ${inactiveLast30} clientes que no compran hace 30+ dias`);
  if (data.expenses.totalMonth && data.expenses.totalMonth > weekRevenue * 4)
    tasks.push("Revisar gastos del mes — superan el ritmo de ventas");
  tasks.push("Verificar stock de los 5 productos mas vendidos de la semana");
  tasks.push(`Revisar el rendimiento de ventas al cierre de hoy`);

  return {
    todayRevenue, yestRevenue, weekRevenue, prevWeekRevenue,
    todayTxns, yestTxns,
    outOfStock, lowStock, criticalProducts,
    pendingOrders: pendingOrders.length, pendingRevenue,
    inactiveLast30, dayMultiplier, topCategory,
    dayName: getDayName(), tasks: tasks.slice(0, 5),
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  data: BusinessData | null;
}

export default function AIDailyBriefing({ data }: Props) {
  const analysis = useMemo(() => analyzeBusiness(data), [data]);
  const { text: greeting, icon: GreetingIcon } = getGreeting();

  if (!analysis) {
    return <BriefingCard><p className="text-gray-500 dark:text-gray-400 text-sm">Cargando datos del negocio...</p></BriefingCard>;
  }

  const revDelta = analysis.yestRevenue > 0 ? parseFloat(pct(analysis.todayRevenue, analysis.yestRevenue)) : 0;
  const weekDelta = analysis.prevWeekRevenue > 0 ? parseFloat(pct(analysis.weekRevenue, analysis.prevWeekRevenue)) : 0;

  const TrendIcon = revDelta > 0 ? TrendingUp : revDelta < 0 ? TrendingDown : Minus;
  const trendColor = revDelta > 0 ? "text-emerald-600 dark:text-emerald-400" : revDelta < 0 ? "text-red-500 dark:text-red-400" : "text-gray-500";

  return (
    <BriefingCard>
      {/* Greeting */}
      <div className="flex items-center gap-2 mb-4">
        <GreetingIcon className="w-5 h-5 text-[#f4a261]" />
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
          {greeting}, aqui esta tu resumen del dia
        </h2>
      </div>

      {/* P1: Ventas */}
      <Section label="Ventas de hoy">
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {analysis.todayRevenue > 0 ? (
            <>
              Llevas <strong className="text-gray-900 dark:text-gray-50">{fmt(analysis.todayRevenue)}</strong> en ventas con{" "}
              <strong>{analysis.todayTxns}</strong> transacciones.{" "}
              {analysis.yestRevenue > 0 && (
                <span className={cn("inline-flex items-center gap-0.5 font-medium text-xs", trendColor)}>
                  <TrendIcon className="w-3.5 h-3.5" />
                  {Math.abs(revDelta)}% {revDelta >= 0 ? "mas" : "menos"} que ayer ({fmt(analysis.yestRevenue)})
                </span>
              )}
              {". "}Semana acumulada: <strong>{fmt(analysis.weekRevenue)}</strong>
              {analysis.prevWeekRevenue > 0 && (
                <span className={cn(
                  "ml-1 text-xs font-medium",
                  weekDelta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
                )}>
                  ({weekDelta > 0 ? "+" : ""}{weekDelta}% vs semana anterior)
                </span>
              )}
              .
            </>
          ) : (
            <>
              Todavia no hay ventas registradas hoy.{" "}
              {analysis.yestRevenue > 0 && <>Ayer cerraste con <strong>{fmt(analysis.yestRevenue)}</strong> en {analysis.yestTxns} transacciones.</>}
            </>
          )}
        </p>
      </Section>

      {/* P2: Alertas */}
      <Section label="Alertas">
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {analysis.outOfStock.length === 0 && analysis.lowStock.length === 0 && analysis.pendingOrders === 0 ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              Sin alertas criticas por ahora. El inventario y los pedidos estan bajo control.
            </span>
          ) : (
            <>
              {analysis.outOfStock.length > 0 && (
                <>
                  <strong className="text-red-600 dark:text-red-400">
                    {analysis.outOfStock.length} producto{analysis.outOfStock.length > 1 ? "s" : ""} agotado{analysis.outOfStock.length > 1 ? "s"  : ""}
                  </strong>
                  {": "}
                  {analysis.outOfStock.slice(0, 3).map((p) => p.name).join(", ")}
                  {analysis.outOfStock.length > 3 && ` y ${analysis.outOfStock.length - 3} mas`}.{" "}
                </>
              )}
              {analysis.criticalProducts.length > 0 && (
                <>
                  {analysis.criticalProducts.map((p) => (
                    <span key={p.name}>
                      <strong>{p.name}</strong> se acaba en aproximadamente{" "}
                      <strong className="text-amber-600 dark:text-amber-400">{p.daysLeft} dia{p.daysLeft !== 1 ? "s" : ""}</strong>.{" "}
                    </span>
                  ))}
                </>
              )}
              {analysis.pendingOrders > 0 && (
                <>
                  Tienes <strong className="text-amber-600 dark:text-amber-400">{analysis.pendingOrders} pedido{analysis.pendingOrders > 1 ? "s" : ""} pendiente{analysis.pendingOrders > 1 ? "s" : ""}</strong>
                  {analysis.pendingRevenue > 0 && <> por un total de <strong>{fmt(analysis.pendingRevenue)}</strong></>}.{" "}
                </>
              )}
            </>
          )}
        </p>
      </Section>

      {/* P3: Oportunidades */}
      <Section label="Oportunidades de hoy">
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {analysis.dayMultiplier >= 1.1 ? (
            <>
              Hoy es <strong>{analysis.dayName}</strong> — historicamente uno de tus mejores dias, con ventas{" "}
              <strong className="text-emerald-600 dark:text-emerald-400">{((analysis.dayMultiplier - 1) * 100).toFixed(0)}% por encima del promedio</strong>.
              Asegurate de tener stock suficiente en <strong>{analysis.topCategory}</strong>.{" "}
            </>
          ) : analysis.dayMultiplier < 0.9 ? (
            <>
              Hoy es <strong>{analysis.dayName}</strong>, tipicamente mas tranquilo que otros dias.
              Buen momento para ordenar inventario, revisar precios o planificar pedidos a proveedores.{" "}
            </>
          ) : (
            <>
              Hoy es <strong>{analysis.dayName}</strong>, con un ritmo de ventas promedio esperado.
              Concentra esfuerzos en <strong>{analysis.topCategory}</strong>, tu categoria mas activa esta semana.{" "}
            </>
          )}
          {analysis.inactiveLast30 > 5 && (
            <>
              Hay <strong>{analysis.inactiveLast30} clientes</strong> que no compran hace 30+ dias —
              un descuento de fidelidad podria reactivarlos.
            </>
          )}
        </p>
      </Section>

      {/* P4: Tareas */}
      <Section label="Acciones para hoy">
        <ol className="flex flex-col gap-1.5">
          {analysis.tasks.map((task, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-[#2d6a4f]/10 dark:bg-[#2d6a4f]/20 text-[#2d6a4f] dark:text-[#52b788] text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              {task}
            </li>
          ))}
        </ol>
      </Section>
    </BriefingCard>
  );
}

function BriefingCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
      {children}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#2d6a4f] dark:text-[#52b788] mb-1.5">
        {label}
      </h3>
      {children}
    </div>
  );
}
