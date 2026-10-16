"use client";

/**
 * «Lista de trozas a movilizar» del despacho con guía: la lista que viaja con
 * la guía y a la que apunta el casillero (33), partida en hojas como el papel —
 * cada `FILAS_POR_LISTA` filas, una lista con su N° (las guías de SERFOR: 34
 * trozas → listas 5 y 6). Separada de `LothGuiaTrozas` por tamaño (29-09-2026).
 *
 * 16-10-2026, con la cara del talonario («LISTA DE TROZAS»): la cabecera de la
 * imprenta con el (1) N° de la lista y el (2) GTF N°, la cabecera de dos filas
 * (ESPECIE, Dimensiones) con la numeración impresa, el N° de fila en tinta y
 * la fila (11) TOTAL. El «Producto», que el papel no tiene, va al final.
 */

import { Fragment, useMemo } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { listaDeTrozas, totalM3 } from "@/lib/forestal/loth-guia-despacho";
import { FILAS_POR_LISTA } from "@/lib/forestal/loth-lista-numero";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import { EstadoBloque } from "./ctp-guia-piezas";
import { EncabezadoGtfPapel, PapelGtf, RenglonGtf, TABLA_GTF, TD_GTF, TD_N_GTF, TD_NUM_GTF, TH_GTF } from "./gtf-papel";
import { encabezadoDelDespacho } from "./loth-guia-papel-piezas";

/* Las celdas de las tablas de la pestaña «Lista de trozas» (las usan
   `LothGuiaTrozas` y la tabla de trozas a mano). */
export const TH = "whitespace-nowrap px-2 py-2 text-left text-xs font-bold text-[var(--text-primary)]";
export const THR = `${TH} text-right`;
export const TD = "px-2 py-1.5 text-sm text-[var(--text-primary)]";
export const TDR = `${TD} text-right font-mono tabular-nums`;
export const MARCO = "overflow-x-auto rounded-xl border border-[var(--rule-soft)] sm:col-span-12";

export const dec = (v: number | null | undefined, n: number) => (v == null ? "—" : formatNumber(v, { min: n, max: n }));

/**
 * Los casilleros impresos de la hoja «LISTA DE TROZAS» del talonario. La lista
 * no tiene una tabla compartida como `CASILLEROS_GTF_2024` (la de la guía): si
 * se agrega, esto se muda allá.
 */
