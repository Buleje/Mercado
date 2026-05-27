"use client";

import { memo, useMemo } from "react";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import {
  BulejeComposedChart,
  BulejeHeatmap,
  BulejeStackedBar,
  BulejeWaterfallChart,
  BulejeComparisonOverlay,
  type HeatmapCell,
} from "@/components/ui-system/charts";
import { DashboardSection } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";

type Product = {
  id: number | string;
  name: string;
  category?: string;
  price: number;
  costPrice?: number;
  active?: boolean;
};
type OrderItem = { id: number | string; name?: string; price?: number; quantity: number };
type Order = {
  id: string | number;
  createdAt: string;
  total: number;
  status: string;
  items: OrderItem[];
  paymentMethod?: string;
};
type Sale = {
  id?: string | number;
  createdAt: string;
  total: number;
  items: Array<{ productId: number | string; name?: string; price?: number; quantity: number }>;
};

const CAT_LABEL: Record<string, string> = {
  frutas: "Frutas",
  verduras: "Verduras",
  carnes: "Carnes",
  lacteos: "Lácteos",
  bebidas: "Bebidas",
  limpieza: "Limpieza",
  abarrotes: "Abarrotes",
  panaderia: "Panadería",
  snacks: "Snacks",
  otros: "Otros",
};

const CAT_COLOR_KEYS = ["primary", "secondary", "tertiary", "quaternary", "accent", "amber", "purple", "info"] as const;

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}


