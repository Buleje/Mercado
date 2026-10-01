"use client";

import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { SERIE } from "@/components/admin/shared/chart-palette";
import { GaugeChart, StaggerItem } from "@/components/admin/finanzas/charts";
import type { calcHealthScore } from "@/components/admin/finanzas/shared";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { MesResumen } from "./tipos";

type Puntaje = ReturnType<typeof calcHealthScore>;

/**
 * La liquidez es efectivo ÷ gastos del mes, y el efectivo sale de la caja
 * abierta. Cuando no se sabe (sin caja, caja imposible), el medidor dice por
 * qué en vez de dibujar un número: antes el efectivo era `ingresos * 0.3`.
 */
function LiquidezSinDato({ motivo }: { motivo: string }) {
  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 flex flex-col items-center justify-center text-center gap-1">
      <p className="text-xs font-bold text-[var(--text-secondary)]">Liquidez</p>
      <p className="text-lg font-extrabold text-[var(--text-secondary)]">Sin dato</p>
      <p className="text-xs text-[var(--text-secondary)]">{motivo}</p>
    </div>
  );
}

/** Los tres indicadores de salud (margen, liquidez, endeudamiento). */
export function IndicadoresDeSalud({ healthScore, motivoSinLiquidez }: { healthScore: Puntaje | null; motivoSinLiquidez: string }) {
  return (
    <>
      {healthScore && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: healthScore.total > 70 ? "var(--accent)" : healthScore.total >= 40 ? SERIE.alerta : SERIE.gastos }} />
            <p className="text-sm font-bold text-[var(--text-primary)]">
              Indicadores de Salud Financiera
              <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{
                backgroundColor: healthScore.total > 70 ? "color-mix(in oklab, var(--accent) 12%, transparent)" : healthScore.total >= 40 ? "color-mix(in oklab, var(--data-warning-500) 12%, transparent)" : "color-mix(in oklab, var(--data-error-500) 12%, transparent)",
                color: healthScore.total > 70 ? "var(--accent)" : healthScore.total >= 40 ? SERIE.alerta : SERIE.gastos,
              }}>
                {healthScore.total}/100 — {healthScore.total > 70 ? "Saludable" : healthScore.total >= 40 ? "Precaución" : "Crítico"}
              </span>
            </p>
            {!healthScore.liquidezConocida && (
              <InfoTip
                title="Puntaje sin la liquidez"
                what={`La liquidez no se pudo medir (${motivoSinLiquidez}).`}
                affects="El puntaje se calcula sólo con el margen y el endeudamiento, llevado a 100."
              />
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <GaugeChart
              value={healthScore.margen}
              max={100}
              label="Margen de utilidad"
              unit="%"
              color={healthScore.margen > 25 ? "var(--accent)" : healthScore.margen >= 15 ? SERIE.alerta : SERIE.gastos}
            />
            {healthScore.liquidez == null ? (
              <LiquidezSinDato motivo={motivoSinLiquidez} />
            ) : (
              <GaugeChart
                value={healthScore.liquidez}
                max={4}
                label="Liquidez"
                unit="x"
                color={healthScore.liquidez > 2 ? "var(--accent)" : healthScore.liquidez >= 1 ? SERIE.alerta : SERIE.gastos}
              />
            )}
            <GaugeChart
              value={healthScore.deudaRatio}
              max={100}
              label="Endeudamiento"
              unit="%"
              color={healthScore.deudaRatio < 10 ? "var(--accent)" : healthScore.deudaRatio <= 30 ? SERIE.alerta : SERIE.gastos}
            />
          </div>
        </div>
      )}
    </>
  );
}

