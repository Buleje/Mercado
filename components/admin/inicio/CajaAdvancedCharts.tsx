"use client";

/**
 * CajaAdvancedCharts — charts especializados del módulo Caja.
 *
 * Complementa CajaCharts con análisis financieros de mayor profundidad:
 *  1. Cash Runway — días de operación con balance actual
 *  2. Pareto de métodos de pago — qué 20% hace 80% del cash
 *  3. Evolución de métodos de pago (stacked 14d)
 *  4. Comparativa semanal (ingresos + egresos) vs semana pasada
 *  5. Evolución del margen neto 14d
 *  6. Balance acumulado (running total)
 */

import { memo, useMemo } from "react";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import {
  BulejeComposedChart,
  BulejeGaugeChart,
  BulejeStackedBar,
  BulejeComparisonOverlay,
} from "@/components/ui-system/charts";
import { DashboardSection } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";

type Product = {
  id: number | string;
  price: number;
  costPrice?: number;
};
type Order = {
  id: string | number;
  createdAt: string;
  total: number;
  status: string;
  paymentMethod?: string;
  items: Array<{ id: number | string; price: number; quantity: number }>;
};
type Sale = {
  id?: string | number;
  createdAt: string;
  total: number;
  payment?: string;
  items: Array<{ productId: number | string; price: number; costPrice?: number; quantity: number }>;
};
type Purchase = {
  id: string | number;
  createdAt?: string;
  total: number;
  paid?: boolean;
};
type Payable = {
  id: string | number;
  amount: number;
  paid?: boolean;
  dueDate?: string;
};

