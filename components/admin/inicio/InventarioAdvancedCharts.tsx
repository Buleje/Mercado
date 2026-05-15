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
import { DashboardSection } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";

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
  return new Date(dk + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

export const InventarioAdvancedCharts = memo(function InventarioAdvancedCharts() {
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
        toast("Sin data de demanda", {
          description: "Necesitas historial de ventas para calcular EOQ.",
        });
      } else {
        toast.success("EOQ calculado", {
          description: `${s.total} SKUs analizados · ${s.urgent} urgentes · monto sugerido S/ ${s.totalSuggestedAmount.toLocaleString("es-PE")}`,
          duration: 5000,
        });
      }
    } catch (err) {
      toast.error("No se pudo calcular EOQ", {
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
      (p) => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= (p.stockMin ?? 5),
    ).length;
    const ok = active.length - bad - warn;
    const pct = Math.round((ok / active.length) * 100);
    return { pct, ok, warn, bad, total: active.length };
  }, [active]);

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
      .filter((o) => o.status !== "cancelado" && new Date(o.createdAt).getTime() >= last30)
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
      .filter((o) => o.status !== "cancelado")
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
      .filter((o) => o.status !== "cancelado" && new Date(o.createdAt).getTime() >= last30)
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
      { label: "Stock hace 30d", value: Math.max(0, Math.round(stockInicio)), type: "baseline" },
      { label: "Entradas (compras)", value: Math.round(entradasPurch), type: "positive" },
      { label: "Salidas (pedidos)", value: -Math.round(salidasOrders), type: "negative" },
      { label: "Salidas (POS)", value: -Math.round(salidasSales), type: "negative" },
      { label: "Stock actual", value: Math.round(stockActual), type: "total" },
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
      .filter((o) => o.status !== "cancelado")
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
      .filter((o) => o.status !== "cancelado")
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

  const fmtU = (v: number) => `${v.toLocaleString("es-PE")} u`;

  const sections: DraggableItem[] = [
    {
      id: "abc-analysis",
      span: "full",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="ABC analysis · concentración del valor"
          title="Top 15 SKUs y curva 80/20"
          kpis={[
            { label: "Valor total", value: `S/ ${abc.total.toLocaleString("es-PE")}`, tone: "primary" },
            { label: "SKUs clase A", value: String(abc.aCount), tone: "success" },
            { label: "SKUs clase B", value: String(abc.bCount), tone: "primary" },
            { label: "SKUs clase C", value: String(abc.cCount), tone: "neutral" },
          ]}
        >
          <BulejeComposedChart
            data={abc.top}
            xKey="producto"
            bars={[{ key: "valor", label: "Valor S/", color: "primary", yAxis: "left" }]}
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
      id: "salud-inventario",
      render: () => (
        <DashboardSection
          chartId="inventario.advanced.salud-inventario"
          hasData={true}
          defaultVisible={false}
kicker="Salud general · % SKUs sin problema"
          title="Estado actual del inventario"
          rightSlot={
            <button
              type="button"
              onClick={handleEoqSuggest}
              disabled={loadingEoq}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold bg-[var(--surface-sunken)] text-[var(--text-primary)] border border-[var(--rule-base)] hover:border-primary hover:text-primary transition-all disabled:opacity-50"
            >
              <Calculator className="h-3.5 w-3.5" />
              {loadingEoq ? "Calculando..." : "Sugerencias EOQ"}
            </button>
          }
          kpis={[
            {
              label: "SKUs ok",
              value: String(salud.ok),
              tone: "success",
            },
            {
              label: "SKUs en alerta",
              value: String(salud.warn),
              tone: salud.warn > 0 ? "warning" : "success",
            },
            {
              label: "Agotados",
              value: String(salud.bad),
              tone: salud.bad > 0 ? "warning" : "success",
            },
            { label: "Total activos", value: String(salud.total), tone: "neutral" },
          ]}
        >
          <div className="flex items-center justify-center py-2">
            <BulejeGaugeChart
              value={salud.pct}
              max={100}
              label="Salud del inventario"
              sublabel={
                salud.pct >= 90
                  ? "Excelente"
                  : salud.pct >= 75
                    ? "Saludable"
                    : salud.pct >= 50
                      ? "Atención"
                      : "Crítico"
              }
              format="percentage"
              size={260}
            />
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "rotacion-categoria",
      render: () => (
        <DashboardSection
          chartId="inventario.advanced.rotacion-categoria"
          hasData={true}
          defaultVisible={false}
kicker="Rotación · rango activo"
          title="Velocidad y cobertura por categoría"
          kpis={[
            {
              label: "Cat más rotación",
              value: rotacion.topRot?.categoria ?? "—",
              tone: "success",
            },
            {
              label: "Rotación top",
              value: rotacion.topRot ? `${rotacion.topRot.rotacion}x` : "—",
              tone: "primary",
            },
            {
              label: "Cat menos rotación",
              value: rotacion.lowRot?.categoria ?? "—",
              tone: "warning",
            },
            {
              label: "Cobertura baja",
              value: rotacion.lowRot ? `${rotacion.lowRot.diasCobertura}d` : "—",
              tone: "neutral",
            },
          ]}
        >
          <BulejeComposedChart
            data={rotacion.rows}
            xKey="categoria"
            bars={[{ key: "rotacion", label: "Rotación (x)", color: "primary", yAxis: "left" }]}
            lines={[
              { key: "diasCobertura", label: "Días cobertura", color: "accent", yAxis: "right" },
            ]}
            leftAxisFormat={(v) => `${v}x`}
            rightAxisFormat={(v) => `${v}d`}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("días")
                ? `${v} días`
                : `${Number(v).toFixed(2)}x`
            }
            height={300}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
    {
      id: "salidas-stacked",
      span: "full",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="Salidas por categoría · rango activo"
          title="Composición diaria de unidades salidas"
          kpis={[
            { label: "Días con data", value: String(salidasStacked.rows.length), tone: "neutral" },
            {
              label: "Salidas totales",
              value: fmtU(salidasStacked.total),
              tone: "primary",
            },
            {
              label: "Cat líder",
              value: CAT_LABEL[salidasStacked.topCats[0] ?? ""] ?? salidasStacked.topCats[0] ?? "—",
              tone: "success",
            },
            {
              label: "Categorías",
              value: String(salidasStacked.topCats.length),
              tone: "neutral",
            },
          ]}
        >
          {salidasStacked.rows.length > 0 ? (
            <BulejeStackedBar
              data={salidasStacked.rows}
              xKey="day"
              stacks={salidasStacked.stacks}
              yAxisFormat={(v) => v.toString()}
              tooltipFormat={(v) => fmtU(Number(v))}
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
      id: "waterfall-inventario",
      render: () => (
        <DashboardSection
          chartId="inventario.advanced.waterfall-inventario"
          hasData={true}
          defaultVisible={false}
kicker="Δ Inventario · rango activo"
          title="De stock inicio a stock actual"
          kpis={[
            { label: "Stock inicio", value: fmtU(waterfall.stockInicio), tone: "neutral" },
            { label: "Entradas", value: fmtU(waterfall.entradas), tone: "success" },
            { label: "Salidas", value: fmtU(waterfall.salidas), tone: "warning" },
            {
              label: "Stock actual",
              value: fmtU(waterfall.stockActual),
              tone: waterfall.delta >= 0 ? "success" : "warning",
            },
          ]}
        >
          <BulejeWaterfallChart steps={waterfall.steps} currency="u" height={280} />
        </DashboardSection>
      ),
    },
    {
      id: "heatmap-cat-dia",
      span: "full",
      render: () => {
        const peakName = heatmapCatDia.peakCat.idx >= 0
          ? CAT_LABEL[heatmapCatDia.cats[heatmapCatDia.peakCat.idx]] ?? heatmapCatDia.cats[heatmapCatDia.peakCat.idx]
          : "—";
        return (
          <DashboardSection
          hideHeader
            kicker="Heatmap · categoría × día · rango activo"
            title="Cuándo rota cada categoría"
            kpis={[
              { label: "Categorías", value: String(heatmapCatDia.cats.length), tone: "neutral" },
              { label: "Pico categoría", value: peakName, tone: "success" },
              { label: "Pico unidades", value: fmtU(heatmapCatDia.peakCat.value), tone: "primary" },
              { label: "Total SKUs", value: String(active.length), tone: "neutral" },
            ]}
          >
            {heatmapCatDia.cats.length > 0 ? (
              <div className="overflow-x-auto">
                <div className="min-w-[520px]">
                  <div className="grid" style={{ gridTemplateColumns: "120px repeat(7, 1fr)" }}>
                    <div />
                    {heatmapCatDia.days.map((d) => (
                      <div
                        key={d}
                        className="text-center text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] pb-2"
                      >
                        {d}
                      </div>
                    ))}
                    {heatmapCatDia.cats.map((cat, catIdx) => (
                      <React.Fragment key={cat}>
                        <div className="text-xs font-semibold text-[var(--text-secondary)] pr-3 py-1 flex items-center truncate">
                          {CAT_LABEL[cat] ?? cat}
                        </div>
                        {heatmapCatDia.matrix[catIdx].map((v, dayIdx) => {
                          const intensity = v / heatmapCatDia.max;
                          const bg =
                            v === 0
                              ? "var(--surface-sunken)"
                              : `color-mix(in srgb, var(--accent) ${Math.max(10, intensity * 100)}%, transparent)`;
                          return (
                            <div
                              key={dayIdx}
                              className="relative m-0.5 rounded-md flex items-center justify-center text-[length:var(--ts-2xs)] font-bold transition-transform hover:scale-105 cursor-default"
                              style={{
                                background: bg,
                                color: intensity > 0.55 ? "#fff" : "var(--text-secondary)",
                                minHeight: 32,
                              }}
                              title={`${CAT_LABEL[cat] ?? cat} · ${heatmapCatDia.days[dayIdx]}: ${v} u`}
                            >
                              {v > 0 ? v : ""}
                            </div>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-3 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    <span>Menos</span>
                    {[0.15, 0.35, 0.6, 0.85, 1].map((i) => (
                      <div
                        key={i}
                        className="w-4 h-4 rounded"
                        style={{
                          background: `color-mix(in srgb, var(--accent) ${i * 100}%, transparent)`,
                        }}
                      />
                    ))}
                    <span>Más</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">
                Sin datos en los rango activo.
              </div>
            )}
          </DashboardSection>
        );
      },
    },
    {
      id: "comparativa-semana",
      render: () => (
        <DashboardSection
          chartId="inventario.advanced.comparativa-semana"
          hasData={true}
          defaultVisible={false}
kicker="Comparativa · salidas semana a semana"
          title="Unidades salidas · esta semana vs pasada"
        >
          <BulejeComparisonOverlay
            data={comp}
            xKey="day"
            currentKey="current"
            previousKey="previous"
            currentLabel="Esta semana"
            previousLabel="Semana pasada"
            yAxisFormat={(v) => v.toString()}
            tooltipFormat={(v) => `${v} u`}
            height={280}
          />
        </DashboardSection>
      ),
    },
  ];

  return <DraggableSections items={sections} storageKey="inventario-advanced-order" layout="column" gap={4} />;
});
