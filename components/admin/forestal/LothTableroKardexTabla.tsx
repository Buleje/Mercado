"use client";

/**
 * La tabla del Kárdex del permiso: saldo inicial → un renglón por movimiento →
 * cierre. Los casilleros que el movimiento cambió van en negrita; una línea
 * anulada se ve tachada y dice «no cuenta».
 *
 * Con muchos movimientos se ven los últimos (`VISIBLES`): el cierre, que es lo
 * que se mira primero, queda siempre a la vista.
 *
 * Con `filtros`, cada cabecera lleva su autofiltro (Brandon 07-10). Filtrar
 * esconde renglones: la negrita de «lo que cambió» se sigue midiendo contra el
 * renglón ANTERIOR del kárdex, no contra el anterior que quedó a la vista.
 */

import { DataTable } from "@buleje/design-system";
import { useMemo, useState } from "react";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  cierreDelKardex,
  saldoDeFila,
  saldoInicial,
  type FilaKardex,
  type KardexPermiso,
  type ResumenKardex,
} from "@/lib/forestal/loth-kardex";
import type { CascadaEspecie } from "@/lib/forestal/loth-saldo-cascada";
import type { BandaPermiso } from "@/lib/forestal/loth-tablero-permiso";
import {
  CASILLEROS,
  FIJA,
  NUM,
  PIE_COMO_TABLA,
  SOLO_ESCRITORIO,
  TD,
  TH,
} from "./loth-kardex-estilos";
import { HOJA_MOVIL } from "./loth-tablero-estilos";
import LothTableroKardexFila from "./LothTableroKardexFila";
import { FiltroEnCabecera, SinCoincidenciasFila, type FiltrosTabla } from "./filtros-tabla-forestal";
import { ETIQUETA_CASILLERO } from "./loth-kardex-filtros";
import type { NavTablero } from "./LothTableroTabla";

const VISIBLES = 300;

