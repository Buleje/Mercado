"use client";

/**
 * Los movimientos que se van a escribir, con filtros tipo Excel en el encabezado.
 * Filtrar sólo cambia lo que ves: se escribe todo lo del plan.
 *
 * `admin-mobile-cards`: la tabla se convierte sola en tarjetas a 400px vía el
 * hook global del shell admin (`useMobileTableCards`).
 */

import { DataTable } from "@buleje/design-system";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { fmtMon } from "../../shared";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { COLUMNAS_FILTRO_PREVIA, type FilaPrevia } from "../../filtros-columnas-tablas";

export default function TablaPreviaLiquidacion({ filas }: { filas: FilaPrevia[] }) {
  const ft = useFiltrosTabla(filas, COLUMNAS_FILTRO_PREVIA);
  return (
    <>
      {filas.length > 0 && <BarraFiltrosTabla f={ft} />}
      <div className="overflow-hidden rounded-2xl border border-[var(--rule-base)] admin-mobile-cards">
        <DataTable className="w-full">
          <thead className="[&_th]:align-top">
            <tr>
              <ThColumna ids={["libreta"]} label="Libreta" f={ft} />
              <ThColumna ids={["concepto"]} label="Qué se escribe" f={ft} />
              <ThColumna ids={["referencia"]} label="Referencia" f={ft} />
              <ThColumna ids={["monto"]} label="Monto" f={ft} derecha />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {filas.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center text-[var(--text-tertiary)]">
                  No se va a escribir nada todavía.
                </td>
              </tr>
            ) : (
              ft.filtradas.length === 0 && <SinCoincidenciasFila colSpan={4} />
            )}
            {ft.filtradas.map((f, i) => (
              <tr key={i}>
                <td data-label="Libreta">{f.libreta}</td>
                <td data-label="Qué se escribe" className="text-[var(--text-secondary)]">{f.concepto}</td>
                <td data-label="Referencia" className="text-[var(--text-tertiary)]">{f.referencia ?? "—"}</td>
                <td
                  data-label="Monto"
                  className={`whitespace-nowrap text-right font-bold tabular-nums ${
                    f.monto >= 0 ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                  }`}
                >
                  {f.monto >= 0 ? "+" : "−"}
                  {fmtMon(Math.abs(f.monto))}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </>
  );
}
