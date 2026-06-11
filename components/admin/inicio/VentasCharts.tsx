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
import { Flame, TrendingUp, TrendingDown, Sparkles } from "@buleje/design-system/icons";

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
      render: () => {
        const activos = data.ventasPorDia.filter((d) => d.total > 0);
        const promedio = data.ventasPorDia[0]?.promedio ?? 0;
        // Inyectamos campos derivados para el tooltip rico:
        //  - _vsAvg: % vs promedio (positivo = arriba, negativo = abajo)
        //  - _vsPrev: % vs periodo previo
        //  - tendencia: alias de total para dibujar la línea de subida/bajada
        const dataEnriched = data.ventasPorDia.map((d) => {
          const vsAvg = promedio > 0 ? ((d.total - promedio) / promedio) * 100 : 0;
          const vsPrev = d.prev > 0 ? ((d.total - d.prev) / d.prev) * 100 : 0;
          return { ...d, _vsAvg: vsAvg, _vsPrev: vsPrev, tendencia: d.total };
        });
        const hasPrev = data.ventasPorDia.some((d) => d.prev > 0);
        return (
          <DashboardSection
            chartId="ventas.por-dia-semana"
            hasData={(data.ventasPorDia ?? []).some((d) => (d.total ?? 0) > 0)}
            kicker={`Día de la semana · ${data.dateRangeLabel}`}
            title="Distribución por día · Lun a Dom"
            kpis={[
              { label: "Día ganador", value: maxDowDay, tone: "success" },
              { label: "Ingreso día ganador", value: fmtS(maxDowValue), tone: "primary" },
              {
                label: "Días activos",
                value: String(activos.length),
                tone: "neutral",
              },
              {
                label: "Promedio día",
                value: fmtS(promedio),
                tone: "neutral",
              },
            ]}
          >
            <BulejeComposedChart
              data={dataEnriched}
              xKey="dia"
              bars={
                hasPrev
                  ? [
                      { key: "total", label: "Periodo actual S/", color: "primary", yAxis: "left" },
                      { key: "prev", label: "Periodo previo S/", color: "tertiary", yAxis: "left" },
                    ]
                  : [{ key: "total", label: "Ventas S/", color: "primary", yAxis: "left" }]
              }
              lines={[
                { key: "tendencia", label: "Tendencia", color: "accent", yAxis: "left" },
                { key: "promedio", label: "Promedio", color: "amber", yAxis: "left" },
              ]}
              referenceAreas={
                data.weekendBand
                  ? [{ x1: data.weekendBand.x1, x2: data.weekendBand.x2, fillKey: "amber", opacity: 0.07 }]
                  : []
              }
              tooltipExtras={(entry) => {
                const vsAvg = Number(entry._vsAvg);
                const vsPrev = Number(entry._vsPrev);
                const isWeekend = Boolean(entry.isWeekend);
                const total = Number(entry.total);
                if (total === 0) {
                  return <span className="text-[var(--text-tertiary)]">Sin ventas registradas</span>;
                }
                return (
                  <div className="space-y-1.5">
                    {Number.isFinite(vsAvg) && Math.abs(vsAvg) >= 1 && (
                      <div className="flex items-center gap-1.5">
                        {vsAvg >= 0 ? (
                          <TrendingUp className="h-3.5 w-3.5 text-[color:var(--data-success-500)]" strokeWidth={2.5} />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 text-[color:var(--data-warning-500)]" strokeWidth={2.5} />
                        )}
                        <span className={vsAvg >= 0 ? "text-[color:var(--data-success-500)] font-bold" : "text-[color:var(--data-warning-500)] font-bold"}>
                          {vsAvg >= 0 ? "+" : ""}{vsAvg.toFixed(0)}% vs promedio
                        </span>
                      </div>
                    )}
                    {Number.isFinite(vsPrev) && Math.abs(vsPrev) >= 1 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[var(--text-tertiary)]">vs periodo previo:</span>
                        <span className={vsPrev >= 0 ? "text-[color:var(--data-success-500)] font-bold" : "text-[color:var(--data-warning-500)] font-bold"}>
                          {vsPrev >= 0 ? "+" : ""}{vsPrev.toFixed(0)}%
                        </span>
                      </div>
                    )}
                    {isWeekend && (
                      <div className="text-[color:var(--data-warning-500)] font-bold uppercase tracking-wider text-[10px]">
                        Fin de semana
                      </div>
                    )}
                  </div>
                );
              }}
              leftAxisFormat={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              tooltipFormat={(v) => fmtS(Number(v))}
              height={300}
              minDataPoints={1}
            />
            {/* Mini predicción del próximo día */}
            {data.nextDayPrediction && (
              <div className="mt-4 border border-dashed border-[color:var(--accent,var(--rule-base))] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] p-4 flex items-center gap-3">
                <div className="shrink-0 h-10 w-10 bg-[var(--surface-raised)] border border-[color:var(--accent,var(--rule-base))] flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-[color:var(--accent,var(--text-primary))]" strokeWidth={2.25} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    Mañana es {data.nextDayPrediction.diaCompleto}
                  </p>
                  <p className="text-sm sm:text-base font-bold text-[var(--text-primary)] leading-snug">
                    Estimación: vas a vender alrededor de{" "}
                    <span className="font-extrabold text-[color:var(--data-success-500)]">
                      {fmtS(data.nextDayPrediction.estimado)}
                    </span>
                    <span className="text-[var(--text-secondary)] font-semibold"> · basado en {data.nextDayPrediction.diaCompleto.toLowerCase()}s del periodo</span>
                  </p>
                </div>
              </div>
            )}
          </DashboardSection>
        );
      },
    },
    {
      id: "ventas-por-hora",
      render: () => {
        const hasHotHour = horaPicoObj.monto > 0;
        return (
          <DashboardSection
            chartId="ventas.por-hora"
            hasData={(data.ventasPorHora ?? []).some((d) => (d.monto ?? 0) > 0)}
            kicker="Horario · hoy"
            title="Volumen de tickets y monto por hora"
            rightSlot={
              hasHotHour ? (
                <div className="inline-flex items-center gap-2 h-9 px-3 rounded-full border-2 border-[color:var(--data-warning-500)]/40 bg-[color:var(--data-warning-500)]/10 relative overflow-hidden">
                  {/* Pulse ring detrás del badge */}
                  <span className="absolute inset-0 rounded-full bg-[color:var(--data-warning-500)]/20 animate-ping" aria-hidden />
                  <Flame className="relative h-4 w-4 text-[color:var(--data-warning-500)]" strokeWidth={2.5} aria-hidden />
                  <span className="relative text-xs font-extrabold uppercase tracking-wider text-[color:var(--data-warning-500)] whitespace-nowrap">
                    Hora caliente · {horaPicoObj.hora}
                  </span>
                </div>
              ) : undefined
            }
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
              data={data.ventasPorHora.map((h) => ({
                ...h,
                _isPico: h.hora === horaPicoObj.hora && h.monto > 0,
              }))}
              xKey="hora"
              bars={[{ key: "ventas", label: "Tickets", color: "tertiary", yAxis: "left" }]}
              lines={[{ key: "monto", label: "Monto S/", color: "primary", yAxis: "right" }]}
              referenceAreas={
                hasHotHour
                  ? [{ x1: horaPicoObj.hora, x2: horaPicoObj.hora, fillKey: "amber", opacity: 0.15 }]
                  : []
              }
              tooltipExtras={(entry) => {
                const isPico = Boolean(entry._isPico);
                if (!isPico) return null;
                return (
                  <div className="flex items-center gap-1.5 text-[color:var(--data-warning-500)] font-extrabold uppercase tracking-wider text-[10px]">
                    <Flame className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Hora caliente del día
                  </div>
                );
              }}
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
        );
      },
    },
    {
      id: "metodo-pago",
      render: () => (
        <DashboardSection
          chartId="ventas.metodo-pago"
          hasData={(data.metodosPago ?? []).some((m) => (m.total ?? 0) > 0)}
          defaultVisible={false}
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
          defaultVisible={false}
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
          defaultVisible={false}
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

  return <DraggableSections items={sections} storageKey="ventas-base-order" layout="column" gap={4} />;
}
