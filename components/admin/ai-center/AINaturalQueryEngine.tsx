"use client";

import { useState, useRef, useCallback, KeyboardEvent } from "react";
import { Send, Clock, BarChart3, Lightbulb, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

// -- Types --

type QueryResult = {
  id: string;
  query: string;
  answer: string;
  value?: number | string;
  chartData?: { label: string; value: number }[];
  ts: number;
};

// -- Typo normalization --

const ALIASES: Record<string, string[]> = {
  venta: ["vendi", "vendido", "vendimos", "vendo", "ventas", "ingresos", "ingrese", "ingreso", "facture"],
  producto: ["productos", "articulo", "articulos", "item", "items"],
  cliente: ["clientes", "comprador", "compradores"],
  pedido: ["pedidos", "orden", "ordenes"],
  gasto: ["gastos", "egreso", "egresos", "costo", "costos", "pagos"],
  stock: ["inventario", "existencia", "almacen"],
  hoy: ["dia", "ahora", "hoydia"],
  semana: ["semanal", "7dias", "7 dias", "ultimos 7"],
  mes: ["mensual", "30dias", "30 dias", "este mes", "mensualmente"],
  ayer: ["dia anterior", "pasado"],
  mejor: ["top", "mas vendido", "mas popular", "estrella", "destacado"],
  fiado: ["fiados", "credito", "creditos", "deben", "deuda", "deudas", "moroso", "morosos"],
  margen: ["ganancia", "ganancias", "rentabilidad", "utilidad", "profit"],
  cancelado: ["cancelacion", "cancelaciones", "cancelados", "anulado", "anulados"],
  ticket: ["ticket promedio", "promedio venta", "venta promedio"],
};

function normalize(q: string): string {
  let n = q.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!¿¡.,;:]/g, "");
  for (const [canonical, variants] of Object.entries(ALIASES)) {
    for (const v of variants) {
      if (n.includes(v)) n = n.replace(v, canonical);
    }
  }
  return n;
}

// -- Query engine --

