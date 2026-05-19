"use client";

/**
 * ComprasAdvancedCharts — charts especializados del módulo Compras.
 *
 * 1. Pareto de proveedores (concentración 80/20)
 * 2. Salud de cuentas (Gauge % no vencido)
 * 3. Comparativa año actual vs pasado (mensual)
 * 4. Mix de compras por proveedor (stacked 14d)
 * 5. Waterfall de deuda (inicio + nuevas - pagadas = actual)
 * 6. Comparativa semanal compras (esta sem vs pasada)
 */

import { memo, useMemo } from "react";
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

type Purchase = {
  id: string | number;
  supplierId?: string | number;
  supplierName?: string;
  total: number;
  createdAt?: string;
  paid?: boolean;
  status?: string;
};
type Payable = {
  id: string | number;
  supplierId?: string | number;
  supplierName?: string;
  amount: number;
  paidAmount?: number;
  status?: string;
  dueDate?: string;
  createdAt?: string;
};

const PROV_COLOR_KEYS = ["primary", "secondary", "tertiary", "quaternary", "accent", "amber", "purple", "info"] as const;

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayLabel(dk: string) {
  return new Date(dk + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

export const ComprasAdvancedCharts = memo(function ComprasAdvancedCharts() {
  const { data } = useDashboardData();

  const purchases = (data?.purchases ?? []) as Purchase[];
  const payables = (data?.payables ?? []) as Payable[];

  // ── 1. PARETO DE PROVEEDORES ─────────────────────────────────────────────
  const pareto = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- pre-existente: Date.now() en useMemo, React Compiler eslint plugin
    const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const m = new Map<string, number>();
    purchases
      .filter((p) => p.createdAt && new Date(p.createdAt).getTime() >= last30)
      .forEach((p) => {
        const k = p.supplierName ?? "Sin proveedor";
        m.set(k, (m.get(k) ?? 0) + Number(p.total ?? 0));
      });
    const sorted = Array.from(m.entries()).sort(([, a], [, b]) => b - a);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    let acc = 0;
    const rows = sorted.slice(0, 15).map(([prov, monto]) => {
      acc += monto;
      return {
        proveedor: prov.length > 14 ? prov.slice(0, 13) + "…" : prov,
        monto: Math.round(monto),
        acumuladoPct: total > 0 ? Math.round((acc / total) * 1000) / 10 : 0,
      };
    });
    const pct80 = rows.findIndex((r) => r.acumuladoPct >= 80);
    const provsFor80 = pct80 >= 0 ? pct80 + 1 : rows.length;
    return { rows, total: Math.round(total), provsFor80, totalProvs: sorted.length };
  }, [purchases]);

  // ── 2. SALUD DE CUENTAS (Gauge) ──────────────────────────────────────────
  const salud = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- pre-existente: Date.now() en useMemo, React Compiler eslint plugin
    const now = Date.now();
    const active = payables.filter((p) => p.status !== "pagado");
    if (active.length === 0) return { pct: 100, ok: 0, urgente: 0, vencidas: 0, total: 0 };
    const vencidas = active.filter((p) => p.dueDate && new Date(p.dueDate).getTime() < now).length;
    const urgente = active.filter((p) => {
      if (!p.dueDate) return false;
      const t = new Date(p.dueDate).getTime();
      return t >= now && t < now + 7 * 24 * 60 * 60 * 1000;
    }).length;
    const ok = active.length - vencidas - urgente;
    const pct = Math.round((ok / active.length) * 100);
    return { pct, ok, urgente, vencidas, total: active.length };
  }, [payables]);

  // ── 3. COMPARATIVA AÑO ACTUAL VS PASADO (últimos 12 meses) ─────────────
  const compAnual = useMemo(() => {
    const now = new Date();
    const rows: Array<{ mes: string; actual: number; anterior: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const prevStart = new Date(mStart.getFullYear() - 1, mStart.getMonth(), 1);
      const prevEnd = new Date(mStart.getFullYear() - 1, mStart.getMonth() + 1, 0, 23, 59, 59);
      const actual = purchases
        .filter((p) => p.createdAt && new Date(p.createdAt) >= mStart && new Date(p.createdAt) <= mEnd)
        .reduce((s, p) => s + Number(p.total ?? 0), 0);
      const anterior = purchases
        .filter((p) => p.createdAt && new Date(p.createdAt) >= prevStart && new Date(p.createdAt) <= prevEnd)
        .reduce((s, p) => s + Number(p.total ?? 0), 0);
      rows.push({
        mes: mStart.toLocaleDateString("es-PE", { month: "short" }),
        actual: Math.round(actual),
        anterior: Math.round(anterior),
      });
    }
    const totalActual = rows.reduce((s, r) => s + r.actual, 0);
    const totalAnterior = rows.reduce((s, r) => s + r.anterior, 0);
    const delta = totalActual - totalAnterior;
    const deltaPct = totalAnterior > 0 ? Math.round((delta / totalAnterior) * 100) : 0;
    return { rows, totalActual, totalAnterior, delta, deltaPct };
  }, [purchases]);

  // ── 4. MIX DE COMPRAS POR PROVEEDOR (stacked 14d) ──────────────────────
  const mixProv = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- pre-existente: Date.now() en useMemo, React Compiler eslint plugin
    const last14 = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const byDate = new Map<string, Map<string, number>>();
    const add = (iso: string, prov: string, amount: number) => {
      if (new Date(iso).getTime() < last14) return;
      const k = dayKey(iso);
      if (!byDate.has(k)) byDate.set(k, new Map());
      const inner = byDate.get(k)!;
      inner.set(prov, (inner.get(prov) ?? 0) + amount);
    };
    purchases
      .filter((p) => p.createdAt)
      .forEach((p) => add(p.createdAt!, p.supplierName ?? "Sin proveedor", Number(p.total ?? 0)));
    const totals = new Map<string, number>();
    byDate.forEach((inner) => inner.forEach((v, prov) => totals.set(prov, (totals.get(prov) ?? 0) + v)));
    const topProvs = Array.from(totals.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([p]) => p);
    const days = Array.from(byDate.keys()).sort();
    const rows = days.map((k) => {
      const inner = byDate.get(k)!;
      const row: Record<string, string | number> = { day: dayLabel(k) };
      topProvs.forEach((prov) => {
        row[prov] = Math.round(inner.get(prov) ?? 0);
      });
      return row;
    });
    const stacks = topProvs.map((prov, i) => ({
      key: prov,
      label: prov.length > 14 ? prov.slice(0, 13) + "…" : prov,
      color: PROV_COLOR_KEYS[i % PROV_COLOR_KEYS.length],
    }));
    return { rows, stacks, topProvs };
  }, [purchases]);

  // ── 5. WATERFALL DE DEUDA ────────────────────────────────────────────────
  const waterfall = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- pre-existente: Date.now() en useMemo, React Compiler eslint plugin
    const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const deudaActual = payables
      .filter((p) => p.status !== "pagado")
      .reduce((s, p) => s + (Number(p.amount ?? 0) - Number(p.paidAmount ?? 0)), 0);
    // Nueva deuda (cuentas creadas en 30d, sin importar status)
    const nuevaDeuda = payables
      .filter((p) => p.createdAt && new Date(p.createdAt).getTime() >= last30)
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);
    // Deuda pagada (paidAmount suma en 30d)
    const pagado = payables
      .filter((p) => p.createdAt && new Date(p.createdAt).getTime() >= last30)
      .reduce((s, p) => s + Number(p.paidAmount ?? 0), 0);
    // Deuda inicial estimada
    const deudaInicio = Math.max(0, deudaActual - nuevaDeuda + pagado);
    const steps: WaterfallStep[] = [
      { label: "Deuda hace 30d", value: Math.round(deudaInicio), type: "baseline" },
      { label: "Nuevas cuentas", value: Math.round(nuevaDeuda), type: "positive" },
      { label: "Pagos realizados", value: -Math.round(pagado), type: "negative" },
      { label: "Deuda actual", value: Math.round(deudaActual), type: "total" },
    ];
    const delta = deudaActual - deudaInicio;
    return {
      steps,
      deudaActual: Math.round(deudaActual),
      deudaInicio: Math.round(deudaInicio),
      nuevaDeuda: Math.round(nuevaDeuda),
      pagado: Math.round(pagado),
      delta: Math.round(delta),
    };
  }, [payables]);

  // ── 6. COMPARATIVA SEMANAL COMPRAS ───────────────────────────────────────
  const comp = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- pre-existente: Date.now() en useMemo, React Compiler eslint plugin
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
    purchases
      .filter((p) => p.createdAt)
      .forEach((p) => {
        const b = bucket(p.createdAt!);
        if (!b) return;
        buckets[b.idx][b.isCurrent ? "current" : "previous"] += Number(p.total ?? 0);
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
  }, [purchases]);

  const fmtS = (v: number) => `S/ ${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;

  const sections: DraggableItem[] = [
    {
      id: "pareto-proveedores",
      span: "full",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="Pareto · proveedores · rango activo"
          title="Concentración del gasto (80/20)"
          kpis={[
            { label: "Compras 30d", value: fmtS(pareto.total), tone: "primary" },
            { label: "Prov. para 80%", value: String(pareto.provsFor80), tone: "success" },
            { label: "Prov. totales", value: String(pareto.totalProvs), tone: "neutral" },
            {
              label: "Líder",
              value: pareto.rows[0]?.proveedor ?? "—",
              tone: "success",
            },
          ]}
        >
          <BulejeComposedChart
            data={pareto.rows}
            xKey="proveedor"
            bars={[{ key: "monto", label: "Monto S/", color: "primary", yAxis: "left" }]}
            lines={[
              { key: "acumuladoPct", label: "Acumulado %", color: "accent", yAxis: "right" },
            ]}
            leftAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
            rightAxisFormat={(v) => `${v}%`}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("acumulado")
                ? `${Number(v).toFixed(1)}%`
                : fmtS(Number(v))
            }
            height={320}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
    {
      id: "salud-cuentas",
      render: () => (
        <DashboardSection
          chartId="compras.advanced.salud-cuentas"
          hasData={true}
          defaultVisible={false}
kicker="Salud de cuentas · estado al día"
          title="Porcentaje de cuentas sin problemas"
          kpis={[
            { label: "OK (>7d)", value: String(salud.ok), tone: "success" },
            {
              label: "Urgentes (<7d)",
              value: String(salud.urgente),
              tone: salud.urgente > 0 ? "primary" : "success",
            },
            {
              label: "Vencidas",
              value: String(salud.vencidas),
              tone: salud.vencidas > 0 ? "warning" : "success",
            },
            { label: "Total activas", value: String(salud.total), tone: "neutral" },
          ]}
        >
          <div className="flex items-center justify-center py-2">
            <BulejeGaugeChart
              value={salud.pct}
              max={100}
              label="Salud de cuentas"
              sublabel={
                salud.pct >= 90
                  ? "Excelente"
                  : salud.pct >= 70
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
      id: "comparativa-anual",
      span: "full",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="Compras · 12 meses"
          title="Año actual vs año pasado"
          kpis={[
            { label: "Actual 12m", value: fmtS(compAnual.totalActual), tone: "primary" },
            { label: "Anterior 12m", value: fmtS(compAnual.totalAnterior), tone: "neutral" },
            {
              label: "Δ absoluto",
              value: `${compAnual.delta >= 0 ? "+" : ""}${fmtS(Math.abs(compAnual.delta))}`,
              tone: compAnual.delta >= 0 ? "warning" : "success",
            },
            {
              label: "Δ %",
              value: `${compAnual.deltaPct >= 0 ? "+" : ""}${compAnual.deltaPct}%`,
              tone: compAnual.deltaPct >= 0 ? "warning" : "success",
            },
          ]}
        >
          <BulejeComparisonOverlay
            data={compAnual.rows}
            xKey="mes"
            currentKey="actual"
            previousKey="anterior"
            currentLabel="Este año"
            previousLabel="Año pasado"
            yAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
            tooltipFormat={(v) => fmtS(Number(v))}
            height={280}
          />
        </DashboardSection>
      ),
    },
    {
      id: "mix-proveedores",
      render: () => (
        <DashboardSection
          chartId="compras.advanced.mix-proveedores"
          hasData={true}
          defaultVisible={false}
kicker="Mix de compras · rango activo"
          title="Composición diaria por proveedor top-5"
          kpis={[
            { label: "Días con data", value: String(mixProv.rows.length), tone: "neutral" },
            { label: "Proveedores", value: String(mixProv.topProvs.length), tone: "neutral" },
            {
              label: "Prov. líder",
              value: (mixProv.topProvs[0] ?? "—").slice(0, 18),
              tone: "success",
            },
            {
              label: "Total 14d",
              value: fmtS(
                mixProv.rows.reduce(
                  (s, r) =>
                    s + mixProv.topProvs.reduce((ss, p) => ss + Number(r[p] ?? 0), 0),
                  0,
                ),
              ),
              tone: "primary",
            },
          ]}
        >
          {mixProv.rows.length > 0 ? (
            <BulejeStackedBar
              data={mixProv.rows}
              xKey="day"
              stacks={mixProv.stacks}
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
      id: "waterfall-deuda",
      span: "full",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="Δ Deuda · rango activo"
          title="De deuda inicial a deuda actual"
          kpis={[
            { label: "Deuda inicio", value: fmtS(waterfall.deudaInicio), tone: "neutral" },
            { label: "Nuevas", value: fmtS(waterfall.nuevaDeuda), tone: "warning" },
            { label: "Pagadas", value: fmtS(waterfall.pagado), tone: "success" },
            {
              label: "Deuda actual",
              value: fmtS(waterfall.deudaActual),
              tone: waterfall.delta <= 0 ? "success" : "warning",
            },
          ]}
        >
          <BulejeWaterfallChart steps={waterfall.steps} currency="S/" height={280} />
        </DashboardSection>
      ),
    },
    {
      id: "comparativa-semana",
      render: () => (
        <DashboardSection
          chartId="compras.advanced.comparativa-semana"
          hasData={true}
          defaultVisible={false}
kicker="Comparativa · compras semana a semana"
          title="Esta semana vs semana pasada"
        >
          <BulejeComparisonOverlay
            data={comp}
            xKey="day"
            currentKey="current"
            previousKey="previous"
            currentLabel="Esta semana"
            previousLabel="Semana pasada"
            yAxisFormat={(v) => `S/${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`}
            tooltipFormat={(v) => fmtS(Number(v))}
            height={280}
          />
        </DashboardSection>
      ),
    },
  ];

  return <DraggableSections items={sections} storageKey="compras-advanced-order" layout="grid" />;
});
