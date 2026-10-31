"use client";

/**
 * useLothGtfKpis — las cuatro fichas plegables de la vista GTF del Libro TH
 * (Brandon 05-10): cerradas dicen lo esencial en el botón. Salió de
 * `LothGtfView` (08-10, la vista pasaba de 300 líneas) sin cambiar las cuentas.
 */

import { useMemo } from "react";
import { useKpisPlegables } from "../kpis-plegables";
import type { Gtf } from "../gtf-tabla-columnas";

export function useLothGtfKpis({
  vigentes,
  bajas,
  sinIngresar,
  sinFichas,
}: {
  vigentes: readonly Gtf[];
  /** Anuladas + borradas: lo mismo que cuenta la pestaña «Anuladas y otras». */
  bajas: number;
  sinIngresar: ReadonlySet<string>;
  /** Cargando o sin guías: el botón queda sin fichas. */
  sinFichas: boolean;
}) {
  // Resumen del período: lo que un titular quiere saber sin leer la tabla.
  const resumen = useMemo(
    () => ({
      emitidas: vigentes.length,
      anuladas: bajas,
      volumen: vigentes.reduce((s, g) => s + Number(g.volumenTotalM3 ?? 0), 0),
      /* La misma cuenta que «Por ingresar al CTP» en la columna Estado (el servidor
         lo decide con `conCtp=1`); sin ese dato, la bandeja del CTP como antes. */
      pendientes: vigentes.filter((g) =>
        g.ctp !== undefined ? g.ctp === "por_ingresar" : g.tipo !== "producto" && sinIngresar.has(g.gtfNumber),
      ).length,
    }),
    [vigentes, bajas, sinIngresar],
  );

  return useKpisPlegables({
    claveMemoria: "loth-gtf",
    alto: "md",
    resumen: `${resumen.emitidas} ${resumen.emitidas === 1 ? "guía" : "guías"} · ${Number(resumen.volumen).toFixed(3)} m³${resumen.pendientes > 0 ? ` · ${resumen.pendientes} sin ingresar` : ""}`,
    tarjetas: sinFichas ? [] : [
      <ResumenChip key="e" valor={resumen.emitidas} label="Guías emitidas" />,
      <ResumenChip key="v" valor={Number(resumen.volumen).toFixed(3)} sufijo="m³" label="Volumen movilizado" />,
      <ResumenChip key="p" valor={resumen.pendientes} label="Sin ingresar al CTP" tono={resumen.pendientes > 0 ? "warning" : undefined} />,
      <ResumenChip key="a" valor={resumen.anuladas} label="Anuladas y otras" tono={resumen.anuladas > 0 ? "danger" : undefined} />,
    ],
  });
}

/** Ficha de resumen de la pestaña. */
function ResumenChip({ valor, label, sufijo, tono }: { valor: number | string; label: string; sufijo?: string; tono?: "warning" | "danger" }) {
  const color = tono === "danger"
    ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
    : tono === "warning"
      ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
      : "text-[var(--text-primary)]";
  const borde = tono === "danger" ? "border-[var(--data-error-500)]" : tono === "warning" ? "border-[var(--data-warning-500)]" : "border-[var(--rule-base)]";
  return (
    <div className={`rounded-2xl border-2 ${borde} bg-[var(--surface-raised)] px-3.5 py-3`}>
      <div className={`font-mono text-2xl font-bold tabular-nums leading-none ${color}`}>
        {valor}
        {sufijo && <span className="ml-1 text-sm font-semibold">{sufijo}</span>}
      </div>
      <p className="mt-1 text-[length:var(--ts-2xs)] font-semibold uppercase leading-tight tracking-wide text-[var(--text-tertiary)]">{label}</p>
    </div>
  );
}
