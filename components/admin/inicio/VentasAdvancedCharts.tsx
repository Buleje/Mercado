"use client";

/**
 * VentasAdvancedCharts — gráficos especializados de Inicio › Ventas (ocultos por
 * defecto; se prenden desde «Gráficos»).
 *
 * 2026-10-09 (Brandon: «ocultar gráficos que no tienen ninguna información…
 * mejóralos con buen diseño y formato»): cada uno decide `hasData` con el helper
 * único (antes `true` fijo: un Pareto vacío con «S/ 0» se podía prender), títulos
 * como la pregunta del dueño, períodos honestos (eran «rango activo» pero cuentan
 * 30 días, 14 días o la semana), plata con `soles`/`solesEje` y colores fijos por
 * concepto (`COLOR_CONCEPTO`, no la rotación `--section-*` de la grilla).
 */

import { memo, useMemo, type CSSProperties } from "react";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import {
  BulejeHeatmap,
  BulejeStackedBar,
  BulejeWaterfallChart,
  BulejeComparisonOverlay,
  type HeatmapCell,
} from "@/components/ui-system/charts";
import { hayDatosEnSerie, modoRanking } from "@/lib/admin/inicio/hay-datos";
import {
  COLOR_CONCEPTO,
  cantidad,
  fechaCorta,
  porcentaje,
  soles,
  solesEje,
} from "@/lib/admin/inicio/formato-tablero";
import { DashboardSection, MicroList } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";
import { ConTonoVentas } from "./VentasBarras";

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

const CAT_COLOR_KEYS = [
  "primary",
  "secondary",
  "tertiary",
  "quaternary",
  "accent",
  "amber",
  "purple",
  "info",
] as const;

/**
 * Los primitivos leen `--section-*`/`--accent`, que la grilla rota por posición.
 * Fijarlos en el contenedor del gráfico deja el mismo color para lo mismo en
 * todas las pestañas: ventas teal, período anterior gris, utilidad/total tinta.
 */
