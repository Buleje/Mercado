"use client";

/**
 * La tabla de Rentabilidad: un producto por fila, columnas que se arrastran,
 * Categoría filtrable en su cabecera (y arriba en el celular, donde la
 * cabecera no se ve) y el pie con los totales de LO QUE SE VE.
 *
 * Salió de `ProfitabilityTab.tsx` (2026-10-11) tal cual —el archivo pasaba de
 * 400 líneas—; el orden de columnas lo sigue pidiendo la pestaña porque su
 * «Restablecer columnas» vive en la fila de filtros.
 */

import { useMemo } from "react";
import { DataTable } from "@buleje/design-system";
import { Eye, ArrowUpRight, ArrowDownRight, AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/format";
import { FiltroColumnaMulti } from "@/components/admin/shared/filtros-columna";
import { EnOrden, type useOrdenColumnas } from "@/components/admin/shared/columnas-ordenables";
import type { FacetaOpcion } from "@/lib/admin/filtros-columna";
import type { ProfitLine } from "./DetalleProductoModal";

const fmt = (n: number) => `${formatCurrency(n)}`;
const pct = (n: number) => (Math.abs(n) > 999 ? "—" : `${n.toFixed(1)}%`);

interface Props {
  lines: ProfitLine[];
  filtered: ProfitLine[];
  loading: boolean;
  days: number;
  catFilter: string[];
  setCatFilter: (v: string[]) => void;
  catOptions: FacetaOpcion[];
  ordenProf: ReturnType<typeof useOrdenColumnas>;
  onVer: (l: ProfitLine) => void;
}

export default function TablaRentabilidad({ lines, filtered, loading, days, catFilter, setCatFilter, catOptions, ordenProf, onVer }: Props) {
  /** Ids sin total propio (texto): mientras queden AL FRENTE (arrastre) se funden
   *  con «#» en una sola etiqueta «Totales»; si una columna con total se cuela
   *  antes, la que quedó atrás pinta una celda vacía para no correr el resto. */
  const idsSinTotal = new Set(["producto", "categoria"]);
  let antesDeLosTotales = 0;
  while (antesDeLosTotales < ordenProf.orden.length && idsSinTotal.has(ordenProf.orden[antesDeLosTotales])) antesDeLosTotales++;
  const idsFundidos = new Set(ordenProf.orden.slice(0, antesDeLosTotales));

  // Pie de tabla: solo lo que se está viendo. Si no, filtrar por una categoría
  // dejaba una fila de "Totales" que no cerraba con las filas de arriba.
  const visibleTotals = useMemo(() => {
    const revenue = filtered.reduce((s, l) => s + l.revenue, 0);
    const cogs = filtered.reduce((s, l) => s + l.cogs, 0);
    const grossMargin = revenue - cogs;
    return {
      revenue,
      cogs,
      grossMargin,
      marginPct: revenue > 0 ? (grossMargin / revenue) * 100 : 0,
      units: filtered.reduce((s, l) => s + l.unitsSold, 0),
    };
  }, [filtered]);

  const isFiltered = filtered.length !== lines.length;

  return (
    <>
      {/* En el celular la tabla es tarjetas (`.admin-mobile-cards` esconde el
          <thead>): Categoría se repite acá, mismo estado, sólo visible ahí. */}
      {lines.length > 0 && (
        <div className="flex flex-col gap-1 sm:hidden">
          <span className="text-sm font-bold text-[var(--text-secondary)]">Categoría</span>
          <FiltroColumnaMulti label="Categoría" value={catFilter} options={catOptions} onChange={setCatFilter} placeholder="Todas" />
        </div>
      )}

      {/* Table */}
      <DataTable filtrable className="min-w-[600px]">
        <thead ref={ordenProf.refCabecera}>
          <tr className="border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
            <th>#</th>
            <EnOrden
              orden={ordenProf.orden}
              celdas={{
                producto: <th data-col="producto">Producto</th>,
                categoria: (
                  <th data-col="categoria">
                    <span className="block">Categoría</span>
                    <FiltroColumnaMulti
                      label="Categoría"
                      value={catFilter}
                      options={catOptions}
                      onChange={setCatFilter}
                      placeholder="Todas"
                    />
                  </th>
                ),
                unidades: <th data-col="unidades" className="text-right">Uds.</th>,
                ingresos: <th data-col="ingresos" className="text-right">Ingresos</th>,
                costo: <th data-col="costo" className="text-right">Costo</th>,
                margen: <th data-col="margen" className="text-right">Margen</th>,
                pct: <th data-col="pct" className="text-right">%</th>,
              }}
            />
            <th />
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={9} className="text-center text-[var(--text-tertiary)] text-sm">Calculando tus ganancias…</td></tr>
          )}
          {!loading && filtered.length === 0 && (
            <tr>
              <td colSpan={9} className="text-center">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {lines.length === 0
                    ? `No hay ventas en los ${days === 7 ? "últimos 7" : days === 30 ? "últimos 30" : "últimos 90"} días`
                    : "Ningún producto coincide con el filtro"}
                </p>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  {lines.length === 0
                    ? "Cuando registres ventas vas a ver acá cuánto ganas con cada producto."
                    : "Prueba con otra categoría o limpia la búsqueda."}
                </p>
              </td>
            </tr>
          )}
          {filtered.map((l, i) => (
            <tr key={l.id}>
              <td className="text-sm text-[var(--text-tertiary)]">{i + 1}</td>
              <EnOrden
                orden={ordenProf.orden}
                celdas={{
                  producto: <td className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{l.product}</td>,
                  categoria: <td className="text-sm text-[var(--text-secondary)] dark:text-muted">{l.category}</td>,
                  unidades: <td className="text-right text-[var(--text-secondary)] dark:text-muted">{formatNumber(l.unitsSold)}</td>,
                  ingresos: <td className="text-right text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(l.revenue)}</td>,
                  costo: (
                    <td className="text-right text-[var(--text-secondary)]">
                      <span className="inline-flex items-center justify-end gap-1">
                        {l.costEstimated && (
                          <AlertTriangle
                            className="h-3.5 w-3.5 text-[var(--data-warning-500)] shrink-0"
                            aria-label="Costo aproximado: la venta no guardó el costo del momento"
                          />
                        )}
                        {fmt(l.cogs)}
                      </span>
                    </td>
                  ),
                  margen: <td className={cn("text-right font-bold", l.grossMargin >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{fmt(l.grossMargin)}</td>,
                  pct: (
                    <td className="text-right">
                      <span className={cn("inline-flex items-center gap-0.5 text-sm font-bold", l.marginPct >= 35 ? "text-[var(--data-success-500)]" : l.marginPct >= 25 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]")}>
                        {l.marginPct >= 35 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {pct(l.marginPct)}
                      </span>
                    </td>
                  ),
                }}
              />
              <td>
                <button aria-label={`Ver el detalle de ${l.product}`} onClick={() => onVer(l)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)] hover:bg-primary/10 dark:hover:bg-primary/15"><Eye className="h-3.5 w-3.5" /></button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] dark:bg-surface/50">
          <tr className="font-extrabold">
            {/* Producto/Categoría no tienen total propio: se funden en esta
                etiqueta junto con «#», contando cuántas quedan al frente hoy
                (las columnas se arrastran) — el resto de la fila sigue el
                MISMO orden que la cabecera. */}
            <td colSpan={1 + antesDeLosTotales} className="text-sm text-[var(--text-secondary)]">
              {isFiltered ? `Totales (${filtered.length} de ${lines.length})` : "Totales"}
            </td>
            <EnOrden
              orden={ordenProf.orden}
              celdas={{
                producto: idsFundidos.has("producto") ? false : <td />,
                categoria: idsFundidos.has("categoria") ? false : <td />,
                unidades: <td className="text-right text-[var(--text-primary)] dark:text-[var(--text-primary)]">{formatNumber(visibleTotals.units)}</td>,
                ingresos: <td className="text-right text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(visibleTotals.revenue)}</td>,
                costo: <td className="text-right text-[var(--text-secondary)]">{fmt(visibleTotals.cogs)}</td>,
                margen: <td className="text-right text-[var(--data-success-500)]">{fmt(visibleTotals.grossMargin)}</td>,
                pct: <td className="text-right text-[var(--data-success-500)]">{pct(visibleTotals.marginPct)}</td>,
              }}
            />
            <td />
          </tr>
        </tfoot>
      </DataTable>
    </>
  );
}
