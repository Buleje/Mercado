"use client";

/**
 * VentasCharts — charts base del módulo Ventas.
 *
 * Rediseñado con el pattern Section + primitivas Buleje DS para consistencia
 * total con Resumen y VentasAdvancedCharts.
 *
 * Secciones:
 *  1. Ventas y Utilidad 14d (ComposedChart)
 *  2. Ventas por día de semana (ComposedChart con bars highlighted)
 *  3. Ventas por hora (ComposedChart)
 *  4. Método de pago (DonutChart)
 *  5. Meta del periodo (GaugeChart)
 *  6. Pronóstico 7 días (BarChart)
 *
 * Todas las secciones van dentro de un DraggableSections wrapper.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { VentasData } from "./VentasDashboard";
import {
  BulejeComposedChart,
  BulejeDonutChart,
  BulejeGaugeChart,
  BulejeBarChart,
} from "@/components/ui-system/charts";
import { DashboardSection, MicroList } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";

function fmtS(v: number) {
  return `S/ ${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
}

export default function VentasCharts({ data }: { data: VentasData }) {
  // ── Meta del periodo ──────────────────────────────────────────────────────
  const metaMes =
    data.ventasNetas > 0
      ? Math.max(data.ventasNetas * 1.2, data.ventasNetas + 500)
      : 1000;
  const pctMeta = metaMes > 0 ? (data.ventasNetas / metaMes) * 100 : 0;
  const faltaMeta = Math.max(0, metaMes - data.ventasNetas);

  // ── Top 5 método de pago ──────────────────────────────────────────────────
  const top5 = data.metodosPago.slice(0, 5).map((p) => ({
    name: p.metodo,
    value: p.total,
    label: fmtS(p.total),
    color: p.color,
  }));

  // ── Ventas por día: detectar el día con más ventas para destacarlo ───────
  const maxDowIdx = useMemo(() => {
    let idx = -1;
    let max = 0;
    data.ventasPorDia.forEach((d, i) => {
      if (d.total > max) {
        max = d.total;
        idx = i;
      }
    });
    return idx;
  }, [data.ventasPorDia]);

  const maxDowDay = maxDowIdx >= 0 ? data.ventasPorDia[maxDowIdx].dia : "—";
  const maxDowValue = maxDowIdx >= 0 ? data.ventasPorDia[maxDowIdx].total : 0;

  // ── Ventas por hora: pico del día de hoy ─────────────────────────────────
  const horaPicoObj = useMemo(() => {
    return data.ventasPorHora.reduce(
      (best, h) => (h.monto > best.monto ? h : best),
      { hora: "—", ventas: 0, monto: 0 },
    );
  }, [data.ventasPorHora]);

  // ── Secciones ────────────────────────────────────────────────────────────
  const sections: DraggableItem[] = [
    {
      id: "ventas-utilidad-14d",
      render: () => (
        <DashboardSection
          chartId="ventas.utilidad-promedio"
          hasData={(data.ventasDiarias ?? []).length >= 3 && (data.ventasDiarias ?? []).some((d) => (d.ventas ?? 0) > 0)}
          kicker="Evolución · rango activo"
          title="Ventas, utilidad y promedio móvil"
          rightSlot={
            data.wowGrowth != null && (
              <span
                className={cn(
                  "text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap",
                  data.wowGrowth >= 0
                    ? "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)]"
                    : "bg-[var(--data-error-50)] text-[var(--data-error-500)] dark:bg-red-950/30",
                )}
              >
                {data.wowGrowth >= 0 ? "↑" : "↓"} {Math.abs(data.wowGrowth).toFixed(1)}% sem/sem
              </span>
            )
          }
          kpis={[
            { label: "Ventas periodo", value: fmtS(data.ventasNetas), tone: "primary" },
            { label: "Utilidad bruta", value: fmtS(data.utilidadBruta), tone: "success" },
            { label: "Margen", value: `${Number(data.margen).toFixed(1)}%`, tone: data.margen >= 25 ? "success" : data.margen >= 15 ? "neutral" : "warning" },
            { label: "Tickets", value: String(data.tickets), tone: "neutral" },
          ]}
        >
          <BulejeComposedChart
            data={data.ventasDiarias}
            xKey="dia"
            bars={[{ key: "ventas", label: "Ventas S/", color: "primary", yAxis: "left" }]}
            areas={[
              { key: "utilidad", label: "Utilidad S/", color: "tertiary", yAxis: "left", opacity: 0.2 },
            ]}
            lines={[{ key: "promedio7d", label: "Prom. 7d", color: "amber", yAxis: "left" }]}
            leftAxisFormat={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            tooltipFormat={(v) => fmtS(Number(v))}
            height={320}
            minDataPoints={2}
          />
        </DashboardSection>
      ),
    },
    {
      id: "ventas-por-dia-semana",
      render: () => (
        <DashboardSection
          chartId="ventas.por-dia-semana"
          hasData={(data.ventasPorDia ?? []).some((d) => (d.total ?? 0) > 0)}
          kicker="Día de la semana · periodo"
          title="Distribución por día · L a D"
          kpis={[
            { label: "Día ganador", value: maxDowDay, tone: "success" },
            { label: "Ingreso día ganador", value: fmtS(maxDowValue), tone: "primary" },
            {
              label: "Días activos",
              value: String(data.ventasPorDia.filter((d) => d.total > 0).length),
              tone: "neutral",
            },
            {
              label: "Promedio día",
              value: fmtS(
                data.ventasPorDia.reduce((s, d) => s + d.total, 0) /
                  Math.max(1, data.ventasPorDia.filter((d) => d.total > 0).length || 1),
              ),
              tone: "neutral",
            },
          ]}
        >
          <BulejeComposedChart
            data={data.ventasPorDia}
            xKey="dia"
            bars={[{ key: "total", label: "Ventas S/", color: "primary", yAxis: "left" }]}
            leftAxisFormat={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            tooltipFormat={(v) => fmtS(Number(v))}
            height={260}
            showLegend={false}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
    {
      id: "ventas-por-hora",
      render: () => (
        <DashboardSection
          chartId="ventas.por-hora"
          hasData={(data.ventasPorHora ?? []).some((d) => (d.monto ?? 0) > 0)}
          kicker="Horario · hoy"
          title="Volumen de tickets y monto por hora"
          kpis={[
            { label: "Hora pico", value: horaPicoObj.hora, tone: "success" },
            { label: "Monto hora pico", value: fmtS(horaPicoObj.monto), tone: "primary" },
            { label: "Tickets hora pico", value: String(horaPicoObj.ventas), tone: "neutral" },
            {
              label: "Total hoy",
              value: fmtS(data.ventasHoy),
              tone: data.ventasHoy >= data.ventasAyer ? "success" : "warning",
            },
          ]}
        >
          <BulejeComposedChart
            data={data.ventasPorHora}
            xKey="hora"
            bars={[{ key: "ventas", label: "Tickets", color: "tertiary", yAxis: "left" }]}
            lines={[{ key: "monto", label: "Monto S/", color: "primary", yAxis: "right" }]}
            leftAxisFormat={(v) => v.toString()}
            rightAxisFormat={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("monto")
                ? fmtS(Number(v))
                : Number(v).toString()
            }
            height={260}
            minDataPoints={3}
          />
        </DashboardSection>
      ),
    },
    {
      id: "metodo-pago",
      render: () => (
        <DashboardSection
          chartId="ventas.metodo-pago"
          hasData={(data.metodosPago ?? []).some((m) => (m.total ?? 0) > 0)}
          kicker="Distribución de cobros"
          title="Método de pago"
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
              label: "Métodos usados",
              value: String(data.metodosPago.length),
              tone: "neutral",
            },
            {
              label: "Total cobrado",
              value: fmtS(data.metodosPago.reduce((s, p) => s + p.total, 0)),
              tone: "primary",
            },
          ]}
        >
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-center">
            <div className="lg:col-span-2">
              <BulejeDonutChart
                data={data.metodosPago.map((p) => ({ name: p.metodo, value: p.total }))}
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
              <MicroList items={top5} barColor="var(--brand-primary)" showRank />
            </div>
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "meta-periodo",
      render: () => (
        <DashboardSection
          chartId="ventas.meta-periodo"
          hasData={(data.ventasNetas ?? 0) > 0}
          kicker="Objetivo vs real · periodo"
          title="Meta del periodo"
          kpis={[
            { label: "Meta", value: fmtS(metaMes), tone: "neutral" },
            { label: "Alcanzado", value: fmtS(data.ventasNetas), tone: "primary" },
            {
              label: "Progreso",
              value: `${pctMeta.toFixed(0)}%`,
              tone: pctMeta >= 100 ? "success" : pctMeta >= 60 ? "primary" : "warning",
            },
            {
              label: pctMeta >= 100 ? "Excedente" : "Falta",
              value: fmtS(pctMeta >= 100 ? data.ventasNetas - metaMes : faltaMeta),
              tone: pctMeta >= 100 ? "success" : "warning",
            },
          ]}
        >
          <div className="flex items-center justify-center py-2">
            <BulejeGaugeChart
              value={Math.min(100, pctMeta)}
              label="Avance del objetivo"
              sublabel={pctMeta >= 100 ? "Meta superada" : `Faltan ${fmtS(faltaMeta)}`}
              format="percentage"
              size={260}
            />
          </div>
        </DashboardSection>
      ),
    },
  ];

  if (data.forecast7.length > 0 && data.forecast7.some((f) => f.estimado > 0)) {
    const totalForecast = data.forecast7.reduce((s, f) => s + f.estimado, 0);
    const promForecast = totalForecast / Math.max(1, data.forecast7.length);
    sections.push({
      id: "forecast-7d",
      render: () => (
        <DashboardSection
          chartId="ventas.forecast-7d"
          hasData={(data.forecast7 ?? []).length > 0}
          kicker="Tendencia lineal · próximos 7 días"
          title="Pronóstico de ventas"
          kpis={[
            { label: "Proyectado 7d", value: fmtS(totalForecast), tone: "primary" },
            { label: "Prom. día", value: fmtS(promForecast), tone: "neutral" },
            {
              label: "Máx. día",
              value: fmtS(Math.max(...data.forecast7.map((f) => f.estimado))),
              tone: "success",
            },
            {
              label: "Mín. día",
              value: fmtS(Math.min(...data.forecast7.map((f) => f.estimado))),
              tone: "warning",
            },
          ]}
        >
          <BulejeBarChart
            data={data.forecast7}
            xKey="dia"
            series={[{ key: "estimado", label: "Estimado S/" }]}
            format={(v) => fmtS(Number(v))}
            height={220}
          />
        </DashboardSection>
      ),
    });
  }

  return <DraggableSections items={sections} storageKey="ventas-base-order" layout="grid" />;
}
