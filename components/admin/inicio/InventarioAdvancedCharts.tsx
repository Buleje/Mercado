"use client";

/**
 * InventarioAdvancedCharts — charts especializados del módulo Inventario.
 *
 * Complementa InventarioCharts con análisis avanzados:
 *  1. ABC Analysis (Pareto 80/20 por valor de inventario)
 *  2. Salud general (gauge) — % SKUs ok sobre total
 *  3. Rotación por categoría (días de cobertura promedio)
 *  4. Salidas acumuladas 14d (evolución) — stacked por top categorías
 *  5. Waterfall de inventario (Δ unidades)
 *  6. Comparativa salidas: esta semana vs pasada
 */

import React, { memo, useMemo, useState } from "react";
import { toast } from "sonner";
import { Calculator } from "@buleje/design-system/icons";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import {
  BulejeComposedChart,
  BulejeGaugeChart,
  BulejeStackedBar,
  BulejeWaterfallChart,
  BulejeComparisonOverlay,
  type WaterfallStep,
} from "@/components/ui-system/charts";
import { DashboardSection, MicroList } from "./_shared";
import { AltoPropioEnUnaColumna, Arriba, ColoresSerie } from "./InventarioCharts";
import { hayFilas, hayTendencia, modoRanking } from "@/lib/admin/inicio/hay-datos";
import { COLOR_CONCEPTO, cantidad, fechaCorta, numeroEje, soles, solesEje } from "@/lib/admin/inicio/formato-tablero";
import { DraggableSections, type DraggableItem } from "./DraggableSections";
import { formatNumber } from "@/lib/format";
import { enStockBajo } from "@/lib/inventario/stock-minimo";
import { useStockMinimoGlobal } from "@/lib/inventario/use-stock-minimo-global";

type Product = {
  id: number | string;
  name: string;
  category?: string;
  price: number;
  costPrice?: number;
  stock?: number;
  stockMin?: number;
  active?: boolean;
};
type Order = {
  id: string | number;
  createdAt: string;
  status: string;
  items: Array<{ id: number | string; quantity: number }>;
};
type Sale = {
  id?: string | number;
  createdAt: string;
  items: Array<{ productId: number | string; quantity: number }>;
};
type Purchase = {
  id: string | number;
  createdAt?: string;
  total: number;
  items?: Array<{ productId?: number | string; quantity?: number }>;
};

const CAT_LABEL: Record<string, string> = {
  "frutas-verduras": "Frutas y Verduras",
  abarrotes: "Abarrotes",
  carnes: "Carnes",
  lacteos: "Lácteos",
  bebidas: "Bebidas",
  limpieza: "Limpieza",
  frutas: "Frutas",
  verduras: "Verduras",
  panaderia: "Panadería",
  snacks: "Snacks",
  otros: "Otros",
};
const CAT_COLOR_KEYS = ["primary", "secondary", "tertiary", "quaternary", "accent", "amber", "purple", "info"] as const;

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayLabel(dk: string) {
  return fechaCorta(dk);
}