function processQuery(raw: string, data: BusinessData | null, lastCtx?: string): Omit<QueryResult, "id" | "ts"> & { ctx?: string } {
  if (!data) return { query: raw, answer: "Datos no disponibles aun. Espera un momento." };

  const q = normalize(raw);
  const { products, orders, sales, customers } = data;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const prevWeekStart = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const prevMonthStart = new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);

  const validOrders = orders.filter((o) => o.status !== "cancelado");
  const activeProducts = products.filter((p) => p.active !== false);

  const revFor = (from: string, to: string) => {
    const ord = validOrders.filter((o) => { const d = o.createdAt?.slice(0, 10) ?? ""; return d >= from && d <= to; }).reduce((s, o) => s + o.total, 0);
    const sal = sales.filter((s) => { const d = s.createdAt?.slice(0, 10) ?? ""; return d >= from && d <= to; }).reduce((s, sl) => s + sl.total, 0);
    return ord + sal;
  };

  const txnCount = (from: string, to: string) =>
    validOrders.filter((o) => { const d = o.createdAt?.slice(0, 10) ?? ""; return d >= from && d <= to; }).length +
    sales.filter((s) => { const d = s.createdAt?.slice(0, 10) ?? ""; return d >= from && d <= to; }).length;

  const fmt = (n: number) => `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // -- VENTAS --

  if (q.includes("venta") && q.includes("hoy")) {
    const rev = revFor(today, today);
    const txns = txnCount(today, today);
    const revYesterday = revFor(yesterday, yesterday);
    const diff = revYesterday > 0 ? ((rev - revYesterday) / revYesterday * 100).toFixed(0) : null;
    const cmp = diff ? ` (${parseInt(diff) >= 0 ? "+" : ""}${diff}% vs ayer)` : "";
    return { query: raw, answer: `Hoy llevas ${fmt(rev)} en ventas con ${txns} transacciones${cmp}.`, value: rev, ctx: "ventas-hoy" };
  }

  if (q.includes("venta") && q.includes("ayer")) {
    const rev = revFor(yesterday, yesterday);
    return { query: raw, answer: `Ayer vendiste ${fmt(rev)}.`, value: rev, ctx: "ventas-ayer" };
  }

  if (q.includes("venta") && q.includes("semana")) {
    const rev = revFor(weekAgo, today);
    const prevRev = revFor(prevWeekStart, weekAgo);
    const diff = prevRev > 0 ? ((rev - prevRev) / prevRev * 100).toFixed(0) : null;
    const cmp = diff ? ` (${parseInt(diff) >= 0 ? "+" : ""}${diff}% vs semana anterior)` : "";
    const daily: { label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86_400_000);
      const ds = d.toISOString().slice(0, 10);
      daily.push({ label: d.toLocaleDateString("es-PE", { weekday: "short" }), value: revFor(ds, ds) });
    }
    return { query: raw, answer: `Esta semana: ${fmt(rev)}${cmp}.`, value: rev, chartData: daily, ctx: "ventas-semana" };
  }

  if (q.includes("venta") && q.includes("mes")) {
    const rev = revFor(monthAgo, today);
    const prevRev = revFor(prevMonthStart, monthAgo);
    const diff = prevRev > 0 ? ((rev - prevRev) / prevRev * 100).toFixed(0) : null;
    const cmp = diff ? ` (${parseInt(diff) >= 0 ? "+" : ""}${diff}% vs mes anterior)` : "";
    return { query: raw, answer: `Este mes: ${fmt(rev)}${cmp}.`, value: rev, ctx: "ventas-mes" };
  }

  // -- COMPARACIONES --

  if ((q.includes("compara") || q.includes("vs") || q.includes("versus") || q.includes("diferencia")) && q.includes("venta")) {
    const revToday = revFor(today, today);
    const revYesterday = revFor(yesterday, yesterday);
    const revWeek = revFor(weekAgo, today);
    const revPrevWeek = revFor(prevWeekStart, weekAgo);
    return {
      query: raw,
      answer: `Hoy: ${fmt(revToday)} vs Ayer: ${fmt(revYesterday)} | Semana: ${fmt(revWeek)} vs Anterior: ${fmt(revPrevWeek)}`,
      chartData: [
        { label: "Hoy", value: revToday },
        { label: "Ayer", value: revYesterday },
        { label: "Semana", value: revWeek },
        { label: "Sem. ant.", value: revPrevWeek },
      ],
      ctx: "comparacion",
    };
  }

  // -- TICKET PROMEDIO --

  if (q.includes("ticket") || (q.includes("promedio") && q.includes("venta"))) {
    const recentSales = sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo && s.total > 0);
    if (recentSales.length === 0) return { query: raw, answer: "No hay ventas esta semana para calcular ticket promedio." };
    const avg = recentSales.reduce((s, x) => s + x.total, 0) / recentSales.length;
    const max = Math.max(...recentSales.map((s) => s.total));
    const min = Math.min(...recentSales.map((s) => s.total));
    return {
      query: raw,
      answer: `Ticket promedio esta semana: ${fmt(avg)}. Menor: ${fmt(min)}, Mayor: ${fmt(max)} (${recentSales.length} ventas).`,
      value: avg,
      ctx: "ticket",
    };
  }

  // -- PRODUCTOS --

  if ((q.includes("mejor") || q.includes("top")) && q.includes("producto")) {
    const qty: Record<string, { name: string; qty: number; rev: number }> = {};
    for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
      for (const i of s.items) {
        const pid = String(i.productId);
        if (!qty[pid]) qty[pid] = { name: i.name, qty: 0, rev: 0 };
        qty[pid].qty += i.quantity;
        qty[pid].rev += i.quantity * (i.price ?? 0);
      }
    }
    const top5 = Object.values(qty).sort((a, b) => b.qty - a.qty).slice(0, 5);
    if (top5.length === 0) return { query: raw, answer: "No hay ventas por producto este mes." };
    const chartData = top5.map((p) => ({ label: p.name.length > 12 ? p.name.slice(0, 12) + "..." : p.name, value: p.qty }));
    return {
      query: raw,
      answer: `Top: ${top5[0].name} (${top5[0].qty} uds, ${fmt(top5[0].rev)}).`,
      value: top5[0].qty,
      chartData,
      ctx: "top-productos",
    };
  }

  // -- NEW: Productos mas rentables --

  if (q.includes("rentable") || (q.includes("margen") && q.includes("producto"))) {
    const withMargin = activeProducts
      .filter((p) => p.price && p.costPrice && p.costPrice > 0)
      .map((p) => ({ name: p.name, margin: ((p.price! - p.costPrice!) / p.price!) * 100, profit: p.price! - p.costPrice! }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);
    if (withMargin.length === 0) return { query: raw, answer: "No hay datos de costo para calcular rentabilidad." };
    const chartData = withMargin.map((p) => ({ label: p.name.length > 10 ? p.name.slice(0, 10) + ".." : p.name, value: Math.round(p.margin) }));
    return {
      query: raw,
      answer: `Mas rentable: ${withMargin[0].name} (${withMargin[0].margin.toFixed(0)}% margen, S/${withMargin[0].profit.toFixed(0)} ganancia/ud).`,
      chartData,
      ctx: "productos-rentables",
    };
  }

  // -- NEW: Buscar producto especifico --

  if (q.includes("cuanto") && (q.includes("de ") || q.includes("del "))) {
    const match = raw.match(/(?:de|del)\s+["']?([^"'?]+)["']?/i);
    if (match) {
      const search = match[1].trim().toLowerCase();
      const found = products.find((p) => p.name.toLowerCase().includes(search));
      if (found) {
        let soldQty = 0, soldRev = 0;
        for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
          for (const i of s.items) {
            if (String(i.productId) === String(found.id)) {
              soldQty += i.quantity;
              soldRev += i.quantity * (i.price ?? 0);
            }
          }
        }
        return {
          query: raw,
          answer: `"${found.name}": Stock actual: ${found.stock ?? 0} uds. Vendido este mes: ${soldQty} uds (${fmt(soldRev)}). Precio: ${fmt(found.price ?? 0)}.`,
          value: soldQty,
          ctx: "producto-" + found.id,
        };
      }
      return { query: raw, answer: `No encontre un producto que coincida con "${search}". Intenta con el nombre exacto.` };
    }
  }

  if (q.includes("stock bajo") || (q.includes("stock") && (q.includes("critico") || q.includes("poco") || q.includes("minimo")))) {
    const lowStock = products.filter((p) => p.active !== false && p.stock != null && p.stockMin != null && p.stock <= p.stockMin);
    if (lowStock.length === 0) return { query: raw, answer: "No hay productos con stock bajo." };
    const list = lowStock.slice(0, 5).map((p) => `${p.name} (${p.stock}/${p.stockMin})`).join(", ");
    return { query: raw, answer: `${lowStock.length} con stock bajo: ${list}${lowStock.length > 5 ? "..." : ""}`, value: lowStock.length, ctx: "stock-bajo" };
  }

  if (q.includes("agotado") || (q.includes("stock") && (q.includes("cero") || q.includes("sin")))) {
    const oos = products.filter((p) => p.active !== false && (p.stock ?? 0) === 0);
    if (oos.length === 0) return { query: raw, answer: "No hay productos agotados." };
    return { query: raw, answer: `${oos.length} agotado${oos.length > 1 ? "s" : ""}: ${oos.slice(0, 5).map((p) => p.name).join(", ")}${oos.length > 5 ? "..." : ""}`, value: oos.length, ctx: "agotados" };
  }

  if (q.includes("cuantos producto") || (q.includes("total") && q.includes("producto"))) {
    const active = activeProducts.length;
    return { query: raw, answer: `${active} productos activos en catalogo.`, value: active, ctx: "total-productos" };
  }

  if (q.includes("margen") || q.includes("ganancia")) {
    const expMonth = data.expenses?.totalMonth ?? 0;
    const revMonth = revFor(monthAgo, today);
    const margin = revMonth > 0 ? Math.max(0, (revMonth - expMonth) / revMonth) * 100 : 0;
    return { query: raw, answer: `Margen este mes: ~${margin.toFixed(1)}% (Ingresos: ${fmt(revMonth)}, Gastos: ${fmt(expMonth)}).`, value: margin, ctx: "margen" };
  }

  // -- CLIENTES --

  if (q.includes("cuantos cliente") || (q.includes("total") && q.includes("cliente"))) {
    return { query: raw, answer: `${customers.length} clientes registrados.`, value: customers.length, ctx: "clientes" };
  }

  if (q.includes("mejor cliente") || q.includes("cliente vip") || q.includes("top cliente")) {
    const spendMap: Record<string, number> = {};
    for (const o of validOrders) { if (o.customer?.phone) spendMap[o.customer.phone] = (spendMap[o.customer.phone] ?? 0) + o.total; }
    for (const s of sales) { if (s.customerPhone) spendMap[s.customerPhone] = (spendMap[s.customerPhone] ?? 0) + s.total; }
    const top = Object.entries(spendMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top.length === 0) return { query: raw, answer: "Sin datos de gasto por cliente." };
    const topC = top.map(([phone, spent]) => {
      const c = customers.find((x) => x.phone === phone);
      return { label: c?.name ?? phone, value: Math.round(spent) };
    });
    return { query: raw, answer: `Mejor: ${topC[0].label} con ${fmt(topC[0].value)} en compras.`, value: topC[0].value, chartData: topC, ctx: "top-clientes" };
  }

  if (q.includes("cliente nuevo") || q.includes("nuevos cliente")) {
    const newMonth = customers.filter((c) => (c.createdAt?.slice(0, 10) ?? "") >= monthAgo).length;
    const newWeek = customers.filter((c) => (c.createdAt?.slice(0, 10) ?? "") >= weekAgo).length;
    return { query: raw, answer: `Semana: ${newWeek} nuevo${newWeek !== 1 ? "s" : ""}. Mes: ${newMonth} nuevo${newMonth !== 1 ? "s" : ""}.`, value: newMonth, ctx: "clientes-nuevos" };
  }

  // -- FIADOS (NEW) --

  if (q.includes("fiado") || q.includes("deuda") || q.includes("moroso") || q.includes("credito")) {
    // TECH-DEBT: alerts type does not include totalFiados/fiadosCount yet (schema drift)
    const alertsExt = data.alerts as (typeof data.alerts & { totalFiados?: number; fiadosCount?: number }) | undefined;
    const fiTotal = alertsExt?.totalFiados ?? 0;
    const fiCount = alertsExt?.fiadosCount ?? 0;
    if (fiCount === 0 && fiTotal === 0) return { query: raw, answer: "No hay fiados pendientes registrados." };
    return {
      query: raw,
      answer: `Fiados: ${fiCount} cliente${fiCount !== 1 ? "s" : ""} deben en total ${fmt(fiTotal)}.`,
      value: fiTotal,
      ctx: "fiados",
    };
  }

  // -- CANCELACIONES (NEW) --

  if (q.includes("cancelado") || q.includes("cancelacion") || q.includes("anulado")) {
    const cancelMonth = orders.filter((o) => o.status === "cancelado" && (o.createdAt?.slice(0, 10) ?? "") >= monthAgo).length;
    const totalMonth = orders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= monthAgo).length;
    const rate = totalMonth > 0 ? (cancelMonth / totalMonth * 100).toFixed(1) : "0";
    return { query: raw, answer: `${cancelMonth} cancelado${cancelMonth !== 1 ? "s" : ""} de ${totalMonth} pedidos (${rate}% tasa).`, value: cancelMonth, ctx: "cancelaciones" };
  }

  // -- PEDIDOS --

  if (q.includes("pedido") && (q.includes("pendiente") || q.includes("cuantos") || q.includes("sin atender"))) {
    const pending = orders.filter((o) => o.status === "pendiente").length;
    const totalPending = orders.filter((o) => o.status === "pendiente").reduce((s, o) => s + o.total, 0);
    return { query: raw, answer: `${pending} pedido${pending !== 1 ? "s" : ""} pendiente${pending !== 1 ? "s" : ""} por ${fmt(totalPending)}.`, value: pending, ctx: "pedidos-pendientes" };
  }

  if (q.includes("pedido") && q.includes("hoy")) {
    const todayOrders = validOrders.filter((o) => o.createdAt?.slice(0, 10) === today).length;
    return { query: raw, answer: `Hoy: ${todayOrders} pedido${todayOrders !== 1 ? "s" : ""}.`, value: todayOrders, ctx: "pedidos-hoy" };
  }

  // -- GASTOS --

  if (q.includes("gasto") || q.includes("egreso") || q.includes("costo")) {
    const exp = data.expenses?.totalMonth ?? 0;
    return { query: raw, answer: exp > 0 ? `Gastos este mes: ${fmt(exp)}.` : "Sin datos de gastos este mes.", value: exp, ctx: "gastos" };
  }

  // -- RESUMEN RAPIDO (NEW) --

  if (q.includes("resumen") || q.includes("como va") || q.includes("como estamos") || q.includes("situacion")) {
    const revToday = revFor(today, today);
    const revWeek = revFor(weekAgo, today);
    const pending = orders.filter((o) => o.status === "pendiente").length;
    const oos = products.filter((p) => p.active !== false && (p.stock ?? 0) === 0).length;
    return {
      query: raw,
      answer: `Hoy: ${fmt(revToday)} | Semana: ${fmt(revWeek)} | ${pending} pedido${pending !== 1 ? "s" : ""} pendiente${pending !== 1 ? "s" : ""} | ${oos} producto${oos !== 1 ? "s" : ""} agotado${oos !== 1 ? "s" : ""}`,
      ctx: "resumen",
    };
  }

  // -- FOLLOW-UP (context-aware) --

  if (lastCtx && (q.includes("mas detalle") || q.includes("explica") || q.includes("por que") || q === "y" || q === "mas")) {
    if (lastCtx.startsWith("ventas")) {
      const revWeek = revFor(weekAgo, today);
      const dailyAvg = revWeek / 7;
      const bestDay = (() => {
        let best = { day: "", rev: 0 };
        for (let i = 0; i < 7; i++) {
          const d = new Date(now.getTime() - i * 86_400_000);
          const ds = d.toISOString().slice(0, 10);
          const r = revFor(ds, ds);
          if (r > best.rev) best = { day: d.toLocaleDateString("es-PE", { weekday: "long" }), rev: r };
        }
        return best;
      })();
      return { query: raw, answer: `Promedio diario: ${fmt(dailyAvg)}. Mejor dia: ${bestDay.day} con ${fmt(bestDay.rev)}.`, ctx: lastCtx };
    }
    return { query: raw, answer: "No tengo mas detalle para la ultima consulta. Intenta preguntar algo especifico." };
  }

  // -- DEFAULT --

  return {
    query: raw,
    answer: `No entendi. Prueba: "cuanto vendi hoy", "mis productos top", "stock bajo", "fiados pendientes", "ticket promedio", "productos rentables", "resumen".`,
  };
}

// -- Mini sparkline chart --

function MiniBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="mt-2 flex items-end gap-1 h-14">
      {data.map((d) => {
        const h = Math.max(4, (d.value / max) * 56);
        return (
          <div key={d.label} className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
            <div
              className="w-full rounded-t bg-[#00B4A6]/70 dark:bg-[#2dd4bf]/50 transition-all duration-500"
              style={{ height: h }}
              title={`${d.label}: ${d.value}`}
            />
            <span className="text-[9px] text-gray-400 dark:text-gray-500 truncate w-full text-center">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// -- Suggestions --

const SUGGESTIONS = [
  "Cuanto vendi hoy",
  "Ventas esta semana",
  "Mis productos top",
  "Productos rentables",
  "Ticket promedio",
  "Pedidos pendientes",
  "Stock bajo",
  "Mejor cliente",
  "Clientes nuevos",
  "Fiados pendientes",
  "Cancelaciones",
  "Dame un resumen",
];

// -- Quick Stats --

function QuickStats({ data }: { data: BusinessData }) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const validOrders = data.orders.filter((o) => o.status !== "cancelado");
  const todayRev = validOrders.filter((o) => o.createdAt?.slice(0, 10) === today).reduce((s, o) => s + o.total, 0)
    + data.sales.filter((s) => s.createdAt?.slice(0, 10) === today).reduce((s, sl) => s + sl.total, 0);
  const pending = data.orders.filter((o) => o.status === "pendiente").length;
  const oos = data.products.filter((p) => p.active !== false && (p.stock ?? 0) === 0).length;

  return (
    <div className="grid grid-cols-3 gap-2 mb-3">
      {[
        { label: "Hoy", value: `S/${todayRev.toFixed(0)}`, color: "text-emerald-600 dark:text-emerald-400" },
        { label: "Pendientes", value: String(pending), color: pending > 5 ? "text-amber-600 dark:text-amber-400" : "text-gray-700 dark:text-gray-300" },
        { label: "Agotados", value: String(oos), color: oos > 0 ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300" },
      ].map((s) => (
        <div key={s.label} className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
          <p className={cn("text-sm font-bold", s.color)}>{s.value}</p>
          <p className="text-[10px] text-gray-400">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// -- Component --

interface Props {
  data: BusinessData | null;
}

export default function AINaturalQueryEngine({ data }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QueryResult[]>([]);
  const [lastCtx, setLastCtx] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    const result = processQuery(q, data, lastCtx);
    if (result.ctx) setLastCtx(result.ctx);
    setResults((prev) => [
      { query: result.query, answer: result.answer, value: result.value, chartData: result.chartData, id: `q-${Date.now()}`, ts: Date.now() },
      ...prev.slice(0, 14),
    ]);
    setQuery("");
  }, [query, data, lastCtx]);

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Consulta Natural
          </h2>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Pregunta en espanol. 100% local, sin IA externa.
          </p>
        </div>
      </div>

      {data && results.length === 0 && <QuickStats data={data} />}

      {/* Input */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ej: cuanto vendi esta semana?"
          className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30 focus:border-[#00B4A6]"
        />
        <button
          onClick={handleSubmit}
          disabled={!query.trim()}
          className={cn(
            "px-3 py-2 rounded-lg bg-[#00B4A6] text-white transition-colors",
            !query.trim() ? "opacity-40 cursor-not-allowed" : "hover:bg-[#009690]"
          )}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {/* Suggestions */}
      {results.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          <div className="flex items-center gap-1 w-full mb-1">
            <Lightbulb className="w-3 h-3 text-gray-400" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Sugerencias</span>
          </div>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => { setQuery(s); inputRef.current?.focus(); }}
              className="text-xs px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#00B4A6]/50 hover:text-[#00B4A6] dark:hover:text-[#2dd4bf] transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-1">
          {results.map((r) => (
            <div key={r.id} className="rounded-lg border border-gray-100 dark:border-gray-800 p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Clock className="w-3 h-3 text-gray-300 dark:text-gray-600 shrink-0" />
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {new Date(r.ts).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-1 italic truncate">&quot;{r.query}&quot;</span>
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-200">{r.answer}</p>
              {r.chartData && r.chartData.length > 0 && (
                <div className="mt-1">
                  <div className="flex items-center gap-1 mb-1">
                    <BarChart3 className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-400">Distribucion</span>
                  </div>
                  <MiniBarChart data={r.chartData} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {results.length > 0 && (
        <button
          onClick={() => { setResults([]); setLastCtx(undefined); }}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 self-start transition-colors"
        >
          Limpiar historial
        </button>
      )}
    </div>
  );
}