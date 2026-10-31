"use client";

import { DataTable } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import type { Fiscal } from "./tipos";
import { igvDeGastosSinCredito, leerIgv } from "./igv";
import AyudaIgv from "./AyudaIgv";
import BloquePlegable from "./BloquePlegable";

const MONTO = "font-mono font-bold tabular-nums text-[var(--text-primary)]";
const SIN_DATO = "text-sm text-[var(--text-secondary)]";

/**
 * El IGV del mes, sólo con lo registrado.
 *
 * Antes la tabla decía «Ventas gravadas» (no se sabe si lo son), «IGV cobrado
 * (18 %)» y «IGV a pagar» calculados con ×18/118, y abajo, en cursiva,
 * «referencia aproximada». La cifra se leía como la del contador. Ahora cada
 * fila de IGV sale de su campo propio o dice que no hay registro.
 *
 * 2026-10-11: sin «Ventas del mes» (= «Entró» de la franja de arriba) ni
 * «Gastos del mes» (sólo los registrados: un TERCER número al lado de «Salió»
 * y de los costos de Ganancias). Quedan las tres filas del IGV, y la tarjeta
 * «IGV a pagar» de los indicadores, que repetía la última, ya no está.
 */
export default function ResumenFiscal({ fiscal }: { fiscal: Fiscal | null }) {
  if (!fiscal) return null;
  const igv = leerIgv(fiscal.igv);
  const registrado = igv?.tipo === "registrado" ? igv : null;
  return (
    <BloquePlegable
      id="fiscal"
      titulo="IGV del mes"
      resumen={registrado
        ? `${registrado.neto < 0 ? "saldo a favor" : "IGV a pagar"} ${formatCurrency(Math.abs(Math.round(registrado.neto)), { decimals: 0 })}`
        : !igv ? "no se pudo leer el IGV" : igv.tipo === "exoneradas" ? "sin IGV" : "sin IGV registrado"}
      acciones={igv && <AyudaIgv lectura={igv} />}
    >
      {/* `DataTable` sin estilos propios en th/td (ley 10, «todo parejo»): el
          color y el peso van en un span dentro de la celda. */}
      <div className="overflow-x-auto">
        <DataTable>
          <thead>
            <tr>
              <th>Concepto</th>
              <th className="text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>IGV de tus comprobantes</td>
              <td className="text-right">
                {registrado && registrado.comprobantes > 0
                  ? <span className={MONTO}>{formatCurrency(Math.round(registrado.debito), { decimals: 0 })}</span>
                  : <span className={SIN_DATO}>{igv ? "Sin comprobantes electrónicos" : "—"}</span>}
              </td>
            </tr>
            <tr>
              <td>IGV de tus gastos</td>
              <td className="text-right">
                {registrado && registrado.conIgv > 0
                  ? <span className={MONTO}>{formatCurrency(Math.round(registrado.credito), { decimals: 0 })}</span>
                  : <span className={SIN_DATO}>{igv ? igvDeGastosSinCredito(igv) : "—"}</span>}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td><span className="font-bold text-[var(--text-primary)]">{registrado && registrado.neto < 0 ? "Saldo a favor" : "IGV a pagar"}</span></td>
              <td className="text-right">
                {registrado ? (
                  <span className={cn(
                    "font-mono text-lg font-extrabold tabular-nums",
                    registrado.neto > 0 ? "text-[var(--data-error-ink)]" : "text-[var(--data-success-ink)]",
                  )}>
                    {formatCurrency(Math.abs(Math.round(registrado.neto)), { decimals: 0 })}
                  </span>
                ) : (
                  <span className="font-semibold text-[var(--text-secondary)]">
                    {!igv ? "No se pudo leer" : igv.tipo === "exoneradas" ? "Sin IGV" : "Sin IGV registrado"}
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </DataTable>
      </div>
    </BloquePlegable>
  );
}
