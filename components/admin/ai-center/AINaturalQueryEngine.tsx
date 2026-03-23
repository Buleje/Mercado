"use client";

import { useState, useRef, useCallback, KeyboardEvent } from "react";
import { Send, Clock, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

// ── Types ──────────────────────────────────────────────────────────────────────

type QueryResult = {
  id: string;
  query: string;
  answer: string;
  value?: number | string;
  chartData?: { label: string; value: number }[];
  ts: number;
};

// ── Query engine ───────────────────────────────────────────────────────────────

function processQuery(query: string, data: BusinessData | null): Omit<QueryResult, "id" | "ts"> {
  if (!data) return { query, answer: "Datos no disponibles aun. Espera un momento." };

  const q = query.toLowerCase().trim();
  const { products, orders, sales, customers } = data;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  const validOrders = orders.filter((o) => o.status !== "cancelado");

  const revFor = (from: string, to: string) => {
    const ord = validOrders.filter((o) => {
      const d = o.createdAt?.slice(0, 10) ?? "";
      return d >= from && d <= to;
    }).reduce((s, o) => s + o.total, 0);
    const sal = sales.filter((s) => {
      const d = s.createdAt?.slice(0, 10) ?? "";
      return d >= from && d <= to;
    }).reduce((s, sl) => s + sl.total, 0);
    return ord + sal;
  };

  const fmt = (n: number) => `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── VENTAS ────────────────────────────────────────────────────────────

  if ((q.includes("vend") || q.includes("ingres") || q.includes("cuanto")) && q.includes("hoy")) {
    const rev = revFor(today, today);
    const txns = validOrders.filter((o) => o.createdAt?.slice(0, 10) === today).length +
      sales.filter((s) => s.createdAt?.slice(0, 10) === today).length;
    return { query, answer: `Hoy llevas ${fmt(rev)} en ventas con ${txns} transacciones.`, value: rev };
  }

  if ((q.includes("vend") || q.includes("ingres")) && q.includes("ayer")) {
    const rev = revFor(yesterday, yesterday);
    return { query, answer: `Ayer vendiste ${fmt(rev)}.`, value: rev };
  }

  if ((q.includes("vend") || q.includes("ingres")) && (q.includes("semana") || q.includes("7 dia") || q.includes("ultimos 7"))) {
    const rev = revFor(weekAgo, today);
    const daily: { label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86_400_000);
      const ds = d.toISOString().slice(0, 10);
      daily.push({ label: d.toLocaleDateString("es-PE", { weekday: "short" }), value: revFor(ds, ds) });
    }
    return {
      query,
      answer: `Esta semana llevas ${fmt(rev)} en ventas (ultimos 7 dias).`,
      value: rev,
      chartData: daily,
    };
  }

  if ((q.includes("vend") || q.includes("ingres")) && q.includes("mes")) {
    const rev = revFor(monthAgo, today);
    return { query, answer: `Este mes llevas ${fmt(rev)} en ventas (ultimos 30 dias).`, value: rev };
  }

  // ── PRODUCTOS ─────────────────────────────────────────────────────────

  if ((q.includes("mejor") || q.includes("mas vendido") || q.includes("top")) && (q.includes("producto") || q.includes("articulo"))) {
    const qty: Record<string, { name: string; qty: number }> = {};
    for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
      for (const i of s.items) {
        const pid = String(i.productId);
        if (!qty[pid]) qty[pid] = { name: i.name, qty: 0 };
        qty[pid].qty += i.quantity;
      }
    }
    const top5 = Object.values(qty).sort((a, b) => b.qty - a.qty).slice(0, 5);
    if (top5.length === 0) return { query, answer: "No hay datos de ventas por producto este mes." };
    const chartData = top5.map((p) => ({ label: p.name.length > 12 ? p.name.slice(0, 12) + "..." : p.name, value: p.qty }));
    return {
      query,
      answer: `Top producto del mes: ${top5[0].name} con ${top5[0].qty} unidades vendidas.`,
      value: top5[0].qty,
      chartData,
    };
  }

  if (q.includes("stock bajo") || (q.includes("stock") && (q.includes("critico") || q.includes("poco") || q.includes("minimo")))) {
    const lowStock = products.filter(
      (p) => p.active !== false && p.stock != null && p.stockMin != null && p.stock <= p.stockMin
    );
    if (lowStock.length === 0) return { query, answer: "No hay productos con stock bajo actualmente." };
    const list = lowStock.slice(0, 5).map((p) => `${p.name} (${p.stock}/${p.stockMin})`).join(", ");
    return {
      query,
      answer: `Hay ${lowStock.length} producto${lowStock.length > 1 ? "s" : ""} con stock bajo: ${list}${lowStock.length > 5 ? "..." : ""}`,
      value: lowStock.length,
    };
  }

  if (q.includes("agotado") || (q.includes("stock") && (q.includes("cero") || q.includes("sin")))) {
    const oos = products.filter((p) => p.active !== false && (p.stock ?? 0) === 0);
    if (oos.length === 0) return { query, answer: "No hay productos agotados actualmente." };
    return {
      query,
      answer: `${oos.length} producto${oos.length > 1 ? "s" : ""} sin stock: ${oos.slice(0, 5).map((p) => p.name).join(", ")}${oos.length > 5 ? "..." : ""}`,
      value: oos.length,
    };
  }

  if (q.includes("cuantos producto") || (q.includes("total") && q.includes("producto"))) {
    const active = products.filter((p) => p.active !== false).length;
    return { query, answer: `Tienes ${active} productos activos en catalogo.`, value: active };
  }

  if (q.includes("margen") && (q.includes("producto") || q.includes("general") || q.includes("cual"))) {
    const expMonth = data.expenses.totalMonth ?? 0;
    const revMonth = revFor(monthAgo, today);
    const margin = revMonth > 0 ? Math.max(0, (revMonth - expMonth) / revMonth) * 100 : 0;
    return {
      query,
      answer: `Tu margen general este mes es aproximadamente ${margin.toFixed(1)}% (ingresos ${fmt(revMonth)}, gastos ${fmt(expMonth)}).`,
      value: margin,
    };
  }

  // ── CLIENTES ──────────────────────────────────────────────────────────

  if (q.includes("cuantos cliente") || (q.includes("total") && q.includes("cliente"))) {
    return { query, answer: `Tienes ${customers.length} clientes registrados en total.`, value: customers.length };
  }

  if (q.includes("mejor cliente") || q.includes("cliente vip") || q.includes("top cliente")) {
    const spendMap: Record<string, number> = {};
    for (const o of validOrders) {
      if (o.customer?.phone) spendMap[o.customer.phone] = (spendMap[o.customer.phone] ?? 0) + o.total;
    }
    for (const s of sales) {
      if (s.customerPhone) spendMap[s.customerPhone] = (spendMap[s.customerPhone] ?? 0) + s.total;
    }
    const top = Object.entries(spendMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top.length === 0) return { query, answer: "No hay datos de gasto por cliente aun." };
    const topCustomers = top.map(([phone, spent]) => {
      const c = customers.find((x) => x.phone === phone);
      return { label: c?.name ?? phone, value: Math.round(spent) };
    });
    return {
      query,
      answer: `Tu mejor cliente es ${topCustomers[0].label} con ${fmt(topCustomers[0].value)} en compras totales.`,
      value: topCustomers[0].value,
      chartData: topCustomers,
    };
  }

  if (q.includes("cliente nuevo") || q.includes("nuevos cliente")) {
    const newMonth = customers.filter((c) => (c.createdAt?.slice(0, 10) ?? "") >= monthAgo).length;
    const newWeek = customers.filter((c) => (c.createdAt?.slice(0, 10) ?? "") >= weekAgo).length;
    return {
      query,
      answer: `Esta semana: ${newWeek} cliente${newWeek !== 1 ? "s" : ""} nuevo${newWeek !== 1 ? "s" : ""}. Este mes: ${newMonth} nuevo${newMonth !== 1 ? "s" : ""}.`,
      value: newMonth,
    };
  }

  // ── PEDIDOS ───────────────────────────────────────────────────────────

  if (q.includes("pedido") && (q.includes("pendiente") || q.includes("cuantos") || q.includes("sin atender"))) {
    const pending = orders.filter((o) => o.status === "pendiente").length;
    return { query, answer: `Hay ${pending} pedido${pending !== 1 ? "s" : ""} pendiente${pending !== 1 ? "s" : ""} por atender.`, value: pending };
  }

  if (q.includes("pedido") && q.includes("hoy")) {
    const todayOrders = validOrders.filter((o) => o.createdAt?.slice(0, 10) === today).length;
    return { query, answer: `Hoy tienes ${todayOrders} pedido${todayOrders !== 1 ? "s" : ""} confirmado${todayOrders !== 1 ? "s" : ""}.`, value: todayOrders };
  }

  // ── GASTOS ────────────────────────────────────────────────────────────

  if (q.includes("gasto") || q.includes("egreso") || q.includes("costo")) {
    const exp = data.expenses.totalMonth ?? 0;
    return {
      query,
      answer: exp > 0
        ? `Tus gastos este mes suman ${fmt(exp)}.`
        : "No hay datos de gastos disponibles este mes.",
      value: exp,
    };
  }

  // ── DEFAULT ───────────────────────────────────────────────────────────

  return {
    query,
    answer: `No entendi bien esa consulta. Intenta: "cuanto vendi hoy", "cuales son mis mejores productos", "cuantos clientes tengo", "stock bajo", "pedidos pendientes" o "mi margen de ganancias".`,
  };
}

// ── Mini sparkline chart ───────────────────────────────────────────────────────

function MiniBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="mt-2 flex items-end gap-1 h-14">
      {data.map((d) => {
        const h = Math.max(4, (d.value / max) * 56);
        return (
          <div key={d.label} className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
            <div
              className="w-full rounded-t bg-[#2d6a4f]/70 dark:bg-[#52b788]/50 transition-all duration-500"
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

// ── Suggestions ────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Cuanto vendi hoy",
  "Cuales son mis mejores productos",
  "Cuantos clientes tengo",
  "Pedidos pendientes",
  "Stock bajo",
  "Mejor cliente",
  "Cuanto vendi esta semana",
  "Cuantos productos agotados",
];

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  data: BusinessData | null;
}

export default function AINaturalQueryEngine({ data }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QueryResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    const result = processQuery(q, data);
    setResults((prev) => [
      { ...result, id: `q-${Date.now()}`, ts: Date.now() },
      ...prev.slice(0, 9),
    ]);
    setQuery("");
  }, [query, data]);

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Consulta en lenguaje natural
        </h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          Pregunta en espanol. Analisis 100% local, sin IA externa.
        </p>
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ej: cuanto vendi esta semana?"
          className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2d6a4f]/30 focus:border-[#2d6a4f]"
        />
        <button
          onClick={handleSubmit}
          disabled={!query.trim()}
          className={cn(
            "px-3 py-2 rounded-lg bg-[#2d6a4f] text-white transition-colors",
            !query.trim() ? "opacity-40 cursor-not-allowed" : "hover:bg-[#245a42]"
          )}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {/* Suggestions */}
      {results.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => { setQuery(s); inputRef.current?.focus(); }}
              className="text-xs px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#2d6a4f]/50 hover:text-[#2d6a4f] dark:hover:text-[#52b788] transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="flex flex-col gap-3 max-h-72 overflow-y-auto pr-1">
          {results.map((r) => (
            <div key={r.id} className="rounded-lg border border-gray-100 dark:border-gray-800 p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Clock className="w-3 h-3 text-gray-300 dark:text-gray-600 shrink-0" />
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {new Date(r.ts).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-1 italic">&quot;{r.query}&quot;</span>
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

      {/* Clear history */}
      {results.length > 0 && (
        <button
          onClick={() => setResults([])}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 self-start transition-colors"
        >
          Limpiar historial
        </button>
      )}
    </div>
  );
}
