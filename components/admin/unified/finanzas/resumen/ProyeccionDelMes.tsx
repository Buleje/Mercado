"use client";

import { TrendingUp } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { SERIE } from "@/components/admin/shared/chart-palette";
import type { Proyeccion } from "./tipos";
import BloquePlegable from "./BloquePlegable";

/** A qué ritmo va el mes: lo vendido y gastado, llevado a fin de mes. */
export default function ProyeccionDelMes({ projection, mesCapitalized }: { projection: Proyeccion | null; mesCapitalized: string }) {
  const projVentasDiarias = projection ? projection.ventasMes / projection.diasTranscurridos : 0;
  const projVentas = projection ? Math.round(projVentasDiarias * projection.diasTotales) : 0;
  const projGastos = projection ? Math.round((projection.gastosMes / projection.diasTranscurridos) * projection.diasTotales) : 0;
  const projUtilidad = projVentas - projGastos;
  const projProgreso = projection ? (projection.diasTranscurridos / projection.diasTotales) * 100 : 0;
  const projPctTarget = projVentas > 0 ? Math.round((projection?.ventasMes ?? 0) / projVentas * 100) : 0;
  return (
    <>
      {projection && (
        <BloquePlegable
          id="proyeccion"
          titulo={<span className="inline-flex items-center gap-2"><TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden />Proyección de {mesCapitalized.toLowerCase()}</span>}
          resumen={`ventas ${formatCurrency(projVentas, { decimals: 0 })} · gastos ${formatCurrency(projGastos, { decimals: 0 })} · utilidad ${projUtilidad < 0 ? "−" : ""}${formatCurrency(Math.abs(projUtilidad), { decimals: 0 })}`}
        >
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="text-center p-3 bg-[var(--surface-sunken)] rounded-xl">
              <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase mb-1">Ventas proyectadas</p>
              <p className={cn("text-lg sm:text-xl font-extrabold", projVentas === 0 ? "text-[var(--text-tertiary)]" : "text-primary")}>{formatCurrency(projVentas, { decimals: 0 })}</p>
            </div>
            <div className="text-center p-3 bg-[var(--surface-sunken)] rounded-xl">
              <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase mb-1">Gastos proyectados</p>
              <p className={cn("text-lg sm:text-xl font-extrabold", projGastos === 0 ? "text-[var(--text-tertiary)]" : "text-[var(--data-error-500)]")}>{formatCurrency(projGastos, { decimals: 0 })}</p>
            </div>
            <div className="text-center p-3 bg-[var(--surface-sunken)] rounded-xl">
              <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase mb-1">Utilidad estimada</p>
              <p className={cn("text-lg sm:text-xl font-extrabold", projUtilidad === 0 ? "text-[var(--text-tertiary)]" : projUtilidad >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                {projUtilidad > 0 ? "+" : projUtilidad < 0 ? "−" : ""}{formatCurrency(Math.abs(projUtilidad), { decimals: 0 })}
              </p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-[var(--text-secondary)]">
              <span className="font-medium">Dia {projection.diasTranscurridos} de {projection.diasTotales}</span>
              <span className="font-bold">{Math.round(projProgreso)}% del mes</span>
            </div>
            <div className="h-3 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-[var(--dur-slower)]"
                style={{
                  width: `${projProgreso}%`,
                  backgroundColor: projPctTarget > 70 ? "var(--accent)" : projPctTarget >= 40 ? SERIE.alerta : SERIE.gastos,
                }}
              />
            </div>
            <p className="text-xs text-[var(--text-secondary)] text-center">
              Ventas actuales: <span className="font-bold text-[var(--text-primary)]">{formatCurrency(Math.round(projection.ventasMes), { decimals: 0 })}</span> de {formatCurrency(projVentas, { decimals: 0 })} proyectados
              <span className={`ml-2 font-bold ${projPctTarget > 70 ? "text-[var(--data-success-500)]" : projPctTarget >= 40 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]"}`}>
                ({projPctTarget}%)
              </span>
            </p>
          </div>
        </BloquePlegable>
      )}
    </>
  );
}
