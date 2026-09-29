"use client";

/**
 * Piezas de «Recibir la guía del Libro TH»: lo que entra al libro, por especie,
 * y la lista de trozas tal como la declaró el Trozado del bosque.
 */

import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import type { LineaDeIngresoTh } from "@/lib/forestal/guia-th-al-ctp";

const TH = "whitespace-nowrap px-3 py-2 text-left text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
const TD = "px-3 py-2 text-sm text-[var(--text-primary)]";
const NUM = "text-right font-mono tabular-nums";

/** Un renglón del libro por especie: cuántas trozas y cuántos m³. */
export function LineasDeLaGuia({ lineas, totalM3 }: { lineas: LineaDeIngresoTh[]; totalM3: number }) {
  const trozas = lineas.reduce((a, l) => a + l.trozas.length, 0);
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
      <table className="w-full min-w-[20rem] border-collapse">
        <caption className="sr-only">Lo que entra al libro, por especie</caption>
        <thead className="bg-[var(--surface-sunken)]">
          <tr>
            <th scope="col" className={TH}>Especie</th>
            <th scope="col" className={`${TH} text-right`}>Trozas</th>
            <th scope="col" className={`${TH} text-right`}>m³</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => (
            <tr key={l.especieComun} className="border-t border-[var(--rule-soft)]">
              <td className={TD}>
                <span className="font-bold">{l.especieComun}</span>
                {l.especieCientifica && (
                  <span className="ml-1.5 text-xs italic text-[var(--text-tertiary)]">{l.especieCientifica}</span>
                )}
              </td>
              <td className={`${TD} ${NUM}`}>{l.trozas.length}</td>
              <td className={`${TD} ${NUM}`}>{fmtM3(l.volumenM3)}</td>
            </tr>
          ))}
        </tbody>
        {lineas.length > 1 && (
          <tfoot>
            <tr className="border-t-2 border-[var(--rule-base)]">
              <th scope="row" className={`${TD} text-left font-bold`}>Total</th>
              <td className={`${TD} ${NUM} font-bold`}>{trozas}</td>
              <td className={`${TD} ${NUM} font-bold`}>{fmtM3(totalM3)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** La lista de trozas, con las medidas del papel: diámetros en cm, largo en m. */
export function TrozasDeLaGuia({ lineas }: { lineas: LineaDeIngresoTh[] }) {
  const filas = lineas.flatMap((l) => l.trozas).sort((a, b) => a.orden - b.orden);
  const cm = (v: number | null) => (v == null ? "—" : formatNumber(v, { max: 1 }));
  return (
    <details className="group rounded-xl border border-[var(--rule-base)]">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-bold text-[var(--accent-ink)] marker:content-none sm:min-h-9">
        <span className="group-open:hidden">Ver las {filas.length} trozas</span>
        <span className="hidden group-open:inline">Ocultar las trozas</span>
      </summary>
      <div className="max-h-72 overflow-auto border-t border-[var(--rule-soft)]">
        <table className="w-full min-w-[30rem] border-collapse">
          <caption className="sr-only">Lista de trozas de la guía</caption>
          <thead className="sticky top-0 bg-[var(--surface-sunken)]">
            <tr>
              <th scope="col" className={TH}>Código</th>
              <th scope="col" className={TH}>Especie</th>
              <th scope="col" className={`${TH} text-right`}>D1 cm</th>
              <th scope="col" className={`${TH} text-right`}>D2 cm</th>
              <th scope="col" className={`${TH} text-right`}>Largo m</th>
              <th scope="col" className={`${TH} text-right`}>m³</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((t) => (
              <tr key={`${t.orden}-${t.codificacion ?? ""}`} className="border-t border-[var(--rule-soft)]">
                <td className={`${TD} whitespace-nowrap font-mono font-bold`}>{t.codificacion ?? "—"}</td>
                <td className={`${TD} whitespace-nowrap`}>{t.especieComun ?? "—"}</td>
                <td className={`${TD} ${NUM}`}>{cm(t.d1Cm)}</td>
                <td className={`${TD} ${NUM}`}>{cm(t.d2Cm)}</td>
                <td className={`${TD} ${NUM}`}>{t.largoM == null ? "—" : formatNumber(t.largoM, { max: 2 })}</td>
                <td className={`${TD} ${NUM}`}>{t.volumenM3 == null ? "—" : fmtM3(t.volumenM3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
