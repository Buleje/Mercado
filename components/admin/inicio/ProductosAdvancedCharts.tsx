"use client";

/**
 * ProductosAdvancedCharts — charts especializados del módulo Productos.
 *
 * 1. Margen × Volumen (BCG-like quadrant matrix)
 * 2. Rotación vs margen por categoría (Composed)
 * 3. Evolución top-5 productos (stacked 14d)
 * 4. Comparativa unidades actual vs semana previa (ComparisonOverlay)
 * 5. Heatmap categoría × día (salidas 30d)
 * 6. Margen histórico por categoría (Composed: margen% + volumen)
 */

import React, { memo, useMemo } from "react";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import {
  BulejeComposedChart,
  BulejeStackedBar,
  BulejeComparisonOverlay,
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
  active?: boolean;
};
type Order = {
  id: string | number;
  createdAt: string;
  status: string;
  items: Array<{ id: number | string; name?: string; price?: number; quantity: number }>;
};
type Sale = {
  id?: string | number;
  createdAt: string;
  items: Array<{ productId: number | string; name?: string; price?: number; quantity: number }>;
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

export const ProductosAdvancedCharts = memo(function ProductosAdvancedCharts() {
  const { data } = useDashboardData();
  const products = (data?.products ?? []) as Product[];
  const orders = (data?.orders ?? []) as Order[];
  const sales = (data?.sales ?? []) as Sale[];

  const active = useMemo(() => products.filter((p) => p.active), [products]);

  // ── 1. MATRIZ MARGEN × VOLUMEN (BCG-like) ───────────────────────────────
  const quadrant = useMemo(() => {
    const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const m = new Map<
      string | number,
      { name: string; unidades: number; ingresos: number; costo: number }
    >();
    const cost = (id: string | number, price?: number) => {
      const p = products.find((x) => x.id === id);
      return p?.costPrice ?? (p?.price ?? price ?? 0) * 0.7;
    };
    orders
      .filter((o) => o.status !== "cancelado" && new Date(o.createdAt).getTime() >= last30)
      .forEach((o) =>
        o.items.forEach((it) => {
          const p = products.find((x) => x.id === it.id);
          const cur = m.get(it.id) ?? {
            name: p?.name ?? it.name ?? "—",
            unidades: 0,
            ingresos: 0,
            costo: 0,
          };
          const px = it.price ?? p?.price ?? 0;
          cur.unidades += it.quantity;
          cur.ingresos += px * it.quantity;
          cur.costo += cost(it.id, px) * it.quantity;
          m.set(it.id, cur);
        }),
      );
    sales
      .filter((s) => new Date(s.createdAt).getTime() >= last30)
      .forEach((s) =>
        s.items.forEach((it) => {
          const p = products.find((x) => x.id === it.productId);
          const cur = m.get(it.productId) ?? {
            name: p?.name ?? it.name ?? "—",
            unidades: 0,
            ingresos: 0,
            costo: 0,
          };
          const px = it.price ?? p?.price ?? 0;
          cur.unidades += it.quantity;
          cur.ingresos += px * it.quantity;
          cur.costo += cost(it.productId, px) * it.quantity;
          m.set(it.productId, cur);
        }),
      );
    const rows = Array.from(m.values())
      .map((r) => {
        const margenPct = r.ingresos > 0 ? ((r.ingresos - r.costo) / r.ingresos) * 100 : 0;
        return { ...r, margenPct: Math.round(margenPct * 10) / 10 };
      })
      .filter((r) => r.unidades > 0);
    if (rows.length === 0) {
      return {
        rows: [],
        medianMargen: 0,
        medianVolumen: 0,
        counts: { stars: 0, cows: 0, dogs: 0, questionMarks: 0 },
      };
    }
    const sortedM = [...rows].sort((a, b) => a.margenPct - b.margenPct);
    const sortedV = [...rows].sort((a, b) => a.unidades - b.unidades);
    const medianMargen = sortedM[Math.floor(sortedM.length / 2)]?.margenPct ?? 0;
    const medianVolumen = sortedV[Math.floor(sortedV.length / 2)]?.unidades ?? 0;
    const stars = rows.filter((r) => r.margenPct >= medianMargen && r.unidades >= medianVolumen).length;
    const cows = rows.filter((r) => r.margenPct < medianMargen && r.unidades >= medianVolumen).length;
    const dogs = rows.filter((r) => r.margenPct < medianMargen && r.unidades < medianVolumen).length;
    const questionMarks = rows.filter((r) => r.margenPct >= medianMargen && r.unidades < medianVolumen).length;
    return { rows, medianMargen, medianVolumen, counts: { stars, cows, dogs, questionMarks } };
  }, [products, orders, sales]);

  // ── 2. ROTACIÓN VS MARGEN POR CATEGORÍA ──────────────────────────────────
  const rotMargen = useMemo(() => {
    const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const catMap = new Map<
      string,
      { stock: number; unidades: number; ingresos: number; costo: number; skus: number }
    >();
    active.forEach((p) => {
      const cat = p.category ?? "otros";
      const cur = catMap.get(cat) ?? { stock: 0, unidades: 0, ingresos: 0, costo: 0, skus: 0 };
      cur.stock += p.stock ?? 0;
      cur.skus += 1;
      catMap.set(cat, cur);
    });
    const productToCat = new Map<string | number, string>(
      active.map((p) => [p.id, p.category ?? "otros"]),
    );
    const costOf = (id: string | number, price?: number) => {
      const p = products.find((x) => x.id === id);
      return p?.costPrice ?? (p?.price ?? price ?? 0) * 0.7;
    };
    orders
      .filter((o) => o.status !== "cancelado" && new Date(o.createdAt).getTime() >= last30)
      .forEach((o) =>
        o.items.forEach((it) => {
          const cat = productToCat.get(it.id);
          if (!cat) return;
          const cur = catMap.get(cat);
          if (!cur) return;
          const px = it.price ?? 0;
          cur.unidades += it.quantity;
          cur.ingresos += px * it.quantity;
          cur.costo += costOf(it.id, px) * it.quantity;
        }),
      );
    sales
      .filter((s) => new Date(s.createdAt).getTime() >= last30)
      .forEach((s) =>
        s.items.forEach((it) => {
          const cat = productToCat.get(it.productId);
          if (!cat) return;
          const cur = catMap.get(cat);
          if (!cur) return;
          const px = it.price ?? 0;
          cur.unidades += it.quantity;
          cur.ingresos += px * it.quantity;
          cur.costo += costOf(it.productId, px) * it.quantity;
        }),
      );
    return Array.from(catMap.entries())
      .map(([cat, v]) => ({
        categoria: CAT_LABEL[cat] ?? cat,
        rotacion: v.stock > 0 ? Math.round((v.unidades / v.stock) * 100) / 100 : 0,
        margenPct: v.ingresos > 0 ? Math.round(((v.ingresos - v.costo) / v.ingresos) * 100 * 10) / 10 : 0,
      }))
      .filter((r) => r.rotacion > 0 || r.margenPct > 0)
      .sort((a, b) => b.rotacion - a.rotacion)
      .slice(0, 8);
  }, [active, orders, sales, products]);

  // ── 3. EVOLUCIÓN TOP-5 PRODUCTOS (stacked 14d) ──────────────────────────
  const topEvolution = useMemo(() => {
    const last14 = Date.now() - 14 * 24 * 60 * 60 * 1000;
    // First find top-5 products by revenue in last 14d
    const totals = new Map<string | number, { name: string; rev: number }>();
    const addToTotal = (
      id: string | number,
      name: string | undefined,
      rev: number,
    ) => {
      const p = products.find((x) => x.id === id);
      const cur = totals.get(id) ?? { name: p?.name ?? name ?? "—", rev: 0 };
      cur.rev += rev;
      totals.set(id, cur);
    };
    orders
      .filter((o) => o.status !== "cancelado" && new Date(o.createdAt).getTime() >= last14)
      .forEach((o) =>
        o.items.forEach((it) => {
          addToTotal(it.id, it.name, (it.price ?? 0) * it.quantity);
        }),
      );
    sales
      .filter((s) => new Date(s.createdAt).getTime() >= last14)
      .forEach((s) =>
        s.items.forEach((it) => {
          addToTotal(it.productId, it.name, (it.price ?? 0) * it.quantity);
        }),
      );
    const top5 = Array.from(totals.entries())
      .sort(([, a], [, b]) => b.rev - a.rev)
      .slice(0, 5);
    const keys = top5.map(([id]) => String(id));
    const nameById = new Map(top5.map(([id, v]) => [String(id), v.name]));
    const byDate = new Map<string, Map<string, number>>();
    const addCell = (iso: string, id: string | number, rev: number) => {
      if (new Date(iso).getTime() < last14) return;
      const idStr = String(id);
      if (!keys.includes(idStr)) return;
      const k = dayKey(iso);
      if (!byDate.has(k)) byDate.set(k, new Map());
      const inner = byDate.get(k)!;
      inner.set(idStr, (inner.get(idStr) ?? 0) + rev);
    };
    orders
      .filter((o) => o.status !== "cancelado")
      .forEach((o) =>
        o.items.forEach((it) =>
          addCell(o.createdAt, it.id, (it.price ?? 0) * it.quantity),
        ),
      );
    sales.forEach((s) =>
      s.items.forEach((it) =>
        addCell(s.createdAt, it.productId, (it.price ?? 0) * it.quantity),
      ),
    );
    const days = Array.from(byDate.keys()).sort();
    const rows = days.map((k) => {
      const inner = byDate.get(k)!;
      const row: Record<string, string | number> = { day: dayLabel(k) };
      keys.forEach((idStr) => {
        row[idStr] = Math.round(inner.get(idStr) ?? 0);
      });
      return row;
    });
    const stacks = keys.map((id, i) => {
      const name = nameById.get(id) ?? "—";
      return {
        key: id,
        label: name.length > 16 ? name.slice(0, 15) + "…" : name,
        color: CAT_COLOR_KEYS[i % CAT_COLOR_KEYS.length],
      };
    });
    return { rows, stacks, top5: top5.map(([, v]) => v), totalRev: top5.reduce((s, [, v]) => s + v.rev, 0) };
  }, [products, orders, sales]);

  // ── 4. COMPARATIVA UNIDADES SEM ACTUAL VS PREVIA ─────────────────────────
  const comp = useMemo(() => {
    const now = Date.now();
    const DAYS_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const buckets = Array.from({ length: 7 }).map(() => ({
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
    const add = (iso: string, qty: number) => {
      const b = bucket(iso);
      if (!b) return;
      buckets[b.idx][b.isCurrent ? "current" : "previous"] += qty;
    };
    orders
      .filter((o) => o.status !== "cancelado")
      .forEach((o) =>
        add(o.createdAt, o.items.reduce((a, i) => a + i.quantity, 0)),
      );
    sales.forEach((s) =>
      add(s.createdAt, s.items.reduce((a, i) => a + i.quantity, 0)),
    );
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

  // ── 5. HEATMAP categoría × día (30d) ─────────────────────────────────────
  const heatmap = useMemo(() => {
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
    const peakCat = matrix.reduce(
      (best, row, idx) => {
        const rowMax = Math.max(...row);
        return rowMax > best.value ? { idx, value: rowMax } : best;
      },
      { idx: -1, value: 0 },
    );
    return { matrix, max, cats: topCats, days: DAYS, peakCat };
  }, [active, orders, sales]);

  // ── 6. MARGEN POR CATEGORÍA ──────────────────────────────────────────────
  const margenCat = useMemo(() => {
    const top = [...rotMargen]
      .sort((a, b) => b.margenPct - a.margenPct)
      .slice(0, 8);
    return top;
  }, [rotMargen]);

  const fmtU = (v: number) => `${v.toLocaleString("es-PE")} u`;
  const fmtS = (v: number) => `S/ ${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;

  const sections: DraggableItem[] = [
    {
      id: "margen-volumen-quadrant",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="Matriz BCG · margen × volumen · 30d"
          title="Clasificación estratégica de productos"
          kpis={[
            {
              label: "⭐ Estrellas (alto-alto)",
              value: String(quadrant.counts.stars),
              tone: "success",
            },
            {
              label: "🐄 Vacas (bajo-alto)",
              value: String(quadrant.counts.cows),
              tone: "primary",
            },
            {
              label: "❓ Incógnitas",
              value: String(quadrant.counts.questionMarks),
              tone: "neutral",
            },
            {
              label: "🐶 Perros (bajo-bajo)",
              value: String(quadrant.counts.dogs),
              tone: "warning",
            },
          ]}
        >
          {quadrant.rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">
              Sin data de ventas rango activo.
            </div>
          ) : (
            <div className="relative rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-soft)] p-6 min-h-[340px] overflow-hidden">
              {/* Axis lines */}
              <div
                className="absolute top-0 bottom-0 border-l-2 border-dashed border-[var(--rule-base)]"
                style={{ left: "50%" }}
              />
              <div
                className="absolute left-0 right-0 border-t-2 border-dashed border-[var(--rule-base)]"
                style={{ top: "50%" }}
              />
              {/* Quadrant labels */}
              <span className="absolute top-2 left-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-warning-500)]">
                ❓ Incógnita
              </span>
              <span className="absolute top-2 right-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-success-500)]">
                ⭐ Estrella
              </span>
              <span className="absolute bottom-2 left-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                🐶 Perro
              </span>
              <span className="absolute bottom-2 right-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-primary">
                🐄 Vaca
              </span>
              {/* Axis labels */}
              <span className="absolute top-1/2 left-2 -translate-y-1/2 text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] -rotate-90">
                Margen →
              </span>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)]">
                Volumen →
              </span>
              {/* Dots */}
              {quadrant.rows.slice(0, 40).map((r, i) => {
                const maxV = Math.max(...quadrant.rows.map((x) => x.unidades)) || 1;
                const maxM = Math.max(...quadrant.rows.map((x) => x.margenPct)) || 1;
                const x = (r.unidades / maxV) * 92 + 4;
                const y = 96 - (r.margenPct / maxM) * 88;
                const size = 8 + Math.min(12, r.ingresos / 500);
                const isStar = r.margenPct >= quadrant.medianMargen && r.unidades >= quadrant.medianVolumen;
                const isDog = r.margenPct < quadrant.medianMargen && r.unidades < quadrant.medianVolumen;
                const color = isStar
                  ? "var(--data-success)"
                  : isDog
                    ? "var(--data-warning)"
                    : r.unidades >= quadrant.medianVolumen
                      ? "var(--brand-primary)"
                      : "var(--text-tertiary)";
                return (
                  <div
                    key={i}
                    className="absolute rounded-full border-2 border-white dark:border-[var(--surface-sunken)] transition-transform hover:scale-125 hover:z-10 cursor-default"
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      width: size,
                      height: size,
                      background: color,
                      transform: "translate(-50%, -50%)",
                    }}
                    title={`${r.name} · ${r.unidades}u · ${r.margenPct}% margen · ${fmtS(r.ingresos)}`}
                  />
                );
              })}
              <p className="absolute bottom-8 right-3 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                Puntos: {Math.min(40, quadrant.rows.length)} · tamaño = ingresos
              </p>
            </div>
          )}
        </DashboardSection>
      ),
    },
    {
      id: "rotacion-margen",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="Rotación vs margen · por categoría · 30d"
          title="Qué categoría rota rápido y con qué margen"
          kpis={[
            {
              label: "Más rotación",
              value: rotMargen[0]?.categoria ?? "—",
              tone: "success",
            },
            {
              label: "Rotación top",
              value: rotMargen[0] ? `${rotMargen[0].rotacion}x` : "—",
              tone: "primary",
            },
            {
              label: "Mejor margen",
              value: margenCat[0]?.categoria ?? "—",
              tone: "success",
            },
            {
              label: "Margen top",
              value: margenCat[0] ? `${margenCat[0].margenPct}%` : "—",
              tone: "primary",
            },
          ]}
        >
          <BulejeComposedChart
            data={rotMargen}
            xKey="categoria"
            bars={[{ key: "rotacion", label: "Rotación (x)", color: "primary", yAxis: "left" }]}
            lines={[
              { key: "margenPct", label: "Margen %", color: "accent", yAxis: "right" },
            ]}
            leftAxisFormat={(v) => `${v}x`}
            rightAxisFormat={(v) => `${v}%`}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("margen")
                ? `${Number(v).toFixed(1)}%`
                : `${Number(v).toFixed(2)}x`
            }
            height={300}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
    {
      id: "top5-evolution",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="Top-5 productos · evolución 14d"
          title="Cómo rinde la élite día a día"
          kpis={[
            { label: "Top 5 activos", value: String(topEvolution.top5.length), tone: "primary" },
            {
              label: "Líder",
              value: (topEvolution.top5[0]?.name ?? "—").slice(0, 20),
              tone: "success",
            },
            {
              label: "Ingresos líder 14d",
              value: fmtS(topEvolution.top5[0]?.rev ?? 0),
              tone: "primary",
            },
            { label: "Total top-5 14d", value: fmtS(topEvolution.totalRev), tone: "neutral" },
          ]}
        >
          {topEvolution.rows.length > 0 && topEvolution.stacks.length > 0 ? (
            <BulejeStackedBar
              data={topEvolution.rows}
              xKey="day"
              stacks={topEvolution.stacks}
              yAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
              tooltipFormat={(v) => fmtS(Number(v))}
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
      id: "comparativa-unidades",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="Unidades vendidas · semana a semana"
          title="Esta semana vs semana pasada"
        >
          <BulejeComparisonOverlay
            data={comp}
            xKey="day"
            currentKey="current"
            previousKey="previous"
            currentLabel="Esta semana"
            previousLabel="Semana pasada"
            yAxisFormat={(v) => v.toString()}
            tooltipFormat={(v) => fmtU(Number(v))}
            height={280}
          />
        </DashboardSection>
      ),
    },
    {
      id: "heatmap-cat-dia",
      span: "full",
      render: () => {
        const peakName =
          heatmap.peakCat.idx >= 0
            ? CAT_LABEL[heatmap.cats[heatmap.peakCat.idx]] ?? heatmap.cats[heatmap.peakCat.idx]
            : "—";
        return (
          <DashboardSection
          hideHeader
            kicker="Heatmap · categoría × día · 30d"
            title="Cuándo se vende cada categoría"
            kpis={[
              { label: "Categorías", value: String(heatmap.cats.length), tone: "neutral" },
              { label: "Pico categoría", value: peakName, tone: "success" },
              { label: "Pico unidades", value: fmtU(heatmap.peakCat.value), tone: "primary" },
              { label: "Total SKUs", value: String(active.length), tone: "neutral" },
            ]}
          >
            {heatmap.cats.length > 0 ? (
              <div className="overflow-x-auto">
                <div className="min-w-[520px]">
                  <div
                    className="grid"
                    style={{ gridTemplateColumns: "120px repeat(7, 1fr)" }}
                  >
                    <div />
                    {heatmap.days.map((d) => (
                      <div
                        key={d}
                        className="text-center text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] pb-2"
                      >
                        {d}
                      </div>
                    ))}
                    {heatmap.cats.map((cat, catIdx) => (
                      <React.Fragment key={cat}>
                        <div className="text-xs font-semibold text-[var(--text-secondary)] pr-3 py-1 flex items-center truncate">
                          {CAT_LABEL[cat] ?? cat}
                        </div>
                        {heatmap.matrix[catIdx].map((v, dayIdx) => {
                          const intensity = v / heatmap.max;
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
                                color:
                                  intensity > 0.55 ? "#fff" : "var(--text-secondary)",
                                minHeight: 32,
                              }}
                              title={`${CAT_LABEL[cat] ?? cat} · ${heatmap.days[dayIdx]}: ${v} u`}
                            >
                              {v > 0 ? v : ""}
                            </div>
                          );
                        })}
                      </React.Fragment>
                    ))}
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
      id: "margen-cat",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="Margen ranking · por categoría · 30d"
          title="Qué categorías dan más utilidad por sol vendido"
          kpis={[
            { label: "Categorías", value: String(margenCat.length), tone: "neutral" },
            { label: "Margen top", value: margenCat[0] ? `${margenCat[0].margenPct}%` : "—", tone: "success" },
            {
              label: "Margen menor",
              value: margenCat[margenCat.length - 1]
                ? `${margenCat[margenCat.length - 1].margenPct}%`
                : "—",
              tone: "warning",
            },
            {
              label: "Promedio",
              value:
                margenCat.length > 0
                  ? `${Math.round(margenCat.reduce((s, m) => s + m.margenPct, 0) / margenCat.length)}%`
                  : "—",
              tone: "neutral",
            },
          ]}
        >
          <BulejeComposedChart
            data={margenCat}
            xKey="categoria"
            bars={[{ key: "margenPct", label: "Margen %", color: "primary", yAxis: "left" }]}
            lines={[
              { key: "rotacion", label: "Rotación (x)", color: "accent", yAxis: "right" },
            ]}
            leftAxisFormat={(v) => `${v}%`}
            rightAxisFormat={(v) => `${v}x`}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("rotación")
                ? `${Number(v).toFixed(2)}x`
                : `${Number(v).toFixed(1)}%`
            }
            height={280}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
  ];

  return <DraggableSections items={sections} storageKey="productos-advanced-order" layout="grid" />;
});
