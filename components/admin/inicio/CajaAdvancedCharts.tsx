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
import { DashboardSection, MicroList } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";
import { coloresFijos, colorDeMetodo, ejeSoles, PAY_LABELS } from "./caja-presentacion";
import { hayDatosEnSerie, hayTendencia, modoRanking, valorConDato } from "@/lib/admin/inicio/hay-datos";
import { cantidad, COLOR_CONCEPTO, fechaCorta, porcentaje, soles, solesEje } from "@/lib/admin/inicio/formato-tablero";

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

/** Ranuras de color del apilado: cada una se fija al color del método con `coloresFijos`. */
const RANURAS_METODO = ["primary", "secondary", "tertiary", "accent", "info"] as const;
const tooltipSoles = (v: number | string) => soles(v);

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** «09 oct» con meses escritos a mano. */
const dayLabel = (dk: string) => fechaCorta(dk);

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
      color: RANURAS_METODO[i % RANURAS_METODO.length],
    }));
    const colores = coloresFijos(
      Object.fromEntries(topMethods.map((m, i) => [RANURAS_METODO[i % RANURAS_METODO.length], colorDeMetodo(m)])),
    );
    return { rows, stacks, methods: topMethods, colores };
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

  // Derivados de presentación (no cambian las cuentas de arriba).
  const modoPareto = modoRanking(pareto.rows, "monto");
  const total14 = metodosStacked.rows.reduce(
    (s, r) => s + metodosStacked.methods.reduce((ss, m) => ss + Number(r[m] ?? 0), 0),
    0,
  );
  const diasConVenta = margenTrend.rows.filter((r) => r.ingresos > 0);
  const mejorMargen = diasConVenta.length ? [...diasConVenta].sort((a, b) => b.margen - a.margen)[0] : null;
  const utilidad14 = margenTrend.rows.reduce((s, r) => s + r.utilidad, 0);
  const coloresUtilidad = coloresFijos({ primary: COLOR_CONCEPTO.utilidad });

  const sections: DraggableItem[] = [
    {
      id: "cash-runway",
      render: () => (
        <DashboardSection
          chartId="caja.advanced.cash-runway"
          hasData={valorConDato(runway.egresos30d)}
          defaultVisible={false}
          kicker="Caja · últimos 30 días"
          title="¿Cuántos días aguantas?"
          description="Lo que quedó en 30 días (entró − salió) dividido entre lo que sale por día. Es una estimación, no el saldo contado de tu caja."
          kpis={[
            {
              label: "Días que aguantas", value: `${cantidad(runway.runwayDias)} días`,
              tone: runway.runwayDias >= 30 ? "success" : runway.runwayDias >= 15 ? "neutral" : "warning",
            },
            { label: "Quedó en 30 días", value: soles(runway.balance), tone: runway.balance < 0 ? "warning" : "success" },
            { label: "Sale por día", value: soles(runway.avgEgresoDia) },
            {
              label: "Por pagar", value: runway.pendientePago > 0 ? soles(runway.pendientePago) : "Al día",
              tone: runway.pendientePago > 0 ? "warning" : "success", hint: "Cuentas por pagar sin cancelar.",
            },
          ]}
        >
          <div className="flex items-center justify-center py-2">
            <BulejeGaugeChart
              value={runway.runwayPct}
              max={100}
              label="Días de caja (60 = lleno)"
              sublabel={
                runway.runwayDias >= 60
                  ? "Más de 60 días"
                  : runway.runwayDias >= 30
                    ? "Vas bien"
                    : runway.runwayDias >= 15
                      ? "Ajustado"
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
      id: "pareto-metodos",
      render: () => (
        <DashboardSection
          chartId="caja.advanced.pareto-metodos"
          hasData={modoPareto !== "oculto"}
          defaultVisible={false}
          kicker="Cobros · últimos 30 días"
          title="Qué métodos concentran tus cobros"
          kpis={[
            { label: "Cobrado en 30 días", value: soles(pareto.total) },
            {
              label: "Métodos para el 80 %", value: `${cantidad(pareto.metodosFor80)} de ${cantidad(pareto.totalMetodos)}`,
              hint: "Cuántos métodos, de mayor a menor, juntan el 80 % de lo cobrado.",
            },
          ]}
        >
          {modoPareto === "grafico" ? (
            <div style={coloresFijos({ primary: COLOR_CONCEPTO.cajaEntra })}>
              <BulejeComposedChart
                data={pareto.rows}
                xKey="metodo"
                bars={[{ key: "monto", label: "Cobrado", color: "primary", yAxis: "left" }]}
                leftAxisFormat={ejeSoles}
                tooltipFormat={tooltipSoles}
                tooltipExtras={(e) => (
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">Acumulado: {porcentaje(Number(e.acumuladoPct), 1)}</p>
                )}
                valueFormat={(v) => solesEje(v)}
                showLegend={false}
                height={260}
                minDataPoints={1}
              />
            </div>
          ) : (
            <MicroList
              items={pareto.rows.map((r) => ({
                name: r.metodo, value: r.monto, label: soles(r.monto),
                sublabel: `acum. ${porcentaje(r.acumuladoPct)}`, color: colorDeMetodo(r.metodo),
              }))}
            />
          )}
        </DashboardSection>
      ),
    },
    {
      id: "metodos-stacked",
      render: () => (
        <DashboardSection
          chartId="caja.advanced.metodos-stacked"
          hasData={hayTendencia(metodosStacked.rows, metodosStacked.methods)}
          defaultVisible={false}
          kicker="Cobros · últimos 14 días"
          title="Cobros por método, día por día"
          kpis={[
            { label: "Cobrado en 14 días", value: soles(total14) },
            { label: "Método top", value: metodosStacked.methods[0] ?? null },
            { label: "Días con cobros", value: cantidad(metodosStacked.rows.length) },
          ]}
        >
          <div style={metodosStacked.colores}>
            <BulejeStackedBar
              data={metodosStacked.rows}
              xKey="day"
              stacks={metodosStacked.stacks}
              yAxisFormat={ejeSoles}
              tooltipFormat={tooltipSoles}
              height={280}
            />
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "comparativa-semana",
      render: () => (
        <DashboardSection
          chartId="caja.advanced.comparativa-semana"
          hasData={hayDatosEnSerie(compSemana, ["current", "previous"])}
          defaultVisible={false}
          kicker="Caja · 7 días vs 7 anteriores"
          title="Lo que quedó: esta semana vs la pasada"
          description="Cada día: lo que entró menos las compras. La línea punteada es la semana pasada."
        >
          <div style={coloresFijos({ primary: COLOR_CONCEPTO.utilidad, tertiary: COLOR_CONCEPTO.anterior })}>
            <BulejeComparisonOverlay
              data={compSemana}
              xKey="day"
              currentKey="current"
              previousKey="previous"
              currentLabel="Esta semana"
              previousLabel="Semana pasada"
              // Su cabecera («Esta semana -S/ 4.2 mil») usa este mismo formato: con «S/».
              yAxisFormat={solesEje}
              tooltipFormat={tooltipSoles}
              height={260}
            />
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "margen-trend",
      render: () => (
        <DashboardSection
          chartId="caja.advanced.margen-trend"
          hasData={hayTendencia(margenTrend.rows, ["utilidad"])}
          defaultVisible={false}
          kicker="Utilidad · últimos 14 días"
          title="Utilidad día a día"
          description="Ventas − costo de lo vendido − compras de cada día. El margen de cada día sale al pasar el mouse."
          kpis={[
            {
              label: "Margen promedio", value: porcentaje(margenTrend.margenProm, 1),
              sinDato: !diasConVenta.length || Math.abs(margenTrend.margenProm) > 999,
              sinDatoHint: "Sin ventas en estos días, o el % es tan grande que no se puede leer.",
              tone: margenTrend.margenProm >= 20 ? "success" : margenTrend.margenProm >= 10 ? "neutral" : "warning",
            },
            {
              label: "Mejor día", value: mejorMargen ? porcentaje(mejorMargen.margen, 1) : null,
              sub: mejorMargen?.dia, tone: "success", sinDatoHint: "Ningún día con ventas en estos 14 días.",
            },
            { label: "Utilidad 14 días", value: soles(utilidad14), tone: utilidad14 < 0 ? "warning" : "success" },
          ]}
        >
          <div style={coloresUtilidad}>
            <BulejeComposedChart
              data={margenTrend.rows}
              xKey="dia"
              // Línea y no barras: con todos los días en negativo el eje del DS
              // ([0, "auto"]) arrancaba en -600 y las barras de -600 medían 0 px.
              lines={[{ key: "utilidad", label: "Utilidad", color: "primary", yAxis: "left" }]}
              leftAxisFormat={ejeSoles}
              tooltipFormat={tooltipSoles}
              tooltipExtras={(e) => (
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {Number(e.ingresos) > 0 ? `Margen: ${porcentaje(Number(e.margen), 1)}` : "Sin ventas ese día"}
                </p>
              )}
              showLegend={false}
              height={260}
            />
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "balance-acumulado",
      render: () => (
        <DashboardSection
          chartId="caja.advanced.balance-acumulado"
          hasData={hayTendencia(runningBalance.rows, ["acumulado"])}
          defaultVisible={false}
          kicker="Caja · últimos 30 días"
          title="Cómo se fue moviendo la caja"
          description="La línea suma día a día lo que entró menos las compras; las barras grises son lo de cada día."
          kpis={[
            { label: "Hoy vas en", value: soles(runningBalance.finalAcc), tone: runningBalance.finalAcc < 0 ? "warning" : "success" },
            { label: "Lo más alto", value: soles(runningBalance.maxAcc) },
            { label: "Lo más bajo", value: soles(runningBalance.minAcc), tone: runningBalance.minAcc < 0 ? "warning" : "neutral" },
          ]}
        >
          <div style={coloresFijos({ primary: COLOR_CONCEPTO.cajaSaldo, tertiary: COLOR_CONCEPTO.anterior })}>
            <BulejeComposedChart
              data={runningBalance.rows}
              xKey="dia"
              bars={[{ key: "deltaDia", label: "Lo del día", color: "tertiary", yAxis: "left" }]}
              lines={[{ key: "acumulado", label: "Acumulado", color: "primary", yAxis: "left" }]}
              leftAxisFormat={ejeSoles}
              tooltipFormat={tooltipSoles}
              showValues={false}
              maxXTicks={10}
              height={280}
            />
          </div>
        </DashboardSection>
      ),
    },
  ];

  return (
    <DraggableSections
      items={sections}
      storageKey="caja-advanced-order"
      layout="grid"
      gap={1}
      minColumnWidth="22rem"
    />
  );
});