export const VentasAdvancedCharts = memo(function VentasAdvancedCharts() {
  const { data } = useDashboardData();

  const products = (data?.products ?? []) as Product[];
  const orders = (data?.orders ?? []) as Order[];
  const sales = (data?.sales ?? []) as Sale[];

  // ── 1. PARETO 80/20 ─────────────────────────────────────────────────────
  // Top 15 productos por ingresos últimos 30d + curva acumulada %.
  const pareto = useMemo(() => {
     
    const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const byId = new Map<string | number, { name: string; ingresos: number }>();
    const priceCost = (id: string | number) => {
      const p = products.find((x) => x.id === id);
      return { price: p?.price ?? 0, name: p?.name ?? "—" };
    };
    orders
      .filter((o) => o.status === "entregado" && new Date(o.createdAt).getTime() >= last30)
      .forEach((o) =>
        o.items.forEach((it) => {
          const pc = priceCost(it.id);
          const cur = byId.get(it.id) ?? { name: it.name ?? pc.name, ingresos: 0 };
          cur.ingresos += it.quantity * (it.price ?? pc.price);
          byId.set(it.id, cur);
        }),
      );
    sales
      .filter((s) => new Date(s.createdAt).getTime() >= last30)
      .forEach((s) =>
        s.items.forEach((it) => {
          const pc = priceCost(it.productId);
          const cur = byId.get(it.productId) ?? { name: it.name ?? pc.name, ingresos: 0 };
          cur.ingresos += it.quantity * (it.price ?? pc.price);
          byId.set(it.productId, cur);
        }),
      );
    const sorted = Array.from(byId.values()).sort((a, b) => b.ingresos - a.ingresos);
    const grandTotal = sorted.reduce((s, r) => s + r.ingresos, 0);
    const top = sorted.slice(0, 15);
    let acc = 0;
    const rows = top.map((r) => {
      acc += r.ingresos;
      return {
        producto: r.name.length > 14 ? r.name.slice(0, 13) + "…" : r.name,
        ingresos: Math.round(r.ingresos),
        acumuladoPct: grandTotal > 0 ? Math.round((acc / grandTotal) * 1000) / 10 : 0,
      };
    });
    const pct80Idx = rows.findIndex((r) => r.acumuladoPct >= 80);
    const skusFor80 = pct80Idx >= 0 ? pct80Idx + 1 : rows.length;
    const skusTotal = sorted.length;
    const concentracion = grandTotal > 0 ? Math.round((top[0]?.ingresos ?? 0) / grandTotal * 100) : 0;
    return { rows, grandTotal, skusFor80, skusTotal, concentracion };
  }, [products, orders, sales]);

  // ── 2. HEATMAP hora × día (últimos 30d) ─────────────────────────────────
  const heatmap = useMemo(() => {
     
    const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const cells: HeatmapCell[] = [];
    const m = new Map<string, number>();
    const add = (iso: string, value: number) => {
      const d = new Date(iso);
      if (d.getTime() < last30) return;
      // Lunes = 0
      const day = (d.getDay() + 6) % 7;
      const hour = d.getHours();
      const k = `${day}-${hour}`;
      m.set(k, (m.get(k) ?? 0) + value);
    };
    orders.filter((o) => o.status === "entregado").forEach((o) => add(o.createdAt, Number(o.total ?? 0)));
    sales.forEach((s) => add(s.createdAt, Number(s.total ?? 0)));
    m.forEach((value, k) => {
      const [day, hour] = k.split("-").map(Number);
      cells.push({ day, hour, value: Math.round(value) });
    });
    const total = Array.from(m.values()).reduce((a, b) => a + b, 0);
    const top = Array.from(m.entries()).sort(([, a], [, b]) => b - a)[0];
    const bestDay = top ? ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][Number(top[0].split("-")[0])] : "—";
    const bestHour = top ? `${top[0].split("-")[1]}:00` : "—";
    const bestAmount = top ? Math.round(top[1]) : 0;
    return { cells, bestDay, bestHour, bestAmount, total: Math.round(total) };
  }, [orders, sales]);

  // ── 3. WATERFALL — descomposición del cambio semanal ────────────────────
  // Semana actual vs semana pasada: Δ = Δ volumen (# tickets) + Δ ticket prom.
  const waterfall = useMemo(() => {
     
    const now = Date.now();
    const wkA_start = now - 7 * 24 * 60 * 60 * 1000;
    const wkB_start = now - 14 * 24 * 60 * 60 * 1000;
    const inA = (iso: string) => new Date(iso).getTime() >= wkA_start;
    const inB = (iso: string) => {
      const t = new Date(iso).getTime();
      return t >= wkB_start && t < wkA_start;
    };
    const collect = (filter: (iso: string) => boolean) => {
      const oA = orders.filter((o) => o.status === "entregado" && filter(o.createdAt));
      const sA = sales.filter((s) => filter(s.createdAt));
      const total = oA.reduce((a, o) => a + Number(o.total ?? 0), 0) + sA.reduce((a, s) => a + Number(s.total ?? 0), 0);
      const tickets = oA.length + sA.length;
      const prom = tickets > 0 ? total / tickets : 0;
      return { total, tickets, prom };
    };
    const cur = collect(inA);
    const prev = collect(inB);
    // Descomposición: Δ volumen (a ticket prev) + Δ ticket prom (a volumen cur)
    const dVolumen = (cur.tickets - prev.tickets) * prev.prom;
    const dTicket = (cur.prom - prev.prom) * cur.tickets;
    const steps = [
      { label: "Sem. pasada", value: Math.round(prev.total), type: "baseline" as const },
      { label: "Δ Volumen", value: Math.round(dVolumen), type: (dVolumen >= 0 ? "positive" : "negative") as "positive" | "negative" },
      { label: "Δ Ticket prom.", value: Math.round(dTicket), type: (dTicket >= 0 ? "positive" : "negative") as "positive" | "negative" },
      { label: "Sem. actual", value: Math.round(cur.total), type: "total" as const },
    ];
    const delta = cur.total - prev.total;
    const deltaPct = prev.total > 0 ? Math.round((delta / prev.total) * 100) : 0;
    return { steps, cur, prev, delta: Math.round(delta), deltaPct };
  }, [orders, sales]);

  // ── 4. MIX POR CATEGORÍA — stacked 100% últimos 14d ─────────────────────
  const mix = useMemo(() => {
     
    const last14 = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const byDate = new Map<string, Map<string, number>>();
    const priceCost = (id: string | number) => {
      const p = products.find((x) => x.id === id);
      return {
        cat: p?.category ?? "otros",
        price: p?.price ?? 0,
      };
    };
    const add = (iso: string, id: string | number, qty: number, price?: number) => {
      if (new Date(iso).getTime() < last14) return;
      const pc = priceCost(id);
      const k = dayKey(iso);
      if (!byDate.has(k)) byDate.set(k, new Map());
      const inner = byDate.get(k)!;
      inner.set(pc.cat, (inner.get(pc.cat) ?? 0) + qty * (price ?? pc.price));
    };
    orders
      .filter((o) => o.status === "entregado")
      .forEach((o) => o.items.forEach((it) => add(o.createdAt, it.id, it.quantity, it.price)));
    sales.forEach((s) =>
      s.items.forEach((it) => add(s.createdAt, it.productId, it.quantity, it.price)),
    );
    // top 5 categorías global
    const catTotal = new Map<string, number>();
    byDate.forEach((inner) => inner.forEach((v, cat) => catTotal.set(cat, (catTotal.get(cat) ?? 0) + v)));
    const topCats = Array.from(catTotal.entries()).sort(([, a], [, b]) => b - a).slice(0, 5).map(([c]) => c);
    const days = Array.from(byDate.keys()).sort();
    const rows = days.map((k) => {
      const inner = byDate.get(k)!;
      const row: Record<string, string | number> = { day: new Date(k + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) };
      topCats.forEach((cat) => {
        row[cat] = Math.round(inner.get(cat) ?? 0);
      });
      return row;
    });
    const stacks = topCats.map((cat, i) => ({
      key: cat,
      label: CAT_LABEL[cat] ?? cat,
      color: CAT_COLOR_KEYS[i % CAT_COLOR_KEYS.length],
    }));
    // KPIs
    const grand = Array.from(catTotal.values()).reduce((a, b) => a + b, 0);
    const leader = Array.from(catTotal.entries()).sort(([, a], [, b]) => b - a)[0];
    const leaderName = leader ? CAT_LABEL[leader[0]] ?? leader[0] : "—";
    const leaderPct = leader && grand > 0 ? Math.round((leader[1] / grand) * 100) : 0;
    return { rows, stacks, grand: Math.round(grand), leaderName, leaderPct, topCatsCount: topCats.length };
  }, [products, orders, sales]);

  // ── 5. COMPARATIVA — esta semana vs semana pasada ───────────────────────
  const comparison = useMemo(() => {
     
    const now = Date.now();
    const DAYS_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const buckets = Array.from({ length: 7 }).map((_, i) => ({
      day: "",
      current: 0,
      previous: 0,
    }));
    const curStart = now - 7 * 24 * 60 * 60 * 1000;
    const prevStart = now - 14 * 24 * 60 * 60 * 1000;
    const bucket = (iso: string): { idx: number; isCurrent: boolean } | null => {
      const t = new Date(iso).getTime();
      if (t >= curStart) {
        const daysAgo = Math.floor((now - t) / (24 * 60 * 60 * 1000));
        if (daysAgo < 0 || daysAgo >= 7) return null;
        return { idx: 6 - daysAgo, isCurrent: true };
      }
      if (t >= prevStart && t < curStart) {
        const daysAgo = Math.floor((curStart - t) / (24 * 60 * 60 * 1000));
        if (daysAgo < 0 || daysAgo >= 7) return null;
        return { idx: 6 - daysAgo, isCurrent: false };
      }
      return null;
    };
    orders
      .filter((o) => o.status === "entregado")
      .forEach((o) => {
        const b = bucket(o.createdAt);
        if (!b) return;
        const target = b.isCurrent ? "current" : "previous";
        buckets[b.idx][target] += Number(o.total ?? 0);
      });
    sales.forEach((s) => {
      const b = bucket(s.createdAt);
      if (!b) return;
      const target = b.isCurrent ? "current" : "previous";
      buckets[b.idx][target] += Number(s.total ?? 0);
    });
    // Rellenar day labels (día de semana actual)
    const today = new Date();
    buckets.forEach((r, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      r.day = DAYS_LABEL[d.getDay()];
      r.current = Math.round(r.current);
      r.previous = Math.round(r.previous);
    });
    return buckets;
  }, [orders, sales]);

  const fmtPEN = (v: number) =>
    `S/ ${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;

  const sections: DraggableItem[] = [
    {
      id: "pareto-80-20",
      render: () => (
        <DashboardSection
          chartId="ventas.advanced.pareto-80-20"
          hasData={true}
          defaultVisible={false}
kicker="Análisis Pareto · rango activo"
          title="Top 15 productos y concentración 80/20"
          kpis={[
            { label: "Ingresos 30d", value: fmtPEN(pareto.grandTotal), tone: "primary" },
            { label: "SKUs para 80%", value: String(pareto.skusFor80), tone: "success" },
            { label: "SKUs totales", value: String(pareto.skusTotal), tone: "neutral" },
            {
              label: "Top-1 concentra",
              value: `${pareto.concentracion}%`,
              tone: pareto.concentracion >= 25 ? "warning" : "neutral",
            },
          ]}
        >
          <BulejeComposedChart
            data={pareto.rows}
            xKey="producto"
            bars={[{ key: "ingresos", label: "Ingresos S/", color: "primary", yAxis: "left" }]}
            lines={[
              { key: "acumuladoPct", label: "Acumulado %", color: "accent", yAxis: "right" },
            ]}
            leftAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
            rightAxisFormat={(v) => `${v}%`}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("acumulado")
                ? `${Number(v).toFixed(1)}%`
                : `S/ ${Number(v).toLocaleString("es-PE")}`
            }
            height={320}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
    {
      id: "heatmap-hora-dia",
      render: () => (
        <DashboardSection
          chartId="ventas.advanced.heatmap-hora-dia"
          hasData={true}
          defaultVisible={false}
kicker="Densidad de ventas · rango activo"
          title="Heatmap hora × día de la semana"
          kpis={[
            { label: "Total 30d", value: fmtPEN(heatmap.total), tone: "primary" },
            { label: "Mejor día", value: heatmap.bestDay, tone: "success" },
            { label: "Mejor hora", value: heatmap.bestHour, tone: "success" },
            { label: "Pico S/", value: fmtPEN(heatmap.bestAmount), tone: "primary" },
          ]}
        >
          <BulejeHeatmap
            data={heatmap.cells}
            valueFormat={(v) => `S/ ${v.toLocaleString("es-PE")}`}
          />
        </DashboardSection>
      ),
    },
    {
      id: "waterfall-semanal",
      render: () => (
        <DashboardSection
          chartId="ventas.advanced.waterfall-semanal"
          hasData={true}
          defaultVisible={false}
kicker="Descomposición semanal · qué movió las ventas"
          title="De la semana pasada a la actual"
          kpis={[
            { label: "Sem. pasada", value: fmtPEN(waterfall.prev.total), tone: "neutral" },
            { label: "Sem. actual", value: fmtPEN(waterfall.cur.total), tone: "primary" },
            {
              label: "Δ absoluto",
              value: `${waterfall.delta >= 0 ? "+" : ""}${fmtPEN(Math.abs(waterfall.delta))}`,
              tone: waterfall.delta >= 0 ? "success" : "warning",
            },
            {
              label: "Δ %",
              value: `${waterfall.deltaPct >= 0 ? "+" : ""}${waterfall.deltaPct}%`,
              tone: waterfall.deltaPct >= 0 ? "success" : "warning",
            },
          ]}
        >
          <BulejeWaterfallChart steps={waterfall.steps} currency="S/" height={280} />
        </DashboardSection>
      ),
    },
    {
      id: "mix-categoria",
      render: () => (
        <DashboardSection
          chartId="ventas.advanced.mix-categoria"
          hasData={true}
          defaultVisible={false}
kicker="Mix de categorías · rango activo"
          title="Composición diaria de ingresos por categoría"
          kpis={[
            { label: "Total 14d", value: fmtPEN(mix.grand), tone: "primary" },
            { label: "Líder", value: mix.leaderName, tone: "success" },
            {
              label: "Share líder",
              value: `${mix.leaderPct}%`,
              tone: mix.leaderPct >= 40 ? "warning" : "neutral",
            },
            { label: "Categorías", value: String(mix.topCatsCount), tone: "neutral" },
          ]}
        >
          {mix.rows.length > 0 ? (
            <BulejeStackedBar
              data={mix.rows}
              xKey="day"
              stacks={mix.stacks}
              yAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
              tooltipFormat={(v) => `S/ ${Number(v).toLocaleString("es-PE")}`}
              height={300}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">
              Sin datos en los rango activo.
            </div>
          )}
        </DashboardSection>
      ),
    },
    {
      id: "comparativa-semanal",
      render: () => (
        <DashboardSection
          chartId="ventas.advanced.comparativa-semanal"
          hasData={true}
          defaultVisible={false}
kicker="Comparativa · semana a semana"
          title="Esta semana vs semana pasada"
        >
          <BulejeComparisonOverlay
            data={comparison}
            xKey="day"
            currentKey="current"
            previousKey="previous"
            currentLabel="Esta semana"
            previousLabel="Semana pasada"
            yAxisFormat={(v) => `S/${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`}
            tooltipFormat={(v) => `S/ ${Number(v).toLocaleString("es-PE")}`}
            height={280}
          />
        </DashboardSection>
      ),
    },
  ];

  return <DraggableSections items={sections} storageKey="ventas-advanced-order" layout="grid" />;
});
