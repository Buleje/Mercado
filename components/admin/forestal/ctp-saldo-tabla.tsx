"use client";

/**
 * La tabla del apartado «Saldo por permiso» (ADR-409): una fila por especie con
 * la rolliza, su techo al 56 %, lo declarado sin lote y lo que queda.
 *
 * Vive aparte del modal por tamaño, y porque es la pieza que el Excel y el PDF
 * van a tener que decir igual: las columnas se definen UNA vez.
 *
 * ⚠️ El color de una celda NO va en la clase base compartida. Medido en el
 * navegador: con `text-secondary` en `TD`, la clase de color que agrega la celda
 * del sobrante no gana —dos utilidades de `color` sobre el mismo elemento, manda
 * el orden del CSS— y un sobrante negativo salía del mismo gris que uno positivo.
 */

import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { SaldoDePermiso } from "@/lib/forestal/saldo-por-permiso";

const TH =
  "px-2.5 py-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD = "px-2.5 py-2 font-mono text-sm tabular-nums";
/** El gris de las celdas que no dicen nada por su color. */
const TD_GRIS = "text-[var(--text-secondary)]";

/** Verde si queda madera, rojo si se declaró de más. El cero no es ninguno. */
const tono = (v: number) =>
  v < -0.001
    ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
    : v > 0.001
      ? "text-[var(--text-primary)]"
      : "text-[var(--text-tertiary)]";

/** Igual, pero callado cuando no hay alerta: en la fila de totales el color lo
 *  pone el acento y pisarlo con el gris de una celda normal la desarma. */
const tonoAlerta = (v: number) =>
  v < -0.001 ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "";

export default function SaldoPermisoTabla({ saldo }: { saldo: SaldoDePermiso }) {
  const filas = saldo.especies;
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
      <table className="w-full min-w-[46rem] text-sm">
        <caption className="sr-only">
          Especies del permiso {saldo.etiqueta}: rolliza, aserrable al 56 %, declarado sin lote y
          sobrante
        </caption>
        <thead className="bg-[var(--surface-sunken)]">
          <tr>
            <th scope="col" className={`${TH} text-left`}>
              Especie
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Trozas
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Rolliza m³
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Aserrable 56 % (pt)
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Aserrable 56 % (m³)
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Sin lote (m³)
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Sobrante (m³)
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Sobrante (pt)
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave || f.especie} className="border-t border-[var(--rule-soft)]">
              <th
                scope="row"
                className="px-2.5 py-2 text-left text-sm font-bold text-[var(--text-primary)]"
              >
                {f.especie}
              </th>
              <td className={`${TD} ${TD_GRIS} text-right`}>{fmtPiezas(f.piezas)}</td>
              <td className={`${TD} text-right font-bold text-[var(--text-primary)]`}>
                {fmtM3(f.rollizaM3)}
              </td>
              <td className={`${TD} ${TD_GRIS} text-right`}>{fmtPt(f.aserrablePt)}</td>
              <td className={`${TD} ${TD_GRIS} text-right`}>{fmtM3(f.aserrableM3)}</td>
              <td className={`${TD} ${TD_GRIS} text-right`}>
                {f.producidoM3 > 0 ? `− ${fmtM3(f.producidoM3)}` : "—"}
                {f.corridas > 0 && (
                  <span className="block text-[length:var(--ts-2xs)] font-sans text-[var(--text-tertiary)]">
                    {f.corridas} corrida(s) · {fmtM3(f.rollizaEquivalenteM3)} m³ de troza
                  </span>
                )}
              </td>
              <td className={`${TD} text-right font-bold ${tono(f.sobranteM3)}`}>
                {fmtM3(f.sobranteM3)}
              </td>
              <td className={`${TD} text-right ${tono(f.sobranteM3)}`}>{fmtPt(f.sobrantePt)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <th scope="row" className="px-2.5 py-2 text-left">
              {filas.length} especie(s)
            </th>
            <td className={`${TD} text-right`}>{fmtPiezas(saldo.totales.piezas)}</td>
            <td className={`${TD} text-right`}>{fmtM3(saldo.totales.rollizaM3)}</td>
            <td className={`${TD} text-right`}>{fmtPt(saldo.totales.aserrablePt)}</td>
            <td className={`${TD} text-right`}>{fmtM3(saldo.totales.aserrableM3)}</td>
            <td className={`${TD} text-right`}>
              {saldo.totales.producidoM3 > 0 ? `− ${fmtM3(saldo.totales.producidoM3)}` : "—"}
            </td>
            <td className={`${TD} text-right ${tonoAlerta(saldo.totales.sobranteM3)}`}>
              {fmtM3(saldo.totales.sobranteM3)}
            </td>
            <td className={`${TD} text-right ${tonoAlerta(saldo.totales.sobranteM3)}`}>
              {fmtPt(saldo.totales.sobrantePt)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