const vars = (v: Record<string, string>) => v as CSSProperties;
const COLORES_COMPARATIVA = vars({
  "--section-primary": COLOR_CONCEPTO.ventas,
  "--section-tertiary": COLOR_CONCEPTO.anterior,
});
const COLORES_CASCADA = vars({
  "--section-primary": COLOR_CONCEPTO.utilidad,
  "--section-accent": COLOR_CONCEPTO.ventas,
});
const COLORES_CALOR = vars({ "--accent": COLOR_CONCEPTO.ventas });
const COLORES_CATEGORIAS = vars({
  "--section-primary": COLOR_CONCEPTO.ventas,
  "--section-secondary": "var(--data-6)",
  "--section-tertiary": "var(--data-8)",
  "--section-accent": "var(--data-2)",
});
const DIA_COMPLETO = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

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
        nombre: r.name,
        ingresos: Math.round(r.ingresos),
        acumuladoPct: grandTotal > 0 ? Math.round((acc / grandTotal) * 1000) / 10 : 0,
      };
    });
    const pct80Idx = rows.findIndex((r) => r.acumuladoPct >= 80);
    const skusFor80 = pct80Idx >= 0 ? pct80Idx + 1 : rows.length;
    const skusTotal = sorted.length;
    const concentracion =
      grandTotal > 0 ? Math.round(((top[0]?.ingresos ?? 0) / grandTotal) * 100) : 0;
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
    orders
      .filter((o) => o.status === "entregado")
      .forEach((o) => add(o.createdAt, Number(o.total ?? 0)));
    sales.forEach((s) => add(s.createdAt, Number(s.total ?? 0)));
    m.forEach((value, k) => {
      const [day, hour] = k.split("-").map(Number);
      cells.push({ day, hour, value: Math.round(value) });
    });
    const total = Array.from(m.values()).reduce((a, b) => a + b, 0);
    const top = Array.from(m.entries()).sort(([, a], [, b]) => b - a)[0];
    const bestDay = top ? DIA_COMPLETO[Number(top[0].split("-")[0])] : "—";
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
      const total =
        oA.reduce((a, o) => a + Number(o.total ?? 0), 0) +
        sA.reduce((a, s) => a + Number(s.total ?? 0), 0);
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
      { label: "Pasada", value: Math.round(prev.total), type: "baseline" as const },
      {
        label: "Cantidad",
        value: Math.round(dVolumen),
        type: (dVolumen >= 0 ? "positive" : "negative") as "positive" | "negative",
      },
      {
        label: "Ticket",
        value: Math.round(dTicket),
        type: (dTicket >= 0 ? "positive" : "negative") as "positive" | "negative",
      },
      { label: "Actual", value: Math.round(cur.total), type: "total" as const },
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
    byDate.forEach((inner) =>
      inner.forEach((v, cat) => catTotal.set(cat, (catTotal.get(cat) ?? 0) + v)),
    );
    const topCats = Array.from(catTotal.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([c]) => c);
    const days = Array.from(byDate.keys()).sort();
    const rows = days.map((k) => {
      const inner = byDate.get(k)!;
      const row: Record<string, string | number> = { day: fechaCorta(k) };
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
    const leaderName = leader ? (CAT_LABEL[leader[0]] ?? leader[0]) : "—";
    const leaderPct = leader && grand > 0 ? Math.round((leader[1] / grand) * 100) : 0;
    return {
      rows,
      stacks,
      grand: Math.round(grand),
      leaderName,
      leaderPct,
      topCatsCount: topCats.length,
    };
  }, [products, orders, sales]);

  // ── 5. COMPARATIVA — esta semana vs semana pasada ───────────────────────
  const comparison = useMemo(() => {
    const now = Date.now();
    const DAYS_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const buckets = Array.from({ length: 7 }).map((_, _i) => ({
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

  // ── ¿Qué se muestra? (R2: sin información → oculto hasta que haya dato) ──
  const modoPareto = modoRanking(pareto.rows, "ingresos");
  const celdasConVenta = heatmap.cells.filter((c) => c.value > 0).length;
  const hayCascada = waterfall.prev.total > 0 && waterfall.cur.total > 0;
  const hayMix = mix.grand > 0 && mix.rows.length >= 2;
  const hayComparativa = hayDatosEnSerie(comparison, ["current", "previous"], { minPuntos: 2 });
  // Pareto como lista: el nombre entero se lee; en barras verticales se cortaba a 13 letras.
  const itemsPareto = pareto.rows.slice(0, 10).map((r, i) => ({
    name: r.nombre,
    value: r.ingresos,
    label: soles(r.ingresos),
    sublabel: `acumulado ${porcentaje(r.acumuladoPct)}`,
    color: i < pareto.skusFor80 ? COLOR_CONCEPTO.ventas : COLOR_CONCEPTO.anterior,
  }));

  const sections: DraggableItem[] = [
    {
      id: "pareto-80-20",
      render: () => (
        <ConTonoVentas>
          <DashboardSection
            chartId="ventas.advanced.pareto-80-20"
            hasData={modoPareto !== "oculto"}
            defaultVisible={false}
            kicker="Últimos 30 días · regla 80/20"
            title="¿Qué productos te dejan más plata?"
            description="Tus productos ordenados por lo vendido. Los de color teal son los pocos que juntan el 80 % de tus ventas: que nunca te falten."
            kpis={[
              { label: "Vendido en 30 días", value: soles(pareto.grandTotal), tone: "primary" },
              {
                label: "Hacen el 80 %",
                value: `${cantidad(pareto.skusFor80)} de ${cantidad(pareto.skusTotal)}`,
                hint: "Cuántos productos juntan el 80 % de lo que vendiste.",
              },
              {
                label: "El primero se lleva",
                value: porcentaje(pareto.concentracion),
                tone: pareto.concentracion >= 25 ? "warning" : "neutral",
                hint: "Parte de tus ventas que viene de un solo producto. Más de 25 % = dependes mucho de él.",
              },
            ]}
          >
            <MicroList items={itemsPareto} showRank />
          </DashboardSection>
        </ConTonoVentas>
      ),
    },
    {
      id: "heatmap-hora-dia",
      render: () => (
        <ConTonoVentas>
          <DashboardSection
            chartId="ventas.advanced.heatmap-hora-dia"
            hasData={celdasConVenta >= 2}
            defaultVisible={false}
            kicker="Últimos 30 días"
            title="¿Qué día y a qué hora vendes más?"
            description="Cada cuadro es un día de la semana a una hora: más oscuro, más vendiste. Sirve para decidir turnos y cuándo reponer."
            kpis={[
              {
                label: "Mejor momento",
                value: `${heatmap.bestDay} ${heatmap.bestHour}`,
                tone: "primary",
                sub: soles(heatmap.bestAmount),
              },
              { label: "Vendido en 30 días", value: soles(heatmap.total) },
            ]}
          >
            <div style={COLORES_CALOR}>
              <BulejeHeatmap data={heatmap.cells} valueFormat={(v) => soles(v)} />
            </div>
          </DashboardSection>
        </ConTonoVentas>
      ),
    },
    {
      id: "waterfall-semanal",
      render: () => (
        <ConTonoVentas>
          <DashboardSection
            chartId="ventas.advanced.waterfall-semanal"
            hasData={hayCascada}
            defaultVisible={false}
            kicker="Esta semana vs la pasada"
            title="¿Por qué cambiaron tus ventas?"
            description="De la semana pasada a esta, en dos pasos: «Cantidad» es lo que cambió por vender más o menos veces; «Ticket» es por vender más o menos en cada venta."
            kpis={[
              {
                label: "Esta semana",
                value: soles(waterfall.cur.total),
                tone: "primary",
                delta: waterfall.deltaPct,
                deltaLabel: "vs semana pasada",
              },
              { label: "Semana pasada", value: soles(waterfall.prev.total) },
            ]}
          >
            <div style={COLORES_CASCADA}>
              <BulejeWaterfallChart
                steps={waterfall.steps}
                currency="S/"
                formatValue={(v) => solesEje(v)}
                height={280}
              />
            </div>
          </DashboardSection>
        </ConTonoVentas>
      ),
    },
    {
      id: "mix-categoria",
      render: () => (
        <ConTonoVentas>
          <DashboardSection
            chartId="ventas.advanced.mix-categoria"
            hasData={hayMix}
            defaultVisible={false}
            kicker="Últimos 14 días"
            title="¿Qué categorías vendes cada día?"
            description="Lo vendido por día, partido en tus 5 categorías principales."
            kpis={[
              {
                label: "Categoría líder",
                value: mix.grand > 0 ? mix.leaderName : null,
                tone: "primary",
                sub: `${porcentaje(mix.leaderPct)} de lo vendido`,
              },
              { label: "Vendido en 14 días", value: soles(mix.grand) },
            ]}
          >
            <div style={COLORES_CATEGORIAS}>
              <BulejeStackedBar
                data={mix.rows}
                xKey="day"
                stacks={mix.stacks}
                yAxisFormat={(v) => solesEje(v)}
                tooltipFormat={(v) => soles(v)}
                height={300}
              />
            </div>
          </DashboardSection>
        </ConTonoVentas>
      ),
    },
    {
      id: "comparativa-semanal",
      render: () => (
        <ConTonoVentas>
          <DashboardSection
            chartId="ventas.advanced.comparativa-semanal"
            hasData={hayComparativa}
            defaultVisible={false}
            kicker="Últimos 14 días"
            title="Esta semana vs la pasada"
            description="Día por día: la línea llena es esta semana; la punteada, la pasada."
          >
            <div style={COLORES_COMPARATIVA}>
              <BulejeComparisonOverlay
                data={comparison}
                xKey="day"
                currentKey="current"
                previousKey="previous"
                currentLabel="Esta semana"
                previousLabel="Semana pasada"
                yAxisFormat={(v) => solesEje(v)}
                tooltipFormat={(v) => soles(v)}
                height={280}
              />
            </div>
          </DashboardSection>
        </ConTonoVentas>
      ),
    },
  ];

  return <DraggableSections items={sections} storageKey="ventas-advanced-order" layout="grid" />;
});