const LISTA = { gtf: "2", cientifico: "3", comun: "4", codificacion: "5", d1: "6", d2: "7", largo: "8", cantidad: "9", volumen: "10", total: "11" } as const;
const COLUMNAS = 10;

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
  const faltaNumero = g.piezas.length > 0 && !g.listas.texto;
  const hint = `La lista que viaja con la guía y a la que apunta el casillero (33): cada troza con su codificación, sus dos diámetros, su largo y su volumen. Cada hoja lleva hasta ${FILAS_POR_LISTA} trozas y su propio N°; el N° se cambia en «Datos de la guía».`;
  const th = (k: keyof typeof LISTA, texto: string) => `(${LISTA[k]}) ${texto}`;
  return (
    <section aria-label="Lista de trozas a movilizar">
      <PapelGtf>
        <EncabezadoGtfPapel
          hoja="lista"
          {...encabezadoDelDespacho(g)}
          numero={lista.length > 0 || g.listas.texto ? nroLista : null}
          extra={
            <>
              <RenglonGtf n={LISTA.gtf} rotulo="GTF N°" vacio="todavía sin N°" className="w-full max-w-xs">
                {g.gtfNumber.trim()}
              </RenglonGtf>
              <span className="flex flex-wrap items-center justify-center gap-2">
                <InfoTip title="Lista de trozas a movilizar" what={hint} ariaLabel="Qué es: Lista de trozas a movilizar" />
                {g.hojas > 1 && <span className="text-sm text-[var(--text-secondary)]">{g.hojas} hojas</span>}
                {faltaNumero && <EstadoBloque faltan={["N° de la lista de trozas"]} />}
              </span>
            </>
          }
        />
        {/* Excepción a DataTable (ADR-489): es la hoja del talonario, con su cabecera de dos filas y la numeración impresa. */}
        <div className="min-w-0 overflow-x-auto">
          <table className={`${TABLA_GTF} min-w-[46rem]`}>
            <caption className="sr-only">Lista de trozas a movilizar</caption>
            <thead>
              <tr>
                <th rowSpan={2} scope="col" className={`${TH_GTF} w-10`}>N°</th>
                <th colSpan={2} scope="colgroup" className={`${TH_GTF} uppercase`}>Especie</th>
                <th rowSpan={2} scope="col" className={TH_GTF}>{th("codificacion", "Codificación")}</th>
                <th colSpan={3} scope="colgroup" className={TH_GTF}>Dimensiones</th>
                <th rowSpan={2} scope="col" className={TH_GTF}>{th("cantidad", "Cantidad")}</th>
                <th rowSpan={2} scope="col" className={TH_GTF}>{th("volumen", "Volumen m³")}</th>
                <th rowSpan={2} scope="col" className={TH_GTF} title="No tiene casillero en el papel">Producto</th>
              </tr>
              <tr>
                <th scope="col" className={TH_GTF}>{th("cientifico", "Nombre científico")}</th>
                <th scope="col" className={TH_GTF}>{th("comun", "Nombre común o comercial")}</th>
                <th scope="col" className={TH_GTF}>{th("d1", "d1 cm")}</th>
                <th scope="col" className={TH_GTF}>{th("d2", "d2 cm")}</th>
                <th scope="col" className={TH_GTF}>{th("largo", "L m")}</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNAS} className={`${TD_GTF} text-center text-[var(--text-secondary)]`}>
                    Todavía no hay trozas en la lista.
                  </td>
                </tr>
              ) : (
                lista.map((f, i) => (
                  <Fragment key={f.codificacion}>
                    {g.hojas > 1 && i % FILAS_POR_LISTA === 0 && (
                      <tr>
                        <td colSpan={COLUMNAS} className={`${TD_GTF} bg-[var(--gtf-franja)] font-semibold text-[var(--gtf-tinta)]`}>
                          Lista N° <span className="font-mono tabular-nums">{nroHoja(i / FILAS_POR_LISTA)}</span>
                          <span className="font-normal"> · hoja {i / FILAS_POR_LISTA + 1} de {g.hojas}</span>
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className={TD_N_GTF}>{(i % FILAS_POR_LISTA) + 1}</td>
                      <td className={`${TD_GTF} italic`}>{f.especieCientifica || "—"}</td>
                      <td className={TD_GTF}>{f.especieComun || "—"}</td>
                      <td className={`${TD_GTF} font-mono font-bold`}>{f.codificacion}</td>
                      <td className={TD_NUM_GTF}>{dec(f.d1Cm, 1)}</td>
                      <td className={TD_NUM_GTF}>{dec(f.d2Cm, 1)}</td>
                      <td className={TD_NUM_GTF}>{dec(f.largoM, 2)}</td>
                      <td className={TD_NUM_GTF}>{f.cantidad}</td>
                      <td className={`${TD_NUM_GTF} font-bold`}>{f.volumenM3 == null ? "—" : fmtM3(f.volumenM3)}</td>
                      <td className={`${TD_GTF} whitespace-nowrap`}>{f.producto}</td>
                    </tr>
                  </Fragment>
                ))
              )}
            </tbody>
            {lista.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={7} className="px-2 py-1.5 text-right text-sm font-bold uppercase text-[var(--gtf-tinta)]">
                    ({LISTA.total}) Total
                  </td>
                  <td className={`${TD_NUM_GTF} font-bold`}>{lista.length}</td>
                  <td className={`${TD_NUM_GTF} font-bold`}>{fmtM3(total)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </PapelGtf>
    </section>
  );
}