/** El puntaje 0-100 con su desglose. */
export function SaludDelNegocio({ healthScore, monthlyData, motivoSinLiquidez }: { healthScore: Puntaje | null; monthlyData: MesResumen[]; motivoSinLiquidez: string }) {
  return (
    <>
      {healthScore && (
        <StaggerItem index={8}>
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: healthScore.total > 70 ? "var(--accent)" : healthScore.total >= 40 ? SERIE.alerta : SERIE.gastos }} />
              <p className="text-sm font-bold text-[var(--text-primary)]">Salud del Negocio</p>
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full" style={{
                backgroundColor: healthScore.total > 70 ? "color-mix(in oklab, var(--accent) 12%, transparent)" : healthScore.total >= 40 ? "color-mix(in oklab, var(--data-warning-500) 12%, transparent)" : "color-mix(in oklab, var(--data-error-500) 12%, transparent)",
                color: healthScore.total > 70 ? "var(--accent)" : healthScore.total >= 40 ? SERIE.alerta : SERIE.gastos,
              }}>
                {healthScore.total}/100
              </span>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Gauge semicircular */}
              <div className="relative w-40 h-22.5 shrink-0">
                <ResponsiveContainer minWidth={0} width="100%" height={90}>
                  <PieChart>
                    <Pie
                      data={[{ name: "score", value: healthScore.total }, { name: "empty", value: 100 - healthScore.total }]}
                      cx="50%" cy="100%" startAngle={180} endAngle={0} innerRadius={50} outerRadius={70} dataKey="value" stroke="none"
                    >
                      <Cell fill={healthScore.total > 70 ? "var(--accent)" : healthScore.total >= 40 ? SERIE.alerta : SERIE.gastos} />
                      <Cell fill="var(--rule-base)" className="" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-end justify-center pb-1 pointer-events-none">
                  <span className="text-2xl font-extrabold" style={{ color: healthScore.total > 70 ? "var(--accent)" : healthScore.total >= 40 ? SERIE.alerta : SERIE.gastos }}>
                    {healthScore.total}
                  </span>
                </div>
              </div>
              {/* Breakdown */}
              <div className="flex-1 w-full space-y-3">
                {[
                  { label: "Margen bruto", pts: healthScore.margenPts, max: 33, detail: `${Number(healthScore.margen).toFixed(1)}%`, desc: "Cuanto ganas por cada sol vendido" },
                  { label: "Liquidez", pts: healthScore.liquidezPts, max: 33, detail: healthScore.liquidez == null ? "Sin dato" : `${Number(healthScore.liquidez).toFixed(1)}x`, desc: healthScore.liquidez == null ? `Efectivo vs gastos mensuales · ${motivoSinLiquidez}` : "Efectivo vs gastos mensuales" },
                  { label: "Rotacion inv.", pts: 17, max: 25, detail: "Est.", desc: "Que tan rápido vendes tu stock" },
                  { label: "Crecimiento", pts: Math.min(25, Math.max(5, monthlyData.length >= 2 && monthlyData[monthlyData.length - 2].ingresos > 0 ? Math.round(((monthlyData[monthlyData.length - 1].ingresos - monthlyData[monthlyData.length - 2].ingresos) / monthlyData[monthlyData.length - 2].ingresos) * 25 + 12.5) : 12)), max: 25, detail: monthlyData.length >= 2 ? `${Math.round(((monthlyData[monthlyData.length - 1].ingresos - monthlyData[monthlyData.length - 2].ingresos) / Math.max(monthlyData[monthlyData.length - 2].ingresos, 1)) * 100)}%` : "N/A", desc: "Ventas vs mes anterior" },
                ].map(f => (
                  <div key={f.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-[var(--text-secondary)]">{f.label}</span>
                      <span className="text-xs font-bold text-[var(--text-secondary)]">{f.detail}</span>
                    </div>
                    <div className="h-2 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-[var(--dur-slow)]" style={{ width: `${(f.pts / f.max) * 100}%`, backgroundColor: f.pts >= f.max * 0.8 ? "var(--accent)" : f.pts >= f.max * 0.5 ? SERIE.alerta : SERIE.gastos }} />
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </StaggerItem>
      )}
    </>
  );
}
