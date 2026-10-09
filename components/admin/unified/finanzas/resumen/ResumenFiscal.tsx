"use client";

import { DataTable } from "@buleje/design-system";
import { Calculator } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import type { Fiscal } from "./tipos";
import { igvDeGastosSinCredito, leerIgv } from "./igv";
import AyudaIgv from "./AyudaIgv";

const CELDA_MONTO = "py-2.5 text-right font-bold font-mono tabular-nums text-[var(--text-primary)]";
const CELDA_SIN_DATO = "py-2.5 text-right text-sm text-[var(--text-secondary)]";

/**
 * El IGV del mes, sólo con lo registrado.
 *
 * Antes la tabla decía «Ventas gravadas» (no se sabe si lo son), «IGV cobrado
 * (18 %)» y «IGV a pagar» calculados con ×18/118, y abajo, en cursiva,
 * «referencia aproximada». La cifra se leía como la del contador. Ahora cada
 * fila de IGV sale de su campo propio o dice que no hay registro.
 */
export default function ResumenFiscal({ fiscal, mesCapitalized }: { fiscal: Fiscal | null; mesCapitalized: string }) {
  if (!fiscal) return null;
  const igv = leerIgv(fiscal.igv);
  const registrado = igv?.tipo === "registrado" ? igv : null;
  return (
    <div className="bg-[var(--surface-raised)] border-2 border-secondary/40 rounded-xl p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="h-5 w-5 text-secondary" />
        <p className="text-sm font-bold text-[var(--text-primary)]">Resumen Fiscal — {mesCapitalized}</p>
        {igv && <AyudaIgv lectura={igv} />}
      </div>
      <div className="overflow-x-auto">
        <DataTable className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--rule-base)]">
              <th className="text-left py-2 text-xs font-bold text-[var(--text-tertiary)]">Concepto</th>
              <th className="text-right py-2 text-xs font-bold text-[var(--text-tertiary)]">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            <tr>
              <td className="py-2.5 text-[var(--text-secondary)]">Ventas del mes</td>
              <td className={CELDA_MONTO}>{formatCurrency(Math.round(fiscal.ventas), { decimals: 0 })}</td>
            </tr>
            <tr>
              <td className="py-2.5 text-[var(--text-secondary)]">IGV de tus comprobantes</td>
              {registrado && registrado.comprobantes > 0
                ? <td className={CELDA_MONTO}>{formatCurrency(Math.round(registrado.debito), { decimals: 0 })}</td>
                : <td className={CELDA_SIN_DATO}>{igv ? "Sin comprobantes electrónicos" : "—"}</td>}
            </tr>
            <tr>
              <td className="py-2.5 text-[var(--text-secondary)]">Gastos del mes</td>
              <td className={CELDA_MONTO}>{formatCurrency(Math.round(fiscal.compras), { decimals: 0 })}</td>
            </tr>
            <tr>
              <td className="py-2.5 text-[var(--text-secondary)]">IGV de tus gastos</td>
              {registrado && registrado.conIgv > 0
                ? <td className={CELDA_MONTO}>{formatCurrency(Math.round(registrado.credito), { decimals: 0 })}</td>
                : <td className={CELDA_SIN_DATO}>{igv ? igvDeGastosSinCredito(igv) : "—"}</td>}
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--rule-base)]">
              <td className="pt-3 pb-1 font-bold text-[var(--text-primary)]">{registrado && registrado.neto < 0 ? "Saldo a favor" : "IGV a pagar"}</td>
              {registrado ? (
                <td className={cn(
                  "pt-3 pb-1 text-right font-extrabold font-mono tabular-nums text-lg",
                  registrado.neto > 0 ? "text-[var(--data-error-500)]" : "text-[var(--data-success-500)]",
                )}>
                  {formatCurrency(Math.abs(Math.round(registrado.neto)), { decimals: 0 })}
                </td>
              ) : (
                <td className="pt-3 pb-1 text-right font-semibold text-[var(--text-secondary)]">
                  {!igv ? "No se pudo leer" : igv.tipo === "exoneradas" ? "Sin IGV" : "Sin IGV registrado"}
                </td>
              )}
            </tr>
          </tfoot>
        </DataTable>
      </div>
    </div>
  );
}
