"use client";

/**
 * CajaCharts — charts base del módulo Caja.
 *
 * Rediseñado con DashboardSection + primitivas Buleje DS + DraggableSections.
 *
 * Secciones:
 *  1. Flujo de caja 14d (ComposedChart: ingresos/egresos bars + balance line)
 *  2. Tendencia mensual 6m (ComposedChart: ingresos/egresos bars)
 *  3. Ingresos por hora hoy (ComposedChart con highlight pico)
 *  4. Método de pago (DonutChart + MicroList top-5)
 *  5. Ratio líquido (GaugeChart)
 *  6. Waterfall de flujo (WaterfallChart)
 */

import { useMemo } from "react";
import type { CajaData } from "./CajaDashboard";
import {
  BulejeComposedChart,
  BulejeDonutChart,
  BulejeGaugeChart,
  BulejeWaterfallChart,
  type WaterfallStep,
} from "@/components/ui-system/charts";
import { DashboardSection, MicroList } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";

function fmtS(v: number) {
  return `S/ ${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
}
function fmtS2(v: number) {
  return `S/ ${v.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
}

export default function CajaCharts({ data }: { data: CajaData }) {
  // ── Ratio liquido ─────────────────────────────────────────────────────────
  const ratioLiquido =
    data.ingresos > 0 ? Math.max(0, Math.min(100, (data.balance / data.ingresos) * 100)) : 0;

  // ── Efectivo vs Digital ───────────────────────────────────────────────────
  const efectivoTotal = data.metodosPago
    .filter((m) => m.metodo === "Efectivo")
    .reduce((a, m) => a + m.monto, 0);
  const digitalTotal = data.metodosPago
    .filter((m) => m.metodo !== "Efectivo")
    .reduce((a, m) => a + m.monto, 0);
  const totalIngresos = efectivoTotal + digitalTotal;
  const digitalPct = totalIngresos > 0 ? Math.round((digitalTotal / totalIngresos) * 100) : 0;

  // ── Top 5 por método de pago ─────────────────────────────────────────────
  const top5Metodos = data.metodosPago.slice(0, 5).map((m) => ({
    name: m.metodo,
    value: m.monto,
    label: fmtS(m.monto),
    color: m.color,
  }));

  // ── Hora pico ─────────────────────────────────────────────────────────────
  const horaPico = useMemo(() => {
    return data.ingresosPorHora.reduce(
      (best, h) => (h.monto > best.monto ? h : best),
      { hora: "—", monto: 0 },
    );
  }, [data.ingresosPorHora]);

  // ── Mes ganador / mes peor ───────────────────────────────────────────────
  const mesTop = useMemo(() => {
    const arr = data.flujoMensual.map((m) => ({ ...m, neto: m.ingresos - m.egresos }));
    const top = [...arr].sort((a, b) => b.neto - a.neto)[0];
    const worst = [...arr].sort((a, b) => a.neto - b.neto)[0];
    return { top, worst };
  }, [data.flujoMensual]);

  // ── Mejor/peor día ───────────────────────────────────────────────────────
  const mejorDia = useMemo(() => {
    const arr = data.flujoDiario.map((d) => ({ ...d }));
    const best = [...arr].sort((a, b) => b.balance - a.balance)[0];
    const worst = [...arr].sort((a, b) => a.balance - b.balance)[0];
    return { best, worst };
  }, [data.flujoDiario]);

  // ── Waterfall steps ──────────────────────────────────────────────────────
  const waterfallSteps: WaterfallStep[] = useMemo(() => {
    const steps: WaterfallStep[] = [
      { label: "Inicio", value: 0, type: "baseline" },
    ];
    data.waterfall.forEach((w) => {
      if (w.tipo === "balance") {
        steps.push({ label: w.concepto, value: Math.round(w.monto), type: "total" });
      } else {
        steps.push({
          label: w.concepto,
          value: Math.round(w.monto),
          type: w.monto >= 0 ? "positive" : "negative",
        });
      }
    });
    return steps;
  }, [data.waterfall]);

  const sections: DraggableItem[] = [
    {
      id: "flujo-14d",
      span: "full",
      render: () => (
        <DashboardSection
          chartId="caja.flujo-diario"
          hasData={(data.flujoDiario ?? []).some((d) => (d.ingresos ?? 0) > 0 || (d.egresos ?? 0) > 0)}
          kicker="Flujo diario · rango activo"
          title="Ingresos, egresos y balance"
          kpis={[
            { label: "Mejor día", value: mejorDia.best?.dia ?? "—", tone: "success" },
            { label: "Balance mejor día", value: fmtS(mejorDia.best?.balance ?? 0), tone: "success" },
            { label: "Peor día", value: mejorDia.worst?.dia ?? "—", tone: "warning" },
            { label: "Balance peor día", value: fmtS(mejorDia.worst?.balance ?? 0), tone: "warning" },
          ]}
        >
          <BulejeComposedChart
            data={data.flujoDiario}
            xKey="dia"
            bars={[
              { key: "ingresos", label: "Ingresos", color: "primary", yAxis: "left" },
              { key: "egresos", label: "Egresos", color: "amber", yAxis: "left" },
            ]}
            lines={[{ key: "balance", label: "Balance", color: "accent", yAxis: "right" }]}
            leftAxisFormat={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            rightAxisFormat={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            tooltipFormat={(v) => fmtS(Number(v))}
            height={320}
            minDataPoints={2}
          />
        </DashboardSection>
      ),
    },
    {
      id: "tendencia-mensual",
      span: "full",
      render: () => (
        <DashboardSection
          chartId="caja.tendencia-mensual"
          hasData={(data.flujoMensual ?? []).length > 0}
          kicker="Tendencia · rango activo"
          title="Ingresos y egresos por mes"
          kpis={[
            { label: "Mejor mes", value: mesTop.top?.mes ?? "—", tone: "success" },
            { label: "Neto mejor mes", value: fmtS(mesTop.top?.neto ?? 0), tone: "success" },
            { label: "Peor mes", value: mesTop.worst?.mes ?? "—", tone: "warning" },
            { label: "Neto peor mes", value: fmtS(mesTop.worst?.neto ?? 0), tone: "warning" },
          ]}
        >
          <BulejeComposedChart
            data={data.flujoMensual}
            xKey="mes"
            bars={[
              { key: "ingresos", label: "Ingresos", color: "primary", yAxis: "left" },
              { key: "egresos", label: "Egresos", color: "amber", yAxis: "left" },
            ]}
            leftAxisFormat={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            tooltipFormat={(v) => fmtS(Number(v))}
            height={280}
            minDataPoints={2}
          />
        </DashboardSection>
      ),
    },
    {
      id: "ingresos-por-hora",
      render: () => (
        <DashboardSection
          chartId="caja.ingresos-por-hora"
          hasData={true}
          kicker="Ingresos hoy · por hora"
          title="Distribución horaria de cobros"
          description="Cobros por hora del día."
          kpis={[
            { label: "Hora pico", value: horaPico.hora, tone: "success" },
            { label: "Pico S/", value: fmtS(horaPico.monto), tone: "primary" },
            {
              label: "Horas activas",
              value: String(data.ingresosPorHora.filter((h) => h.monto > 0).length),
              tone: "neutral",
            },
            {
              label: "Promedio/hora",
              value: fmtS(
                data.ingresosPorHora.reduce((s, h) => s + h.monto, 0) /
                  Math.max(1, data.ingresosPorHora.filter((h) => h.monto > 0).length || 1),
              ),
              tone: "neutral",
            },
          ]}
        >
          <BulejeComposedChart
            data={data.ingresosPorHora}
            xKey="hora"
            bars={[{ key: "monto", label: "Monto S/", color: "primary", yAxis: "left" }]}
            leftAxisFormat={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            tooltipFormat={(v) => fmtS(Number(v))}
            height={260}
            showLegend={false}
            minDataPoints={3}
          />
        </DashboardSection>
      ),
    },
    {
      id: "metodo-pago",
      render: () => (
        <DashboardSection
          chartId="caja.metodo-pago"
          hasData={true}
          defaultVisible={false}
          kicker="Cobros por método"
          title="Composición de ingresos"
          description="Mix de cobros por método."
          kpis={[
            {
              label: "Líder",
              value: data.metodosPago[0]?.metodo ?? "—",
              tone: "success",
            },
            {
              label: "Share líder",
              value: `${(data.metodosPago[0]?.porcentaje ?? 0).toFixed(0)}%`,
              tone: "primary",
            },
            {
              label: "% Digital",
              value: `${digitalPct}%`,
              tone: digitalPct >= 50 ? "success" : "neutral",
            },
            {
              label: "% Efectivo",
              value: `${100 - digitalPct}%`,
              tone: "neutral",
            },
          ]}
        >
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-center">
            <div className="lg:col-span-2">
              <BulejeDonutChart
                data={data.metodosPago.map((m) => ({ name: m.metodo, value: m.monto }))}
                height={220}
                format={(v) => fmtS(Number(v))}
                label={
                  <div className="text-center">
                    <p className="text-[length:var(--ts-3xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                      Top
                    </p>
                    <p className="text-lg font-extrabold text-[var(--text-primary)]">
                      {(data.metodosPago[0]?.porcentaje ?? 0).toFixed(0)}%
                    </p>
                    <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
                      {data.metodosPago[0]?.metodo ?? ""}
                    </p>
                  </div>
                }
              />
            </div>
            <div className="lg:col-span-3">
              <MicroList items={top5Metodos} barColor="var(--brand-primary)" showRank />
            </div>
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "ratio-liquido",
      render: () => (
        <DashboardSection
          chartId="caja.ratio-liquido"
          hasData={true}
          defaultVisible={false}
          kicker="Salud financiera · periodo"
          title="Ratio líquido (balance / ingresos)"
          kpis={[
            { label: "Balance", value: fmtS(data.balance), tone: data.balance >= 0 ? "success" : "warning" },
            { label: "Ingresos", value: fmtS(data.ingresos), tone: "primary" },
            { label: "Egresos", value: fmtS(data.egresos), tone: "warning" },
            {
              label: "Ratio",
              value: `${ratioLiquido.toFixed(0)}%`,
              tone: ratioLiquido >= 30 ? "success" : ratioLiquido >= 10 ? "primary" : "warning",
            },
          ]}
        >
          <div className="flex items-center justify-center py-2">
            <BulejeGaugeChart
              value={ratioLiquido}
              max={100}
              label="Salud líquida"
              sublabel={
                ratioLiquido >= 30
                  ? "Salud buena"
                  : ratioLiquido >= 10
                    ? "Vigilar gastos"
                    : "Atención: gastos altos"
              }
              format="percentage"
              size={260}
            />
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "waterfall-flujo",
      render: () => (
        <DashboardSection
          chartId="caja.waterfall-flujo"
          hasData={true}
          defaultVisible={false}
          kicker="Descomposición · periodo"
          title="De ventas a balance neto"
          description="De ventas a utilidad neta paso a paso."
          kpis={[
            { label: "Utilidad neta", value: fmtS(data.utilidadNeta), tone: data.utilidadNeta >= 0 ? "success" : "warning" },
            {
              label: "Margen neto",
              value: `${Number(data.margenNeto).toFixed(1)}%`,
              tone: data.margenNeto >= 15 ? "success" : data.margenNeto >= 5 ? "primary" : "warning",
            },
            { label: "Tickets", value: String(data.ticketsTotal), tone: "neutral" },
            {
              label: "Ticket prom.",
              value: fmtS2(data.ticketsTotal > 0 ? data.ingresos / data.ticketsTotal : 0),
              tone: "primary",
            },
          ]}
        >
          <BulejeWaterfallChart steps={waterfallSteps} currency="S/" height={280} />
        </DashboardSection>
      ),
    },
  ];

  return (
    <DraggableSections
      items={sections}
      storageKey="caja-base-order"
      layout="grid"
      gap={4}
      minColumnWidth="22rem"
    />
  );
}
