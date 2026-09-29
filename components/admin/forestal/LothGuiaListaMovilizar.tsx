"use client";

/**
 * «Lista de trozas a movilizar» del despacho con guía: la lista que viaja con
 * la guía y a la que apunta el casillero (35), partida en hojas como el papel —
 * cada `FILAS_POR_LISTA` filas, una lista con su N° (las guías de SERFOR: 34
 * trozas → listas 5 y 6). Separada de `LothGuiaTrozas` por tamaño (29-09-2026).
 */

import { Fragment, useMemo } from "react";
import { DataTable } from "@buleje/design-system";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { listaDeTrozas, totalM3 } from "@/lib/forestal/loth-guia-despacho";
import { FILAS_POR_LISTA } from "@/lib/forestal/loth-lista-numero";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import { Bloque } from "./ctp-guia-bloques";

export const TH = "whitespace-nowrap px-2 py-2 text-left text-xs font-bold text-[var(--text-primary)]";
export const THR = `${TH} text-right`;
export const TD = "px-2 py-1.5 text-sm text-[var(--text-primary)]";
export const TDR = `${TD} text-right font-mono tabular-nums`;
export const MARCO = "overflow-x-auto rounded-xl border border-[var(--rule-soft)] sm:col-span-12";

export const dec = (v: number | null | undefined, n: number) => (v == null ? "—" : formatNumber(v, { min: n, max: n }));

export default function LothGuiaListaMovilizar({
  g,
  cientificoDe,
}: {
  g: DespachoGuiaLoth;
  cientificoDe?: (comun: string) => string | null | undefined;
}) {
  const lista = useMemo(() => listaDeTrozas(g.piezas, cientificoDe), [g.piezas, cientificoDe]);
  const total = totalM3(g.piezas);
  const numeros = g.listas.numeros;
  const nroHoja = (i: number) => (numeros[i] != null ? String(numeros[i]) : g.listas.texto || "—");
  const nroLista = numeros.length > 1 ? numeros.join(" y ") : nroHoja(0);
  return (
    <Bloque
      titulo="Lista de trozas a movilizar"
      hint={`La lista que viaja con la guía y a la que apunta el casillero (35): cada troza con su codificación, sus dos diámetros, su largo y su volumen. Cada hoja lleva hasta ${FILAS_POR_LISTA} trozas y su propio N°; el N° se cambia en «Datos de la guía».`}
      faltan={g.piezas.length > 0 && !g.listas.texto ? ["N° de la lista de trozas"] : undefined}
      acciones={
        <span className="text-sm text-[var(--text-secondary)]">
          {numeros.length > 1 ? "Listas" : "Lista"} N° <b className="font-mono tabular-nums text-[var(--text-primary)]">{nroLista}</b>
          {g.hojas > 1 && <span> · {g.hojas} hojas</span>}
        </span>
      }
    >
      <div className={MARCO}>
        <DataTable className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)]">
            <tr>
              <th className={THR}>N°</th>
              <th className={TH}>N. científico</th>
              <th className={TH}>N. común</th>
              <th className={TH}>Producto</th>
              <th className={TH}>Codificación</th>
              <th className={THR}>D1 cm</th>
              <th className={THR}>D2 cm</th>
              <th className={THR}>L m</th>
              <th className={THR}>Cant.</th>
              <th className={THR}>Vol. m³</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 ? (
              <tr>
                <td colSpan={10} className={`${TD} py-4 text-center text-[var(--text-tertiary)]`}>Todavía no hay trozas en la lista.</td>
              </tr>
            ) : (
              lista.map((f, i) => (
                <Fragment key={f.codificacion}>
                {g.hojas > 1 && i % FILAS_POR_LISTA === 0 && (
                  <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]">
                    <td colSpan={10} className={`${TD} font-semibold`}>
                      Lista N° <span className="font-mono tabular-nums">{nroHoja(i / FILAS_POR_LISTA)}</span>
                      <span className="font-normal text-[var(--text-secondary)]">
                        {" "}· hoja {i / FILAS_POR_LISTA + 1} de {g.hojas}
                      </span>
                    </td>
                  </tr>
                )}
                <tr className="border-t border-[var(--rule-soft)]">
                  <td className={`${TDR} text-[var(--text-tertiary)]`}>{(i % FILAS_POR_LISTA) + 1}</td>
                  <td className={`${TD} italic`}>{f.especieCientifica || "—"}</td>
                  <td className={TD}>{f.especieComun || "—"}</td>
                  <td className={`${TD} whitespace-nowrap`}>{f.producto}</td>
                  <td className={`${TD} font-mono font-bold`}>{f.codificacion}</td>
                  <td className={TDR}>{dec(f.d1Cm, 1)}</td>
                  <td className={TDR}>{dec(f.d2Cm, 1)}</td>
                  <td className={TDR}>{dec(f.largoM, 2)}</td>
                  <td className={TDR}>{f.cantidad}</td>
                  <td className={`${TDR} font-bold`}>{f.volumenM3 == null ? "—" : fmtM3(f.volumenM3)}</td>
                </tr>
                </Fragment>
              ))
            )}
          </tbody>
          {lista.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[var(--rule-base)]">
                <td colSpan={8} className={`${TD} text-right text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]`}>Total movilizado</td>
                <td className={TDR}>{lista.length}</td>
                <td className={`${TDR} font-bold`}>{fmtM3(total)}</td>
              </tr>
            </tfoot>
          )}
        </DataTable>
      </div>
    </Bloque>
  );
}