const PAY_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};
const PAY_COLOR_KEYS = ["primary", "secondary", "tertiary", "accent", "amber", "purple"] as const;

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayLabel(dk: string) {
  return new Date(dk + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

export const CajaAdvancedCharts = memo(function CajaAdvancedCharts() {
  const { data } = useDashboardData();

  const products = (data?.products ?? []) as Product[];
  const orders = (data?.orders ?? []) as Order[];
  const sales = (data?.sales ?? []) as Sale[];
  const purchases = (data?.purchases ?? []) as Purchase[];
  const payables = (data?.payables ?? []) as Payable[];

  const costMap = useMemo(
    () => new Map(products.map((p) => [p.id, p.costPrice ?? p.price * 0.7])),
    [products],
  );

  // ── 1. CASH RUNWAY — días de operación ───────────────────────────────────
  const runway = useMemo(() => {
     
    const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const ingresos30d =
      orders
        .filter((o) => o.status === "entregado" && new Date(o.createdAt).getTime() >= last30)
        .reduce((a, o) => a + Number(o.total ?? 0), 0) +
      sales
        .filter((s) => new Date(s.createdAt).getTime() >= last30)
        .reduce((a, s) => a + Number(s.total ?? 0), 0);
    const egresos30d = purchases
      .filter((p) => p.createdAt && new Date(p.createdAt).getTime() >= last30)
      .reduce((a, p) => a + Number(p.total ?? 0), 0);
    const balance = ingresos30d - egresos30d;
    const avgEgresoDia = egresos30d / 30;
    const pendientePago = payables
      .filter((p) => !p.paid)
      .reduce((a, p) => a + Number(p.amount ?? 0), 0);
    // runway = cuántos días puedo operar con balance actual al ritmo de egresos
    const dias = avgEgresoDia > 0 ? balance / avgEgresoDia : 999;
    const runwayDias = Math.max(0, Math.round(dias));
    // Normalizar a 0-100 para gauge: 60 días = 100%, 0 = 0%
    const runwayPct = Math.max(0, Math.min(100, (runwayDias / 60) * 100));
    return {
      balance: Math.round(balance),
      ingresos30d: Math.round(ingresos30d),
      egresos30d: Math.round(egresos30d),
      avgEgresoDia: Math.round(avgEgresoDia),
      runwayDias,
      runwayPct,
      pendientePago: Math.round(pendientePago),
    };
  }, [orders, sales, purchases, payables]);

  // ── 2. PARETO DE MÉTODOS DE PAGO ─────────────────────────────────────────
  const pareto = useMemo(() => {
     
    const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const m = new Map<string, number>();
    orders
      .filter((o) => o.status === "entregado" && new Date(o.createdAt).getTime() >= last30)
      .forEach((o) => {
        const key = PAY_LABELS[o.paymentMethod ?? "efectivo"] ?? (o.paymentMethod ?? "Efectivo");
        m.set(key, (m.get(key) ?? 0) + Number(o.total ?? 0));
      });
    sales
      .filter((s) => new Date(s.createdAt).getTime() >= last30)
      .forEach((s) => {
        const key = PAY_LABELS[s.payment ?? "efectivo"] ?? (s.payment ?? "Efectivo");
        m.set(key, (m.get(key) ?? 0) + Number(s.total ?? 0));
      });
    const sorted = Array.from(m.entries()).sort(([, a], [, b]) => b - a);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    let acc = 0;
    const rows = sorted.map(([metodo, monto]) => {
      acc += monto;
      return {
        metodo,
        monto: Math.round(monto),
        acumuladoPct: total > 0 ? Math.round((acc / total) * 1000) / 10 : 0,
      };
    });
    const pct80 = rows.findIndex((r) => r.acumuladoPct >= 80);
    const metodosFor80 = pct80 >= 0 ? pct80 + 1 : rows.length;
    return { rows, total: Math.round(total), metodosFor80, totalMetodos: rows.length };
  }, [orders, sales]);

  // ── 3. EVOLUCIÓN MÉTODOS DE PAGO — stacked 14d ──────────────────────────
  const metodosStacked = useMemo(() => {
     
    const last14 = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const byDate = new Map<string, Map<string, number>>();
    const add = (iso: string, method: string, amount: number) => {
      if (new Date(iso).getTime() < last14) return;
      const k = dayKey(iso);
      const label = PAY_LABELS[method] ?? method;
      if (!byDate.has(k)) byDate.set(k, new Map());
      const inner = byDate.get(k)!;
      inner.set(label, (inner.get(label) ?? 0) + amount);
    };
    orders
      .filter((o) => o.status === "entregado")
      .forEach((o) => add(o.createdAt, o.paymentMethod ?? "efectivo", Number(o.total ?? 0)));
    sales.forEach((s) => add(s.createdAt, s.payment ?? "efectivo", Number(s.total ?? 0)));
    const methodTotals = new Map<string, number>();
    byDate.forEach((inner) => inner.forEach((v, m) => methodTotals.set(m, (methodTotals.get(m) ?? 0) + v)));
    const topMethods = Array.from(methodTotals.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([m]) => m);
    const days = Array.from(byDate.keys()).sort();
    const rows = days.map((k) => {
      const inner = byDate.get(k)!;
      const row: Record<string, string | number> = { day: dayLabel(k) };
      topMethods.forEach((m) => {
        row[m] = Math.round(inner.get(m) ?? 0);
      });
      return row;
    });
    const stacks = topMethods.map((m, i) => ({
      key: m,
      label: m,
      color: PAY_COLOR_KEYS[i % PAY_COLOR_KEYS.length],
    }));
    return { rows, stacks, methods: topMethods };
  }, [orders, sales]);

  // ── 4. COMPARATIVA SEMANAL INGRESOS + EGRESOS ───────────────────────────
  const compSemana = useMemo(() => {
     
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
    // Ingresos netos (ventas - compras) por día
    orders
      .filter((o) => o.status === "entregado")
      .forEach((o) => {
        const b = bucket(o.createdAt);
        if (!b) return;
        buckets[b.idx][b.isCurrent ? "current" : "previous"] += Number(o.total ?? 0);
      });
    sales.forEach((s) => {
      const b = bucket(s.createdAt);
      if (!b) return;
      buckets[b.idx][b.isCurrent ? "current" : "previous"] += Number(s.total ?? 0);
    });
    purchases.forEach((p) => {
      if (!p.createdAt) return;
      const b = bucket(p.createdAt);
      if (!b) return;
      buckets[b.idx][b.isCurrent ? "current" : "previous"] -= Number(p.total ?? 0);
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
  }, [orders, sales, purchases]);

  // ── 5. EVOLUCIÓN DEL MARGEN NETO 14d ─────────────────────────────────────
  const margenTrend = useMemo(() => {
     
    const last14 = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const byDate = new Map<string, { ingresos: number; costo: number; egresos: number }>();
    const ensure = (k: string) => {
      if (!byDate.has(k)) byDate.set(k, { ingresos: 0, costo: 0, egresos: 0 });
      return byDate.get(k)!;
    };
    orders
      .filter((o) => o.status === "entregado" && new Date(o.createdAt).getTime() >= last14)
      .forEach((o) => {
        const r = ensure(dayKey(o.createdAt));
        r.ingresos += Number(o.total ?? 0);
        o.items.forEach((i) => {
          r.costo += (costMap.get(i.id) ?? i.price * 0.7) * i.quantity;
        });
      });
    sales
      .filter((s) => new Date(s.createdAt).getTime() >= last14)
      .forEach((s) => {
        const r = ensure(dayKey(s.createdAt));
        r.ingresos += Number(s.total ?? 0);
        s.items.forEach((i) => {
          r.costo += (costMap.get(i.productId) ?? i.price * 0.7) * i.quantity;
        });
      });
    purchases
      .filter((p) => p.createdAt && new Date(p.createdAt).getTime() >= last14)
      .forEach((p) => {
        const r = ensure(dayKey(p.createdAt!));
        r.egresos += Number(p.total ?? 0);
      });
    const days = Array.from(byDate.keys()).sort();
    const rows = days.map((k) => {
      const r = byDate.get(k)!;
      const utilidad = r.ingresos - r.costo - r.egresos;
      const margen = r.ingresos > 0 ? Math.round((utilidad / r.ingresos) * 1000) / 10 : 0;
      return {
        dia: dayLabel(k),
        utilidad: Math.round(utilidad),
        margen,
        ingresos: Math.round(r.ingresos),
      };
    });
    const margenProm = rows.length
      ? rows.reduce((s, r) => s + r.margen, 0) / rows.length
      : 0;
    const mejor = rows.length
      ? [...rows].sort((a, b) => b.margen - a.margen)[0]
      : { dia: "—", margen: 0 };
    return { rows, margenProm: Math.round(margenProm * 10) / 10, mejor };
  }, [orders, sales, purchases, costMap]);

  // ── 6. BALANCE ACUMULADO (running total) últimos 30d ─────────────────────
  const runningBalance = useMemo(() => {
     
    const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const byDate = new Map<string, number>();
    const add = (iso: string, delta: number) => {
      if (new Date(iso).getTime() < last30) return;
      const k = dayKey(iso);
      byDate.set(k, (byDate.get(k) ?? 0) + delta);
    };
    orders
      .filter((o) => o.status === "entregado")
      .forEach((o) => add(o.createdAt, Number(o.total ?? 0)));
    sales.forEach((s) => add(s.createdAt, Number(s.total ?? 0)));
    purchases.forEach((p) => {
      if (!p.createdAt) return;
      add(p.createdAt, -Number(p.total ?? 0));
    });
    const days = Array.from(byDate.keys()).sort();
    let acc = 0;
    const rows = days.map((k) => {
      const delta = byDate.get(k) ?? 0;
      acc += delta;
      return {
        dia: dayLabel(k),
        deltaDia: Math.round(delta),
        acumulado: Math.round(acc),
      };
    });
    const minAcc = rows.length ? Math.min(...rows.map((r) => r.acumulado)) : 0;
    const maxAcc = rows.length ? Math.max(...rows.map((r) => r.acumulado)) : 0;
    const finalAcc = rows.length ? rows[rows.length - 1].acumulado : 0;
    return { rows, minAcc: Math.round(minAcc), maxAcc: Math.round(maxAcc), finalAcc };
  }, [orders, sales, purchases]);

  const fmtS = (v: number) => `S/ ${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;

  const sections: DraggableItem[] = [
    {
      id: "cash-runway",
      render: () => (
        <DashboardSection
          chartId="caja.advanced.cash-runway"
          hasData={true}
          defaultVisible={false}
kicker="Cash runway · rango activo"
          title="Días de operación con balance actual"
          kpis={[
            {
              label: "Runway",
              value: `${runway.runwayDias} días`,
              tone:
                runway.runwayDias >= 30
                  ? "success"
                  : runway.runwayDias >= 15
                    ? "primary"
                    : "warning",
            },
            { label: "Balance 30d", value: fmtS(runway.balance), tone: runway.balance >= 0 ? "success" : "warning" },
            { label: "Egreso prom./día", value: fmtS(runway.avgEgresoDia), tone: "neutral" },
            { label: "Pendiente pago", value: fmtS(runway.pendientePago), tone: "warning" },
          ]}
        >
          <div className="flex items-center justify-center py-2">
            <BulejeGaugeChart
              value={runway.runwayPct}
              max={100}
              label="Runway de efectivo"
              sublabel={
                runway.runwayDias >= 60
                  ? "Excelente — +60 días"
                  : runway.runwayDias >= 30
                    ? "Saludable"
                    : runway.runwayDias >= 15
                      ? "Ajustado — vigilar"
                      : "Crítico — tomar acción"
              }
              format="percentage"
              size={260}
            />
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "pareto-metodos",
      render: () => (
        <DashboardSection
          chartId="caja.advanced.pareto-metodos"
          hasData={true}
          defaultVisible={false}
kicker="Pareto · métodos de pago · rango activo"
          title="Qué métodos concentran el cash"
          kpis={[
            { label: "Total 30d", value: fmtS(pareto.total), tone: "primary" },
            { label: "Métodos para 80%", value: String(pareto.metodosFor80), tone: "success" },
            { label: "Métodos totales", value: String(pareto.totalMetodos), tone: "neutral" },
            {
              label: "Líder",
              value: pareto.rows[0]?.metodo ?? "—",
              tone: "success",
            },
          ]}
        >
          <BulejeComposedChart
            data={pareto.rows}
            xKey="metodo"
            bars={[{ key: "monto", label: "Monto S/", color: "primary", yAxis: "left" }]}
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
            height={300}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
    {
      id: "metodos-stacked",
      render: () => (
        <DashboardSection
          chartId="caja.advanced.metodos-stacked"
          hasData={true}
          defaultVisible={false}
kicker="Evolución de métodos · rango activo"
          title="Composición diaria de cobros por método"
          kpis={[
            { label: "Días con data", value: String(metodosStacked.rows.length), tone: "neutral" },
            { label: "Métodos", value: String(metodosStacked.methods.length), tone: "neutral" },
            {
              label: "Método top",
              value: metodosStacked.methods[0] ?? "—",
              tone: "success",
            },
            {
              label: "Total 14d",
              value: fmtS(
                metodosStacked.rows.reduce(
                  (s, r) =>
                    s +
                    metodosStacked.methods.reduce((ss, m) => ss + Number(r[m] ?? 0), 0),
                  0,
                ),
              ),
              tone: "primary",
            },
          ]}
        >
          {metodosStacked.rows.length > 0 ? (
            <BulejeStackedBar
              data={metodosStacked.rows}
              xKey="day"
              stacks={metodosStacked.stacks}
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
      id: "comparativa-semana",
      render: () => (
        <DashboardSection
          chartId="caja.advanced.comparativa-semana"
          hasData={true}
          defaultVisible={false}
kicker="Comparativa · semana a semana"
          title="Balance neto — esta semana vs pasada"
        >
          <BulejeComparisonOverlay
            data={compSemana}
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
    {
      id: "margen-trend",
      render: () => (
        <DashboardSection
          chartId="caja.advanced.margen-trend"
          hasData={true}
          defaultVisible={false}
kicker="Evolución del margen · rango activo"
          title="Utilidad neta y margen día a día"
          kpis={[
            {
              label: "Margen prom.",
              value: `${margenTrend.margenProm}%`,
              tone:
                margenTrend.margenProm >= 20
                  ? "success"
                  : margenTrend.margenProm >= 10
                    ? "primary"
                    : "warning",
            },
            { label: "Mejor día", value: margenTrend.mejor.dia, tone: "success" },
            {
              label: "Margen mejor día",
              value: `${margenTrend.mejor.margen}%`,
              tone: "success",
            },
            {
              label: "Utilidad acum.",
              value: fmtS(margenTrend.rows.reduce((s, r) => s + r.utilidad, 0)),
              tone: "primary",
            },
          ]}
        >
          <BulejeComposedChart
            data={margenTrend.rows}
            xKey="dia"
            bars={[{ key: "utilidad", label: "Utilidad S/", color: "primary", yAxis: "left" }]}
            lines={[{ key: "margen", label: "Margen %", color: "accent", yAxis: "right" }]}
            leftAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
            rightAxisFormat={(v) => `${v}%`}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("margen")
                ? `${Number(v).toFixed(1)}%`
                : `S/ ${Number(v).toLocaleString("es-PE")}`
            }
            height={280}
            minDataPoints={2}
          />
        </DashboardSection>
      ),
    },
    {
      id: "balance-acumulado",
      render: () => (
        <DashboardSection
          chartId="caja.advanced.balance-acumulado"
          hasData={true}
          defaultVisible={false}
kicker="Balance acumulado · rango activo"
          title="Trayectoria de caja (running total)"
          kpis={[
            { label: "Final", value: fmtS(runningBalance.finalAcc), tone: runningBalance.finalAcc >= 0 ? "success" : "warning" },
            { label: "Máximo", value: fmtS(runningBalance.maxAcc), tone: "success" },
            { label: "Mínimo", value: fmtS(runningBalance.minAcc), tone: runningBalance.minAcc >= 0 ? "neutral" : "warning" },
            {
              label: "Rango",
              value: fmtS(runningBalance.maxAcc - runningBalance.minAcc),
              tone: "primary",
            },
          ]}
        >
          <BulejeComposedChart
            data={runningBalance.rows}
            xKey="dia"
            bars={[{ key: "deltaDia", label: "Δ Día", color: "tertiary", yAxis: "left" }]}
            lines={[{ key: "acumulado", label: "Acumulado", color: "primary", yAxis: "right" }]}
            leftAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
            rightAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
            tooltipFormat={(v) => `S/ ${Number(v).toLocaleString("es-PE")}`}
            height={300}
            minDataPoints={2}
          />
        </DashboardSection>
      ),
    },
  ];

  return (
    <DraggableSections
      items={sections}
      storageKey="caja-advanced-order"
      layout="grid"
      gap={4}
      minColumnWidth="22rem"
    />
  );
});
