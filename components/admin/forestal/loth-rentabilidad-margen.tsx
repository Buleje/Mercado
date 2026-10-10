"use client";

/**
 * El margen por especie: cuánto deja cada una y cuál pierde plata. Es el
 * costeo de `computeCosteo` (precio de venta − derecho VEN − extracción −
 * transformación − flete, por m³ movilizado), tal cual lo devuelve el
 * servidor; la pantalla no recalcula.
 */

import { useMemo } from "react";
import { Award, TrendingDown } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import type { CosteoRow } from "@/lib/forestal/loth-constants";
import { formatNumber } from "@/lib/format";
import { BarraMargen, Td, Th, pct, soles } from "./loth-rentabilidad-celdas";
import { BarraFiltrosTabla, FiltroEnCabecera, SinCoincidenciasFila, useFiltrosTabla } from "./filtros-tabla-forestal";
import { COLUMNAS_MARGEN } from "./loth-plan-columnas-filtro";

export default function LothRentabilidadMargen({ filas }: { filas: CosteoRow[] }) {
  const rows = useMemo(() => [...filas].sort((a, b) => b.margen - a.margen), [filas]);
  const f = useFiltrosTabla(rows, COLUMNAS_MARGEN);
  const mejor = rows[0];
  const peor = rows[rows.length - 1];
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.margen)), 1);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {mejor && mejor.margen > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl border-2 border-[var(--data-success-500)]/30 bg-[var(--data-success-50)] px-3 py-2 dark:bg-[var(--data-success-500)]/10">
            <Award className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden />
            <p className="text-sm text-[var(--text-secondary)]">
              <b className="text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">La que más deja: {mejor.species}</b> · {soles(mejor.margen)} ({pct(mejor.margenPct)}) sobre {formatNumber(mejor.movilizadoM3, { max: 2 })} m³
            </p>
          </div>
        )}
        {peor && peor.margen < 0 && (
          <div className="flex items-start gap-2.5 rounded-xl border-2 border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] px-3 py-2 dark:bg-[var(--data-error-500)]/10">
            <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" aria-hidden />
            <p className="text-sm text-[var(--text-secondary)]">
              <b className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">Pierde plata: {peor.species}</b> · {soles(peor.margen)} ({pct(peor.margenPct)}). Revisa su precio o sus costos.
            </p>
          </div>
        )}
      </div>

      <BarraFiltrosTabla f={f} />
      <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
        <DataTable className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left align-top">
            <tr>
              <Th>Especie<FiltroEnCabecera id="especie" f={f} compacto /></Th>
              <Th className="text-right">Movilizado<FiltroEnCabecera id="movilizado" f={f} compacto /></Th>
              <Th className="text-right">Precio/m³<FiltroEnCabecera id="precio" f={f} compacto /></Th>
              <Th className="text-right">Costo/m³<FiltroEnCabecera id="costo" f={f} compacto /></Th>
              <Th className="text-right">Margen/m³<FiltroEnCabecera id="margenM3" f={f} compacto /></Th>
              <Th className="text-right">Margen total<FiltroEnCabecera id="margen" f={f} compacto /></Th>
            </tr>
          </thead>
          <tbody>
            {f.filtradas.length === 0 && <SinCoincidenciasFila colSpan={6} />}
            {f.filtradas.map((r) => (
              <tr key={r.species} className="border-t border-[var(--rule-soft)]">
                <Td>
                  <span className="inline-flex items-center gap-1.5">
                    {r === mejor && r.margen > 0 && <Award className="h-3.5 w-3.5 text-[var(--data-warning-600)]" aria-hidden />}
                    <span className="font-medium text-[var(--text-primary)]">{r.species}</span>
                    {r.cites && <span className="rounded bg-[var(--data-error-100)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">CITES</span>}
                  </span>
                </Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{formatNumber(r.movilizadoM3, { max: 2 })} m³</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{soles(r.precioVentaM3)}</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{soles(r.costoTotalM3)}</Td>
                <Td className={`text-right font-mono font-bold tabular-nums ${r.margenM3 >= 0 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"}`}>{soles(r.margenM3)}</Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <BarraMargen margen={r.margen} maxAbs={maxAbs} />
                    <span className={`font-mono font-bold tabular-nums ${r.margen >= 0 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"}`}>{soles(r.margen)}</span>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}
