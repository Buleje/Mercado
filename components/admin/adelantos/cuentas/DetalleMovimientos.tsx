"use client";

/**
 * El camino, no sólo el total: la corrida de movimientos de la cuenta
 * forestal de una persona, con el saldo acumulado paso a paso —lo mismo que
 * se le muestra a la parte cuando discute el número (cuenta-corriente.ts).
 */

import { DataTable } from "@buleje/design-system";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { COLUMNAS_FILTRO_MOV_FORESTAL, type FilaMovimientoForestal } from "../filtros-columnas-tablas";
import { ExternalLink } from "@buleje/design-system/icons";
import { corridaDeSaldos, CONCEPTO_LABEL, type MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";
import { fmtMon } from "../shared";
import { formatDate } from "@/lib/format";

/** Fecha date-only (UTC): con la zona de Lima el día cambia antes de tiempo. */
const diaUtc = (iso: string) =>
  formatDate(iso, { soloFecha: true });

export default function DetalleMovimientos({
  movimientos,
  onGoTab,
}: {
  movimientos: MovimientoCuenta[];
  onGoTab: (tab: string) => void;
}) {
  const corrida = corridaDeSaldos(movimientos);
  const filas: FilaMovimientoForestal[] = corrida.map((m) => ({
    ...m,
    concepto: CONCEPTO_LABEL[m.concepto] ?? m.concepto,
    monto: m.tipo === "cargo" ? m.monto : -m.monto,
  }));
  const ft = useFiltrosTabla(filas, COLUMNAS_FILTRO_MOV_FORESTAL);
  return (
    <div className="mt-3 space-y-2 border-t border-[var(--rule-soft)] pt-3">
      {corrida.length === 0 ? (
        <p className="py-3 text-center text-sm text-[var(--text-tertiary)]">Sin movimientos en la cuenta forestal todavía.</p>
      ) : (
        <>
        <BarraFiltrosTabla f={ft} />
        <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
          {/* minWidth inline: min-w-* es clase muerta acá (memoria min-width-utilities-muertas). */}
          <DataTable className="w-full" style={{ minWidth: 480 }}>
            <thead className="[&_th]:align-top">
              <tr>
                <ThColumna ids={["fecha"]} label="Fecha" f={ft} />
                <ThColumna ids={["concepto"]} label="Concepto" f={ft} />
                <ThColumna ids={["referencia"]} label="Referencia" f={ft} />
                <ThColumna ids={["monto"]} label="Monto" f={ft} derecha />
                <ThColumna ids={["saldo"]} label="Saldo" f={ft} derecha />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-soft)]">
              {ft.filtradas.length === 0 && <SinCoincidenciasFila colSpan={5} />}
              {ft.filtradas.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap tabular-nums text-[var(--text-secondary)]">{diaUtc(m.fecha)}</td>
                  <td>{m.concepto}</td>
                  <td className="text-[var(--text-tertiary)]">{m.referencia ?? "—"}</td>
                  <td
                    className={`whitespace-nowrap text-right font-bold tabular-nums ${
                      // -700/-500: mismo patrón AA que CtpCuentaCorriente.tsx (el token base no pasa).
                      m.monto >= 0
                        ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                        : "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                    }`}
                  >
                    {m.monto >= 0 ? "+" : "−"}
                    {fmtMon(Math.abs(m.monto), m.moneda)}
                  </td>
                  <td className="whitespace-nowrap text-right font-bold tabular-nums">
                    {fmtMon(m.acumulado, m.moneda)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
        </>
      )}
      <button
        type="button"
        onClick={() => onGoTab("personas")}
        className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
      >
        Ver sus adelantos <ExternalLink className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
