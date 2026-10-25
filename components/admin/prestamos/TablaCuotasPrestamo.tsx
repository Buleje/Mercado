"use client";

/**
 * Las cuotas de un préstamo (la vista «Amortización» de su detalle), con el
 * autofiltro de Excel en el título de cada columna. Los totales del pie son los
 * del préstamo ENTERO: filtrar no cambia lo que se debe.
 */

import { useMemo } from "react";
import { DataTable } from "@buleje/design-system";
import { formatCurrency, formatDateShort } from "@/lib/format";
import {
  BarraFiltrosTabla,
  FiltroEnCabecera,
  SinCoincidenciasFila,
  useFiltrosTabla,
} from "@/components/admin/forestal/filtros-tabla-forestal";
import { COLUMNAS_CUOTAS, type CuotaConSaldo } from "./filtros-cartera";
import type { PrestamoCuota } from "./tipos";

export default function TablaCuotasPrestamo({ cuotas, monto }: { cuotas: PrestamoCuota[]; monto: number }) {
  const rows = useMemo<CuotaConSaldo[]>(() => {
    let saldoVivo = monto;
    return cuotas.map((c) => {
      const saldo = Math.max(0, saldoVivo - c.capital);
      saldoVivo = saldo;
      return { ...c, saldo };
    });
  }, [cuotas, monto]);
  const f = useFiltrosTabla(rows, COLUMNAS_CUOTAS);
  const totalCapital = cuotas.reduce((s, c) => s + c.capital, 0);
  const totalInteres = cuotas.reduce((s, c) => s + c.interes, 0);
  const totalCuota = cuotas.reduce((s, c) => s + c.monto, 0);
  return (
    <div className="-mx-1 space-y-2">
      <BarraFiltrosTabla f={f} />
      <DataTable>
        <thead>
          <tr className="border-b border-[var(--rule-base)]">
            <th>#<FiltroEnCabecera id="num" f={f} compacto /></th>
            <th>Fecha<FiltroEnCabecera id="fecha" f={f} compacto /></th>
            <th className="text-right">Capital</th>
            <th className="text-right">Interés</th>
            <th className="text-right">Cuota<FiltroEnCabecera id="cuota" f={f} compacto /></th>
            <th className="text-right">Saldo</th>
            <th className="text-center">Estado<FiltroEnCabecera id="estado" f={f} compacto /></th>
          </tr>
        </thead>
        <tbody>
          {f.filtradas.length === 0 && <SinCoincidenciasFila colSpan={7} />}
          {f.filtradas.map((c) => (
            <tr key={c.id} className={c.pagadoEn ? "bg-primary/10" : !c.pagadoEn && new Date(c.fechaVence) < new Date() ? "bg-[var(--data-error-50)]/50" : undefined}>
              <td className="font-mono text-[var(--text-secondary)]">{c.numeroCuota}</td>
              <td className="text-[var(--text-secondary)]">{formatDateShort(c.fechaVence)}</td>
              <td className="text-right font-mono text-[var(--text-primary)]">{formatCurrency(c.capital)}</td>
              <td className="text-right font-mono text-[var(--data-error-500)]/70">{formatCurrency(c.interes)}</td>
              <td className="text-right font-mono font-bold text-[var(--text-primary)]">{formatCurrency(c.monto)}</td>
              <td className="text-right font-mono text-[var(--data-success-500)]">{formatCurrency(c.saldo)}</td>
              <td className="text-center">
                {c.pagadoEn ? (
                  <span className="text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 px-1.5 py-0.5 rounded">PAGADA</span>
                ) : new Date(c.fechaVence) < new Date() ? (
                  <span className="text-sm font-bold text-[var(--data-error-500)] bg-[var(--data-error-100)] px-1.5 py-0.5 rounded">VENCIDA</span>
                ) : (
                  <span className="text-sm font-bold text-[var(--data-warning-500)] bg-[var(--data-warning-100)] px-1.5 py-0.5 rounded">PEND.</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--rule-base)] font-bold">
            <td colSpan={2} className="text-[var(--text-secondary)]">TOTAL</td>
            <td className="text-right font-mono text-[var(--text-primary)]">{formatCurrency(totalCapital)}</td>
            <td className="text-right font-mono text-[var(--data-error-500)]">{formatCurrency(totalInteres)}</td>
            <td className="text-right font-mono text-[var(--text-primary)]">{formatCurrency(totalCuota)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </DataTable>
    </div>
  );
}
