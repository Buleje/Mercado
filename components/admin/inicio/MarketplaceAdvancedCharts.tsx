"use client";

/**
 * MarketplaceAdvancedCharts — charts especializados del módulo Marketplace.
 *
 * 1. Funnel de pedidos (pendiente → confirmado → en_camino → entregado)
 * 2. Ingresos mensuales 6m (Composed)
 * 3. Top productos marketplace por pedidos (Composed)
 * 4. Ratings / reviews (Composed + KPIs)
 * 5. Comparativa pedidos sem actual vs previa (ComparisonOverlay)
 * 6. Heatmap pedidos hora × día 30d
 */

import React, { memo, useMemo, useState } from "react";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import {
  BulejeComposedChart,
  BulejeComparisonOverlay,
} from "@/components/ui-system/charts";
import { DashboardSection } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";
import EmptyDateRangeState from "./EmptyDateRangeState";
import { Store } from "@buleje/design-system/icons";
import { getDefaultRange } from "./DashboardDateRange";

type Order = {
  id: string | number;
  createdAt: string;
  total: number;
  status: string;
  items: Array<{ id: number | string; name?: string; quantity: number; price?: number }>;
};
type Review = { rating: number; date?: string };
type Product = { id: number | string; name: string; price: number };

export const MarketplaceAdvancedCharts = memo(function MarketplaceAdvancedCharts() {
  const { data } = useDashboardData();
  // Snapshot del reloj al primer render — evita "Cannot call impure
  // function" del lint react-hooks/purity y mantiene el rango estable
  // entre re-renders (patrón también usado en InventarioDashboard).
  const [nowMs] = useState(() => Date.now());

  const orders = (data?.orders ?? []) as Order[];
  const reviews = (data?.reviews ?? []) as Review[];
  const products = (data?.products ?? []) as Product[];

  // ── 1. FUNNEL DE PEDIDOS ────────────────────────────────────────────────
  const funnel = useMemo(() => {
    const last30 = nowMs - 30 * 24 * 60 * 60 * 1000;
    const recent = orders.filter((o) => new Date(o.createdAt).getTime() >= last30);
    const recibidos = recent.length;
    const confirmados = recent.filter((o) =>
      ["confirmado", "en_camino", "entregado"].includes(o.status),
    ).length;
    const enCamino = recent.filter((o) =>
      ["en_camino", "entregado"].includes(o.status),
    ).length;
    const entregados = recent.filter((o) => o.status === "entregado").length;
    const cancelados = recent.filter((o) => o.status === "cancelado").length;
    const data = [
      { etapa: "Recibidos", cantidad: recibidos, pct: 100 },
      {
        etapa: "Confirmados",
        cantidad: confirmados,
        pct: recibidos > 0 ? Math.round((confirmados / recibidos) * 100) : 0,
      },
      {
        etapa: "En camino",
        cantidad: enCamino,
        pct: recibidos > 0 ? Math.round((enCamino / recibidos) * 100) : 0,
      },
      {
        etapa: "Entregados",
        cantidad: entregados,
        pct: recibidos > 0 ? Math.round((entregados / recibidos) * 100) : 0,
      },
    ];
    const conversion = recibidos > 0 ? Math.round((entregados / recibidos) * 100) : 0;
    const dropOffAtConfirm = recibidos - confirmados;
    return { data, recibidos, entregados, cancelados, conversion, dropOffAtConfirm };
  }, [orders, nowMs]);

  // ── 2. INGRESOS MENSUALES 6M ────────────────────────────────────────────
  const monthly = useMemo(() => {
    const now = new Date();
    const rows: Array<{ mes: string; ingresos: number; pedidos: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const label = mStart.toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
      const period = orders.filter(
        (o) =>
          o.status === "entregado" &&
          new Date(o.createdAt) >= mStart &&
          new Date(o.createdAt) <= mEnd,
      );
      const ingresos = period.reduce((s, o) => s + Number(o.total ?? 0), 0);
      rows.push({ mes: label, ingresos: Math.round(ingresos), pedidos: period.length });
    }
    const total = rows.reduce((s, r) => s + r.ingresos, 0);
    const prom = total / Math.max(1, rows.length);
    const best = [...rows].sort((a, b) => b.ingresos - a.ingresos)[0];
    return { rows, total, prom, best };
  }, [orders]);

  // ── 3. TOP PRODUCTOS MARKETPLACE ─────────────────────────────────────────
  const topProducts = useMemo(() => {
    const last30 = nowMs - 30 * 24 * 60 * 60 * 1000;
    const m = new Map<string | number, { name: string; pedidos: number; unidades: number; ingresos: number }>();
    orders
      .filter((o) => o.status === "entregado" && new Date(o.createdAt).getTime() >= last30)
      .forEach((o) =>
        o.items.forEach((it) => {
          const p = products.find((x) => x.id === it.id);
          const cur = m.get(it.id) ?? {
            name: p?.name ?? it.name ?? "—",
            pedidos: 0,
            unidades: 0,
            ingresos: 0,
          };
          cur.pedidos += 1;
          cur.unidades += it.quantity;
          cur.ingresos += (it.price ?? p?.price ?? 0) * it.quantity;
          m.set(it.id, cur);
        }),
      );
    const rows = Array.from(m.values())
      .sort((a, b) => b.ingresos - a.ingresos)
      .slice(0, 10)
      .map((r) => ({
        producto: r.name.length > 14 ? r.name.slice(0, 13) + "…" : r.name,
        ingresos: Math.round(r.ingresos),
        unidades: r.unidades,
      }));
    return { rows, total: rows.length, maxIngresos: rows[0]?.ingresos ?? 0 };
  }, [orders, products, nowMs]);

  // ── 4. RATINGS ──────────────────────────────────────────────────────────
  const ratings = useMemo(() => {
    const arr = [1, 2, 3, 4, 5].map((r) => ({
      rating: `${r}★`,
      cantidad: reviews.filter((rv) => Math.round(rv.rating) === r).length,
    }));
    const total = arr.reduce((s, x) => s + x.cantidad, 0);
    const promedio =
      reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    const buenos = arr.filter((x) => Number(x.rating[0]) >= 4).reduce((s, x) => s + x.cantidad, 0);
    const malos = arr.filter((x) => Number(x.rating[0]) <= 2).reduce((s, x) => s + x.cantidad, 0);
    return { arr, total, promedio, buenos, malos };
  }, [reviews]);

  // ── 5. COMPARATIVA SEMANAL ──────────────────────────────────────────────
  const comp = useMemo(() => {
    const now = nowMs;
    const DAYS_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const buckets = Array.from({ length: 7 }).map(() => ({
      day: "",
      current: 0,
      previous: 0,
    }));
    const curStart = now - 7 * 24 * 60 * 60 * 1000;
    const prevStart = now - 14 * 24 * 60 * 60 * 1000;
    orders
      .filter((o) => o.status === "entregado")
      .forEach((o) => {
        const t = new Date(o.createdAt).getTime();
        if (t >= curStart) {
          const daysAgo = Math.floor((now - t) / (24 * 60 * 60 * 1000));
          if (daysAgo < 0 || daysAgo >= 7) return;
          buckets[6 - daysAgo].current += Number(o.total ?? 0);
        } else if (t >= prevStart) {
          const daysAgo = Math.floor((curStart - t) / (24 * 60 * 60 * 1000));
          if (daysAgo < 0 || daysAgo >= 7) return;
          buckets[6 - daysAgo].previous += Number(o.total ?? 0);
        }
      });
    const today = new Date();
    buckets.forEach((r, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      r.day = DAYS_LABEL[d.getDay()];
      r.current = Math.round(r.current);
      r.previous = Math.round(r.previous);
    });
    return buckets;
  }, [orders, nowMs]);

  // ── 6. HEATMAP HORA × DÍA 30D ───────────────────────────────────────────
  const heatmap = useMemo(() => {
    const last30 = nowMs - 30 * 24 * 60 * 60 * 1000;
    const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const BUCKETS = [
      { label: "Madrugada", range: [0, 5] },
      { label: "Mañana", range: [6, 11] },
      { label: "Mediodía", range: [12, 14] },
      { label: "Tarde", range: [15, 18] },
      { label: "Noche", range: [19, 23] },
    ];
    const matrix = BUCKETS.map(() => [0, 0, 0, 0, 0, 0, 0]);
    orders
      .filter((o) => o.status === "entregado" && new Date(o.createdAt).getTime() >= last30)
      .forEach((o) => {
        const d = new Date(o.createdAt);
        const dow = (d.getDay() + 6) % 7;
        const h = d.getHours();
        const bi = BUCKETS.findIndex(({ range }) => h >= range[0] && h <= range[1]);
        if (bi < 0) return;
        matrix[bi][dow] += 1;
      });
    const max = Math.max(1, ...matrix.flat());
    const peak = matrix.reduce(
      (best, row, idx) => {
        const rowMax = Math.max(...row);
        return rowMax > best.value ? { idx, value: rowMax } : best;
      },
      { idx: -1, value: 0 },
    );
    return { matrix, max, buckets: BUCKETS, days: DAYS, peak };
  }, [orders, nowMs]);

  const fmtS = (v: number) =>
    `S/ ${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;

  // Brandon mayo 2026 v7: hasData REAL por chart — antes estaba hardcoded a
  // true y la regla "sin datos = oculto" no se cumplía a nivel sub-chart
  // (sí a nivel módulo). Ahora cada chart se auto-oculta si está vacío y se
  // muestra en el grupo "Sin datos" del modal de gestión.
  const hasFunnel = funnel.recibidos > 0;
  const hasMonthly = monthly.total > 0;
  const hasTopProducts = topProducts.rows.length > 0;
  const hasRatings = ratings.total > 0;
  const hasComparison = comp.some((c) => c.current > 0 || c.previous > 0);
  const heatmapTotal = heatmap.matrix.flat().reduce((s, v) => s + v, 0);
  const hasHeatmap = heatmapTotal > 0;

  const sections: DraggableItem[] = [
    {
      id: "funnel-pedidos",
      render: () => (
        <DashboardSection
          chartId="marketplace.advanced.funnel-pedidos"
          hasData={hasFunnel}
          defaultVisible
          kicker="Funnel · rango activo"
          title="De pedido recibido a entregado"
          description="Cuántos pedidos te llegan y a cuántos les das salida. Si la mayoría se cae antes de confirmar, fijate qué está pasando en ese paso."
          kpis={[
            { label: "Recibidos", value: String(funnel.recibidos), tone: "primary" },
            { label: "Entregados", value: String(funnel.entregados), tone: "success" },
            {
              label: "Tasa conversión",
              value: `${funnel.conversion}%`,
              tone: funnel.conversion >= 80 ? "success" : funnel.conversion >= 60 ? "primary" : "warning",
            },
            {
              label: "Cancelados",
              value: String(funnel.cancelados),
              tone: funnel.cancelados > 0 ? "warning" : "success",
            },
          ]}
        >
          <ul className="space-y-2">
            {funnel.data.map((e, i) => {
              const max = funnel.data[0]?.cantidad || 1;
              const width = Math.round((e.cantidad / max) * 100);
              const colors = [
                "var(--brand-primary)",
                "color-mix(in srgb, var(--brand-primary) 85%, transparent)",
                "color-mix(in srgb, var(--brand-primary) 70%, transparent)",
                "var(--data-success)",
              ];
              return (
                <li
                  key={i}
                  className="relative rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3 overflow-hidden"
                >
                  <div
                    className="absolute inset-y-0 left-0 transition-all"
                    style={{ width: `${width}%`, background: colors[i], opacity: 0.25 }}
                  />
                  <div className="relative flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full text-[length:var(--ts-2xs)] font-bold shrink-0 bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-tertiary)]">
                      {i + 1}
                    </span>
                    <span className="text-sm font-semibold text-[var(--text-primary)] flex-1">
                      {e.etapa}
                    </span>
                    <span className="text-xs font-bold text-[var(--text-secondary)]">
                      {e.cantidad}
                    </span>
                    <span className="text-xs font-bold tabular-nums text-[var(--text-primary)] ml-2 min-w-[3rem] text-right">
                      {e.pct}%
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </DashboardSection>
      ),
    },
    {
      id: "ingresos-6m",
      span: "full",
      render: () => (
        <DashboardSection
          chartId="marketplace.advanced.ingresos-6m"
          hasData={hasMonthly}
          defaultVisible
          kicker="Ingresos · últimos 6 meses"
          title="Cómo viene tu facturación mensual"
          description="La plata que entró por marketplace los últimos 6 meses. Si sube mes a mes, estás sumando clientes nuevos. Si baja, revisá promos o stock."
          kpis={[
            { label: "Total 6m", value: fmtS(monthly.total), tone: "primary" },
            { label: "Promedio mes", value: fmtS(monthly.prom), tone: "neutral" },
            { label: "Mejor mes", value: monthly.best?.mes ?? "—", tone: "success" },
            { label: "Ingresos mejor", value: fmtS(monthly.best?.ingresos ?? 0), tone: "success" },
          ]}
        >
          <BulejeComposedChart
            data={monthly.rows}
            xKey="mes"
            bars={[{ key: "ingresos", label: "Ingresos S/", color: "primary", yAxis: "left" }]}
            lines={[{ key: "pedidos", label: "Pedidos", color: "accent", yAxis: "right" }]}
            leftAxisFormat={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            rightAxisFormat={(v) => v.toString()}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("pedidos")
                ? Number(v).toString()
                : fmtS(Number(v))
            }
            height={280}
            minDataPoints={2}
          />
        </DashboardSection>
      ),
    },
    {
      id: "top-productos-marketplace",
      span: "full",
      render: () => (
        <DashboardSection
          chartId="marketplace.advanced.top-productos-marketplace"
          hasData={hasTopProducts}
          defaultVisible
          kicker="Top 10 productos · rango activo"
          title="Los productos que más venden en marketplace"
          description="Tus 10 productos estrella. Acá enfocá tu stock y tus promos — son los que te hacen plata todos los días."
          kpis={[
            {
              label: "Líder",
              value: topProducts.rows[0]?.producto ?? "—",
              tone: "success",
            },
            {
              label: "Ingresos líder",
              value: fmtS(topProducts.maxIngresos),
              tone: "primary",
            },
            { label: "Productos activos", value: String(topProducts.total), tone: "neutral" },
            {
              label: "Total top-10",
              value: fmtS(topProducts.rows.reduce((s, r) => s + r.ingresos, 0)),
              tone: "primary",
            },
          ]}
        >
          {topProducts.rows.length > 0 ? (
            <BulejeComposedChart
              data={topProducts.rows}
              xKey="producto"
              bars={[{ key: "ingresos", label: "Ingresos S/", color: "primary", yAxis: "left" }]}
              lines={[{ key: "unidades", label: "Unidades", color: "accent", yAxis: "right" }]}
              leftAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
              rightAxisFormat={(v) => v.toString()}
              tooltipFormat={(v, name) =>
                name?.toLowerCase().includes("unidades")
                  ? `${v} u`
                  : fmtS(Number(v))
              }
              height={300}
              minDataPoints={1}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">
              Sin pedidos en los rango activo.
            </div>
          )}
        </DashboardSection>
      ),
    },
    {
      id: "ratings-marketplace",
      render: () => (
        <DashboardSection
          chartId="marketplace.advanced.ratings-marketplace"
          hasData={hasRatings}
          defaultVisible
          kicker="Satisfacción · todos los periodos"
          title="Qué nota te dan tus clientes"
          description="Si el promedio está en 4★ o más, la gente vuelve a comprarte. Si ves 1★ o 2★, llamalos para entender qué falló — un cliente bien tratado vale por diez."
          kpis={[
            { label: "Total reseñas", value: String(ratings.total), tone: "primary" },
            { label: "Promedio", value: Number(ratings.promedio).toFixed(1), tone: "success" },
            { label: "4★ y 5★", value: String(ratings.buenos), tone: "success" },
            {
              label: "1★ y 2★",
              value: String(ratings.malos),
              tone: ratings.malos > 0 ? "warning" : "success",
            },
          ]}
        >
          {ratings.total > 0 ? (
            <BulejeComposedChart
              data={ratings.arr}
              xKey="rating"
              bars={[{ key: "cantidad", label: "Reseñas", color: "primary", yAxis: "left" }]}
              leftAxisFormat={(v) => v.toString()}
              tooltipFormat={(v) => `${v} reseñas`}
              height={260}
              showLegend={false}
              minDataPoints={1}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">
              Sin reseñas aún.
            </div>
          )}
        </DashboardSection>
      ),
    },
    {
      id: "comparativa-semanal-mkt",
      render: () => (
        <DashboardSection
          chartId="marketplace.advanced.comparativa-semanal-mkt"
          hasData={hasComparison}
          defaultVisible
          kicker="Comparativa · ingresos semana a semana"
          title="Esta semana vs la pasada"
          description="Compará día por día contra la semana anterior. Si la línea de esta semana va arriba, estás creciendo; si va abajo, hay que revisar qué cambió."
        >
          <BulejeComparisonOverlay
            data={comp}
            xKey="day"
            currentKey="current"
            previousKey="previous"
            currentLabel="Esta semana"
            previousLabel="Semana pasada"
            yAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
            tooltipFormat={(v) => fmtS(Number(v))}
            height={280}
          />
        </DashboardSection>
      ),
    },
    {
      id: "heatmap-marketplace",
      span: "full",
      render: () => {
        const peakLabel =
          heatmap.peak.idx >= 0 ? heatmap.buckets[heatmap.peak.idx].label : "—";
        return (
          <DashboardSection
            chartId="marketplace.advanced.heatmap-marketplace"
            hasData={hasHeatmap}
            defaultVisible
            kicker="Heatmap · franja × día · 30d"
            title="Cuándo entran más pedidos"
            description="En qué hora y día caen los pedidos. Reforzá personal o stock en la franja pico — perder un pedido en hora alta cuesta mucho más que en la calma."
            kpis={[
              {
                label: "Total pedidos 30d",
                value: String(heatmap.matrix.flat().reduce((s, v) => s + v, 0)),
                tone: "primary",
              },
              { label: "Franja pico", value: peakLabel, tone: "success" },
              { label: "Pico pedidos", value: String(heatmap.peak.value), tone: "primary" },
              { label: "Franjas activas", value: String(heatmap.buckets.length), tone: "neutral" },
            ]}
          >
            <div className="overflow-x-auto">
              <div className="min-w-[520px]">
                <div
                  className="grid"
                  style={{ gridTemplateColumns: "110px repeat(7, 1fr)" }}
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
                  {heatmap.buckets.map((bucket, bucketIdx) => (
                    <React.Fragment key={bucket.label}>
                      <div className="text-xs font-semibold text-[var(--text-secondary)] pr-3 py-1 flex items-center">
                        {bucket.label}
                      </div>
                      {heatmap.matrix[bucketIdx].map((v, dayIdx) => {
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
                            title={`${bucket.label} · ${heatmap.days[dayIdx]}: ${v} pedidos`}
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
          </DashboardSection>
        );
      },
    },
  ];

  // Brandon mayo 2026: si no hay actividad (ni orders ni reviews) no
  // tiene sentido pintar 6 cards con KPIs en cero. Cae al empty-state
  // canónico del proyecto, mismo formato que las otras secciones.
  // (Se evalúa DESPUÉS de los useMemo para no romper Rules of Hooks).
  const noActivity = orders.length === 0 && reviews.length === 0;
  if (noActivity) {
    return (
      <EmptyDateRangeState
        dateRange={getDefaultRange()}
        metric="actividad de marketplace"
        icon={Store}
        title="Tu marketplace todavía no registra movimientos"
        description="Cuando empiecen a entrar pedidos y reseñas vas a ver acá el funnel de conversión, ingresos por mes, top productos, ratings y picos por franja horaria."
        action={{ label: "Ver mis productos", href: "/admin?tab=inventario" }}
      />
    );
  }

  return <DraggableSections items={sections} storageKey="marketplace-advanced-order" layout="grid" />;
});