export const InventarioAdvancedCharts = memo(function InventarioAdvancedCharts() {
  // Un solo stock mínimo (09-10): el propio o el del negocio.
  const minimoGlobal = useStockMinimoGlobal();
  const { data } = useDashboardData();
  const [loadingEoq, setLoadingEoq] = useState(false);

  const products = (data?.products ?? []) as Product[];
  const orders = (data?.orders ?? []) as Order[];
  const sales = (data?.sales ?? []) as Sale[];
  const purchases = (data?.purchases ?? []) as Purchase[];

  async function handleEoqSuggest() {
    setLoadingEoq(true);
    try {
      const res = await fetch("/api/admin/inventory/eoq-suggest?topN=30");
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Error");
      }
      const s = json.summary;
      if (s.total === 0) {
        toast("Todavía no hay ventas", {
          description: "Hace falta historial de ventas para sugerir cuánto pedir.",
        });
      } else {
        toast.success("Cantidades sugeridas", {
          description: `${s.total} productos revisados · ${s.urgent} urgentes · compra sugerida ${soles(s.totalSuggestedAmount)}`,
          duration: 5000,
        });
      }
    } catch (err) {
      toast.error("No se pudo sugerir cuánto pedir", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoadingEoq(false);
    }
  }

  const active = useMemo(() => products.filter((p) => p.active), [products]);

  // ── 1. ABC ANALYSIS (Pareto 80/20 por valor) ─────────────────────────────
  const abc = useMemo(() => {
    const rows = active
      .map((p) => ({
        producto: p.name.length > 14 ? p.name.slice(0, 13) + "…" : p.name,
        valor: Math.round((p.stock ?? 0) * (p.costPrice ?? p.price * 0.7)),
      }))
      .sort((a, b) => b.valor - a.valor);
    const total = rows.reduce((s, r) => s + r.valor, 0);
    let acc = 0;
    const top = rows.slice(0, 15).map((r) => {
      acc += r.valor;
      return {
        ...r,
        acumuladoPct: total > 0 ? Math.round((acc / total) * 1000) / 10 : 0,
      };
    });
    const pct80 = top.findIndex((r) => r.acumuladoPct >= 80);
    const skusFor80 = pct80 >= 0 ? pct80 + 1 : top.length;
    // Clasifiación ABC sobre toda la data
    let accAll = 0;
    const classify = rows.map((r) => {
      accAll += r.valor;
      const pct = total > 0 ? accAll / total : 0;
      return { ...r, klass: pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C" };
    });
    const aCount = classify.filter((r) => r.klass === "A").length;
    const bCount = classify.filter((r) => r.klass === "B").length;
    const cCount = classify.filter((r) => r.klass === "C").length;
    return { top, total, skusFor80, aCount, bCount, cCount, totalSKUs: rows.length };
  }, [active]);

  // ── 2. SALUD GENERAL (Gauge) ─────────────────────────────────────────────
  const salud = useMemo(() => {
    if (active.length === 0) return { pct: 100, ok: 0, warn: 0, bad: 0, total: 0 };
    const bad = active.filter((p) => (p.stock ?? 0) <= 0).length;
    const warn = active.filter(
      (p) => (p.stock ?? 0) > 0 && enStockBajo(p, minimoGlobal),
    ).length;
    const ok = active.length - bad - warn;
    const pct = Math.round((ok / active.length) * 100);
    return { pct, ok, warn, bad, total: active.length };
  }, [active, minimoGlobal]);

  // ── 3. ROTACIÓN POR CATEGORÍA ────────────────────────────────────────────
  const rotacion = useMemo(() => {
    const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const catMap = new Map<
      string,
      { stock: number; unidadesSold: number; skus: number }
    >();
    active.forEach((p) => {
      const cat = p.category ?? "otros";
      const cur = catMap.get(cat) ?? { stock: 0, unidadesSold: 0, skus: 0 };
      cur.stock += p.stock ?? 0;
      cur.skus += 1;
      catMap.set(cat, cur);
    });
    const productToCat = new Map<string | number, string>(
      active.map((p) => [p.id, p.category ?? "otros"]),
    );
    orders
      .filter((o) => o.status === "entregado" && new Date(o.createdAt).getTime() >= last30)
      .forEach((o) =>
        o.items.forEach((it) => {
          const cat = productToCat.get(it.id);
          if (!cat) return;
          const cur = catMap.get(cat);
          if (cur) cur.unidadesSold += it.quantity;
        }),
      );
    sales
      .filter((s) => new Date(s.createdAt).getTime() >= last30)
      .forEach((s) =>
        s.items.forEach((it) => {
          const cat = productToCat.get(it.productId);
          if (!cat) return;
          const cur = catMap.get(cat);
          if (cur) cur.unidadesSold += it.quantity;
        }),
      );
    const rows = Array.from(catMap.entries())
      .map(([cat, v]) => {
        const dailyRate = v.unidadesSold / 30;
        const diasCobertura = dailyRate > 0 ? Math.round(v.stock / dailyRate) : 999;
        const rotacion = v.stock > 0 ? Math.round((v.unidadesSold / v.stock) * 100) / 100 : 0;
        return {
          categoria: CAT_LABEL[cat] ?? cat,
          rotacion,
          diasCobertura: Math.min(diasCobertura, 180),
          skus: v.skus,
        };
      })
      .filter((r) => r.skus > 0)
      .sort((a, b) => b.rotacion - a.rotacion)
      .slice(0, 8);
    const topRot = rows[0];
    const lowRot = [...rows].sort((a, b) => a.rotacion - b.rotacion)[0];
    return { rows, topRot, lowRot };
  }, [active, orders, sales]);

  // ── 4. SALIDAS POR CATEGORÍA (stacked 14d) ───────────────────────────────
  const salidasStacked = useMemo(() => {
    const last14 = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const productToCat = new Map<string | number, string>(
      active.map((p) => [p.id, p.category ?? "otros"]),
    );
    const byDate = new Map<string, Map<string, number>>();
    const add = (iso: string, id: string | number, qty: number) => {
      if (new Date(iso).getTime() < last14) return;
      const cat = productToCat.get(id);
      if (!cat) return;
      const k = dayKey(iso);
      if (!byDate.has(k)) byDate.set(k, new Map());
      const inner = byDate.get(k)!;
      inner.set(cat, (inner.get(cat) ?? 0) + qty);
    };
    orders
      .filter((o) => o.status === "entregado")
      .forEach((o) => o.items.forEach((it) => add(o.createdAt, it.id, it.quantity)));
    sales.forEach((s) =>
      s.items.forEach((it) => add(s.createdAt, it.productId, it.quantity)),
    );
    const catTotals = new Map<string, number>();
    byDate.forEach((inner) =>
      inner.forEach((v, c) => catTotals.set(c, (catTotals.get(c) ?? 0) + v)),
    );
    const topCats = Array.from(catTotals.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([c]) => c);
    const days = Array.from(byDate.keys()).sort();
    const rows = days.map((k) => {
      const inner = byDate.get(k)!;
      const row: Record<string, string | number> = { day: dayLabel(k) };
      topCats.forEach((c) => {
        row[c] = Math.round(inner.get(c) ?? 0);
      });
      return row;
    });
    const stacks = topCats.map((c, i) => ({
      key: c,
      label: CAT_LABEL[c] ?? c,
      color: CAT_COLOR_KEYS[i % CAT_COLOR_KEYS.length],
    }));
    const total = Array.from(catTotals.values()).reduce((a, b) => a + b, 0);
    return { rows, stacks, total, topCats };
  }, [active, orders, sales]);

  // ── 5. WATERFALL DE INVENTARIO (Δ unidades 30d) ──────────────────────────
  const waterfall = useMemo(() => {
    const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const stockActual = active.reduce((s, p) => s + (p.stock ?? 0), 0);
    const salidasOrders = orders
      .filter((o) => o.status === "entregado" && new Date(o.createdAt).getTime() >= last30)
      .reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
    const salidasSales = sales
      .filter((s) => new Date(s.createdAt).getTime() >= last30)
      .reduce((s, sa) => s + sa.items.reduce((a, i) => a + i.quantity, 0), 0);
    const entradasPurch = purchases
      .filter((p) => p.createdAt && new Date(p.createdAt).getTime() >= last30)
      .reduce((s, p) => s + (p.items?.reduce((a, i) => a + (i.quantity ?? 0), 0) ?? 0), 0);
    // Stock hace 30 días = stock actual + salidas - entradas
    const stockInicio = stockActual + salidasOrders + salidasSales - entradasPurch;
    const steps: WaterfallStep[] = [
      // Rótulos cortos: en media columna los largos se pisaban entre sí.
      { label: "Hace 30 d", value: Math.max(0, Math.round(stockInicio)), type: "baseline" },
      { label: "Compras", value: Math.round(entradasPurch), type: "positive" },
      { label: "Pedidos", value: -Math.round(salidasOrders), type: "negative" },
      { label: "Caja", value: -Math.round(salidasSales), type: "negative" },
      { label: "Hoy", value: Math.round(stockActual), type: "total" },
    ];
    const delta = stockActual - stockInicio;
    return { steps, stockActual: Math.round(stockActual), stockInicio: Math.round(stockInicio), delta: Math.round(delta), salidas: salidasOrders + salidasSales, entradas: entradasPurch };
  }, [active, orders, sales, purchases]);

  // ── HEATMAP categoría × día (30d) ─────────────────────────────────────────
  const heatmapCatDia = useMemo(() => {
    const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const productToCat = new Map<string | number, string>(
      active.map((p) => [p.id, p.category ?? "otros"]),
    );
    const catCount = new Map<string, number>();
    active.forEach((p) => {
      const c = p.category ?? "otros";
      catCount.set(c, (catCount.get(c) ?? 0) + 1);
    });
    const topCats = Array.from(catCount.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([c]) => c);
    const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    // map [catIdx, dayOfWeek] -> units
    const matrix = topCats.map(() => [0, 0, 0, 0, 0, 0, 0]);
    const add = (iso: string, id: string | number, qty: number) => {
      if (new Date(iso).getTime() < last30) return;
      const cat = productToCat.get(id);
      if (!cat) return;
      const catIdx = topCats.indexOf(cat);
      if (catIdx < 0) return;
      const d = new Date(iso);
      const dow = (d.getDay() + 6) % 7;
      matrix[catIdx][dow] += qty;
    };
    orders
      .filter((o) => o.status === "entregado")
      .forEach((o) => o.items.forEach((it) => add(o.createdAt, it.id, it.quantity)));
    sales.forEach((s) =>
      s.items.forEach((it) => add(s.createdAt, it.productId, it.quantity)),
    );
    const max = Math.max(1, ...matrix.flat());
    return {
      matrix,
      max,
      cats: topCats,
      days: DAYS,
      peakCat: matrix.reduce(
        (best, row, idx) => {
          const rowMax = Math.max(...row);
          return rowMax > best.value ? { idx, value: rowMax } : best;
        },
        { idx: -1, value: 0 },
      ),
    };
  }, [active, orders, sales]);

  // ── 6. COMPARATIVA SEMANAL SALIDAS ───────────────────────────────────────
  const comp = useMemo(() => {
    const now = Date.now();
    const DAYS_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const buckets = Array.from({ length: 7 }).map(() => ({ day: "", current: 0, previous: 0 }));
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
    const add = (iso: string, qty: number) => {
      const b = bucket(iso);
      if (!b) return;
      buckets[b.idx][b.isCurrent ? "current" : "previous"] += qty;
    };
    orders
      .filter((o) => o.status === "entregado")
      .forEach((o) => add(o.createdAt, o.items.reduce((a, i) => a + i.quantity, 0)));
    sales.forEach((s) => add(s.createdAt, s.items.reduce((a, i) => a + i.quantity, 0)));
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

  const fmtU = (v: number) => `${cantidad(v)} u`;

  // ¿Cada gráfico tiene algo que mostrar? (regla R2: sin información → oculto).
  const modoRotacion = modoRanking(rotacion.rows, "rotacion");
  const peakName =
    heatmapCatDia.peakCat.idx >= 0
      ? CAT_LABEL[heatmapCatDia.cats[heatmapCatDia.peakCat.idx]] ?? heatmapCatDia.cats[heatmapCatDia.peakCat.idx]
      : null;
  const saludColor = salud.pct >= 75 ? COLOR_CONCEPTO.ventas : COLOR_CONCEPTO.alerta;

  const sections: DraggableItem[] = [
    {
      id: "abc-analysis",
      span: "full",
      title: "Productos que concentran el valor",
      render: () => (
        <DashboardSection
          chartId="inventario.advanced.abc-analysis"
          hasData={modoRanking(abc.top, "valor") === "grafico"}
          defaultVisible={false}
          kicker="Análisis ABC · regla 80/20"
          title="Los productos que concentran tu plata"
          description="Barras: valor del stock de cada producto. Línea: cuánto del valor total suman hasta ese producto. Los de clase A son los que no pueden faltar ni sobrar."
          kpis={[
            { label: "Clase A", value: cantidad(abc.aCount), sub: "hacen el 80% del valor" },
            { label: "Clase B", value: cantidad(abc.bCount), sub: "el 15% siguiente" },
            { label: "Clase C", value: cantidad(abc.cCount), sub: "el último 5%" },
          ]}
        >
          {/* Doble eje a propósito: el Pareto necesita S/ por producto y % acumulado. */}
          <ColoresSerie colores={{ primary: COLOR_CONCEPTO.stock, accent: COLOR_CONCEPTO.ventas }}>
            <BulejeComposedChart
              data={abc.top}
              xKey="producto"
              bars={[{ key: "valor", label: "Valor del stock", color: "primary", yAxis: "left" }]}
              lines={[{ key: "acumuladoPct", label: "Acumulado", color: "accent", yAxis: "right" }]}
              leftAxisFormat={solesEje}
              rightAxisFormat={(v) => `${v}%`}
              tooltipFormat={(v, name) =>
                name?.toLowerCase().includes("acumulado") ? `${formatNumber(Number(v), 1)}%` : soles(Number(v))
              }
              height={300}
              minDataPoints={3}
            />
          </ColoresSerie>
        </DashboardSection>
      ),
    },
    {
      id: "salud-inventario",
      title: "Salud del inventario",
      render: () => (
        <DashboardSection
          chartId="inventario.advanced.salud-inventario"
          hasData={salud.total > 0}
          defaultVisible={false}
          kicker="Salud · productos sin problema"
          title="Cómo está tu stock hoy"
          rightSlot={
            <button
              type="button"
              onClick={handleEoqSuggest}
              disabled={loadingEoq}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 text-xs font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--text-primary)] disabled:opacity-60"
            >
              <Calculator className="h-3.5 w-3.5" aria-hidden />
              {loadingEoq ? "Calculando…" : "Cuánto pedir"}
            </button>
          }
          kpis={[
            { label: "Bien", value: cantidad(salud.ok), sub: "sobre su mínimo" },
            { label: "Bajo el mínimo", value: cantidad(salud.warn), tone: salud.warn > 0 ? "warning" : undefined },
            { label: "Agotados", value: cantidad(salud.bad), tone: salud.bad > 0 ? "warning" : undefined },
          ]}
        >
          <div className="flex items-center justify-center py-2">
            <BulejeGaugeChart
              value={salud.pct}
              max={100}
              color={saludColor}
              label="Productos sin problema"
              sublabel={salud.pct >= 90 ? "Excelente" : salud.pct >= 75 ? "Saludable" : salud.pct >= 50 ? "Atención" : "Crítico"}
              format="percentage"
              size={240}
            />
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "rotacion-categoria",
      title: "Rotación por categoría",
      render: () => (
        <DashboardSection
          chartId="inventario.advanced.rotacion-categoria"
          hasData={modoRotacion !== "oculto"}
          defaultVisible={false}
          kicker="Rotación · últimos 30 días"
          title="Qué categorías se mueven"
          description="Veces que vendiste el stock de la categoría en 30 días. En la ayuda de cada barra, para cuántos días alcanza."
          kpis={[
            {
              label: "Rota más",
              value: rotacion.topRot?.categoria ?? null,
              sub: rotacion.topRot ? `${formatNumber(rotacion.topRot.rotacion, 2)}× · ${rotacion.topRot.diasCobertura} días` : undefined,
            },
            {
              label: "Rota menos",
              value: rotacion.lowRot?.categoria ?? null,
              sub: rotacion.lowRot ? `${formatNumber(rotacion.lowRot.rotacion, 2)}×` : undefined,
              tone: "warning",
            },
          ]}
        >
          {modoRotacion === "lista" ? (
            <Arriba><MicroList
              items={rotacion.rows
                .filter((r) => r.rotacion > 0)
                .map((r) => ({ name: r.categoria, value: r.rotacion, label: `${formatNumber(r.rotacion, 2)}×`, sublabel: `alcanza ${r.diasCobertura} días` }))}
              barColor={COLOR_CONCEPTO.ventas}
            /></Arriba>
          ) : (
            <ColoresSerie colores={{ primary: COLOR_CONCEPTO.ventas }}>
              <BulejeComposedChart
                data={rotacion.rows}
                xKey="categoria"
                bars={[{ key: "rotacion", label: "Rotación", color: "primary", yAxis: "left" }]}
                leftAxisFormat={(v) => `${v}×`}
                tooltipFormat={(v) => `${formatNumber(Number(v), 2)}×`}
                tooltipExtras={(e) => <span>Alcanza {String(e.diasCobertura)} días</span>}
                showLegend={false}
                height={280}
                minDataPoints={1}
              />
            </ColoresSerie>
          )}
        </DashboardSection>
      ),
    },
    {
      id: "salidas-stacked",
      span: "full",
      title: "Vendido por categoría y día",
      render: () => (
        <DashboardSection
          chartId="inventario.advanced.salidas-stacked"
          hasData={hayFilas(salidasStacked.rows, 2)}
          defaultVisible={false}
          kicker="Salidas · últimos 14 días"
          title="Qué categorías vendes cada día"
          kpis={[
            { label: "Vendidas", value: fmtU(salidasStacked.total), sub: `en ${salidasStacked.rows.length} días con venta` },
            { label: "Categoría líder", value: CAT_LABEL[salidasStacked.topCats[0] ?? ""] ?? salidasStacked.topCats[0] ?? null },
          ]}
        >
          <BulejeStackedBar
            data={salidasStacked.rows}
            xKey="day"
            stacks={salidasStacked.stacks}
            yAxisFormat={numeroEje}
            tooltipFormat={(v) => fmtU(Number(v))}
            height={280}
          />
        </DashboardSection>
      ),
    },
    {
      id: "waterfall-inventario",
      title: "De stock inicial a stock actual",
      render: () => (
        <DashboardSection
          chartId="inventario.advanced.waterfall-inventario"
          hasData={waterfall.salidas + waterfall.entradas > 0}
          defaultVisible={false}
          kicker="Unidades · últimos 30 días"
          title="Cómo cambió tu stock"
          kpis={[
            { label: "Hace 30 días", value: fmtU(waterfall.stockInicio) },
            { label: "Hoy", value: fmtU(waterfall.stockActual), delta: waterfall.stockInicio > 0 ? Math.round((waterfall.delta / waterfall.stockInicio) * 100) : null, deltaPolarity: "neutral" },
          ]}
        >
          <ColoresSerie colores={{ primary: COLOR_CONCEPTO.stock, accent: COLOR_CONCEPTO.compras }}>
            <BulejeWaterfallChart steps={waterfall.steps} formatValue={(v) => `${cantidad(v)} u`} height={260} />
          </ColoresSerie>
        </DashboardSection>
      ),
    },
    {
      id: "heatmap-cat-dia",
      span: "full",
      title: "Cuándo se vende cada categoría",
      render: () => (
        <DashboardSection
          chartId="inventario.advanced.heatmap-cat-dia"
          hasData={heatmapCatDia.peakCat.value > 0}
          defaultVisible={false}
          kicker="Categoría × día de la semana · 30 días"
          title="Qué día se vende cada categoría"
          kpis={[
            { label: "Categoría pico", value: peakName },
            { label: "Su mejor día", value: heatmapCatDia.peakCat.value > 0 ? fmtU(heatmapCatDia.peakCat.value) : null },
          ]}
        >
          <div className="overflow-x-auto">
            <div className="min-w-[32rem]">
              <div className="grid" style={{ gridTemplateColumns: "7.5rem repeat(7, 1fr)" }}>
                <div />
                {heatmapCatDia.days.map((d) => (
                  <div key={d} className="pb-2 text-center text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    {d}
                  </div>
                ))}
                {heatmapCatDia.cats.map((cat, catIdx) => (
                  <React.Fragment key={cat}>
                    <div className="flex items-center truncate py-1 pr-3 text-xs font-semibold text-[var(--text-secondary)]">{CAT_LABEL[cat] ?? cat}</div>
                    {heatmapCatDia.matrix[catIdx].map((v, dayIdx) => {
                      const intensity = v / heatmapCatDia.max;
                      return (
                        <div
                          key={dayIdx}
                          className="relative m-0.5 flex min-h-8 items-center justify-center rounded-md text-xs font-bold tabular-nums"
                          style={{
                            background: v === 0 ? "var(--surface-sunken)" : `color-mix(in srgb, ${COLOR_CONCEPTO.ventas} ${Math.max(12, intensity * 100)}%, transparent)`,
                            color: intensity > 0.55 ? "var(--text-inverse)" : "var(--text-secondary)",
                          }}
                          title={`${CAT_LABEL[cat] ?? cat} · ${heatmapCatDia.days[dayIdx]}: ${cantidad(v)} u`}
                        >
                          {v > 0 ? cantidad(v) : ""}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-end gap-2 text-xs text-[var(--text-tertiary)]" aria-hidden>
                <span>Menos</span>
                {[0.15, 0.35, 0.6, 0.85, 1].map((i) => (
                  <div key={i} className="h-4 w-4 rounded" style={{ background: `color-mix(in srgb, ${COLOR_CONCEPTO.ventas} ${i * 100}%, transparent)` }} />
                ))}
                <span>Más</span>
              </div>
            </div>
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "comparativa-semana",
      title: "Esta semana vs la pasada",
      render: () => (
        <DashboardSection
          chartId="inventario.advanced.comparativa-semana"
          hasData={hayTendencia(comp, ["current", "previous"])}
          defaultVisible={false}
          kicker="Unidades vendidas · 7 días vs 7 anteriores"
          title="Esta semana vs la pasada"
        >
          <ColoresSerie colores={{ primary: COLOR_CONCEPTO.ventas, tertiary: COLOR_CONCEPTO.anterior }}>
            <BulejeComparisonOverlay
              data={comp}
              xKey="day"
              currentKey="current"
              previousKey="previous"
              currentLabel="Esta semana"
              previousLabel="Semana pasada"
              yAxisFormat={numeroEje}
              tooltipFormat={(v) => fmtU(Number(v))}
              height={260}
            />
          </ColoresSerie>
        </DashboardSection>
      ),
    },
  ];

  return (
    <AltoPropioEnUnaColumna>
      <DraggableSections items={sections} storageKey="inventario-advanced-order" layout="grid" gap={4} minColumnWidth="22rem" />
    </AltoPropioEnUnaColumna>
  );
});