export default function LothTableroKardexTabla({
  k,
  filas,
  clave,
  banda,
  resumen,
  hoyKey,
  nav,
  filtros,
}: {
  k: KardexPermiso;
  filas: readonly FilaKardex[];
  /** El autofiltro de cada columna, sobre `filas` (`useFiltrosTabla`). */
  filtros?: FiltrosTabla<FilaKardex>;
  clave: string | null;
  banda: BandaPermiso;
  resumen: ResumenKardex;
  hoyKey: string;
  nav?: NavTablero;
}) {
  const [verTodo, setVerTodo] = useState(false);
  const casilleros = k.sinBase ? CASILLEROS.slice(1) : CASILLEROS;
  const columnas = 5 + casilleros.length;
  const inicial = saldoInicial(k, clave);
  const cierre = cierreDelKardex(k, clave);
  const conFiltro = (filtros?.activos ?? 0) > 0;
  const pasan = useMemo(() => (filtros && conFiltro ? new Set(filtros.filtradas.map((f) => f.id)) : null), [filtros, conFiltro]);

  /* Cada renglón con el saldo anterior (del kárdex entero, antes de filtrar),
     para poner en negrita lo que el movimiento cambió. */
  const todos: { f: FilaKardex; s: CascadaEspecie | null; previo: CascadaEspecie | null }[] = [];
  let previo: CascadaEspecie | null = inicial;
  for (const f of filas) {
    const s = f.anulada ? null : saldoDeFila(f, clave);
    if (!pasan || pasan.has(f.id)) todos.push({ f, s, previo });
    if (s) previo = s;
  }
  const ocultas = verTodo ? 0 : Math.max(0, todos.length - VISIBLES);
  const vista = ocultas > 0 ? todos.slice(ocultas) : todos;
  const filtro = (id: string) => (filtros ? <FiltroEnCabecera id={id} f={filtros} compacto /> : null);

  return (
    <div className="min-w-0 space-y-2">
      {ocultas > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
          Se ven los últimos {VISIBLES} de {todos.length} movimientos.
          <button
            type="button"
            onClick={() => setVerTodo(true)}
            className="font-semibold text-[var(--accent-dark)] underline-offset-2 hover:underline dark:text-[var(--accent)]"
          >
            Ver los {ocultas} anteriores
          </button>
        </p>
      )}
      <DataTable
        className={`w-full ${HOJA_MOVIL} ${PIE_COMO_TABLA}`}
        wrapperClassName="max-w-full rounded-2xl bg-[var(--surface-raised)]"
      >
        <thead>
          <tr>
            {/* z-[2], no el z-[1] de FIJA: el popover del filtro tiene que pasar por
                encima de la primera celda (también fija) de cada renglón. */}
            <th className={`${TH} sticky left-0 z-[2] border-r`}>
              <span className="whitespace-nowrap">Fecha · N°{filtro("fecha")}{filtro("doc")}</span>
            </th>
            <th className={`${TH} ${SOLO_ESCRITORIO}`}>
              <span className="whitespace-nowrap">Movimiento{filtro("mov")}</span>
            </th>
            <th className={`${TH} ${SOLO_ESCRITORIO}`}>
              <span className="whitespace-nowrap">Especie · troza{filtro("especie")}</span>
            </th>
            <th className={`${TH} text-right`}>
              <span className="whitespace-nowrap">Entra m³{filtro("entra")}</span>
            </th>
            <th className={`${TH} text-right`}>
              <span className="whitespace-nowrap">Sale m³{filtro("sale")}</span>
            </th>
            {casilleros.map((c) => (
              <th
                key={c}
                className={`${TH} text-right`}
                title={c === "taladoSinTrozarM3" ? "Talado sin trozar: lo que sigue en el monte, con la merma" : undefined}
              >
                <span className="whitespace-nowrap">
                  {ETIQUETA_CASILLERO[c]}
                  {filtro(c)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ocultas === 0 && (
            <tr
              className="bg-[var(--surface-sunken)]/60"
              data-kardex-inicial
            >
              <td
                className={`${TD} ${FIJA} bg-[var(--surface-sunken)] font-semibold whitespace-nowrap`}
              >
                Saldo inicial
              </td>
              <td
                className={`${TD} ${SOLO_ESCRITORIO} italic text-[var(--text-secondary)]`}
                colSpan={2}
              >
                {banda.baseLabel} del permiso
              </td>
              <td className={NUM}>—</td>
              <td className={NUM}>—</td>
              {casilleros.map((c) => (
                <td key={c} className={`${NUM} text-[var(--text-secondary)]`}>
                  {fmtM3(inicial[c])}
                </td>
              ))}
            </tr>
          )}
          {conFiltro && filas.length > 0 && vista.length === 0 && <SinCoincidenciasFila colSpan={columnas} />}
          {filas.length === 0 && (
            <tr>
              <td
                colSpan={columnas}
                className="text-center text-[var(--text-tertiary)]"
              >
                Todavía no hay movimientos {clave ? "de esta especie" : "en este permiso"}.
              </td>
            </tr>
          )}
          {vista.map(({ f, s, previo: antes }) => (
            <LothTableroKardexFila
              key={f.id}
              f={f}
              s={s}
              previo={antes}
              casilleros={casilleros}
              sinBase={k.sinBase}
              hoyKey={hoyKey}
              nav={nav}
            />
          ))}
        </tbody>
        {cierre && (
          <tfoot>
            <tr
              className="border-t-2 border-[var(--rule-strong)] bg-[var(--surface-sunken)] font-bold"
              data-kardex-cierre
            >
              <td className={`${TD} ${FIJA} bg-[var(--surface-sunken)]`}>
                Cierre
              </td>
              <td
                className={`${TD} ${SOLO_ESCRITORIO}`}
                colSpan={2}
                /* El pie vuelve a tabla con `table-cell!`, que le gana a `max-sm:hidden!`: esto lo esconde igual. */
                data-solo-escritorio
              >
                {clave ? cierre.especie : ""}
              </td>
              <td className={`${NUM}`}>{fmtM3(resumen.entraM3)}</td>
              <td className={`${NUM}`}>{fmtM3(resumen.saleM3)}</td>
              {casilleros.map((c) => (
                <td
                  key={c}
                  className={`${NUM} ${cierre[c] < 0 ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-primary)]"}`}
                >
                  {fmtM3(cierre[c])}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </DataTable>
    </div>
  );
}
