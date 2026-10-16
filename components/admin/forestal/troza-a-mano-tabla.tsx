"use client";

/**
 * La lista de las trozas anotadas a mano en el despacho con guía: qué código
 * imprime cada fila en la guía, sus medidas, el volumen y «quitar». Cada fila
 * avisa con una pastilla lo que el servidor rechazaría al registrar: la especie
 * (catálogo, T7) y el árbol (plan, especie del censo, T4).
 *
 * Salió de `LothGuiaTrozaAMano` (15-10) al sumar el árbol de origen: el alta y
 * la lista ya no entraban en 300 líneas.
 */

import { useMemo } from "react";
import { DataTable } from "@buleje/design-system";
import { Trash2 } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { volumenDeFila, type ProblemaEspecieAMano } from "@/lib/forestal/loth-trozas-a-mano";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import { MARCO, TD, TDR, TH, THR, dec } from "./LothGuiaListaMovilizar";
import { ETIQUETA_DEL_ARBOL } from "./arbol-de-troza-a-mano";

const cm = (m: number) => Math.round(m * 1000) / 10;
const ERROR =
  "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]";
const AVISO =
  "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]";
const PASTILLA: Record<ProblemaEspecieAMano["tipo"], string> = { catalogo: ERROR, permiso: AVISO };
const PILDORA = "mt-0.5 mr-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold";

/** Los códigos que imprime la guía para una fila: «4», «4 y 5», «4 a 9». */
function codigosDeFila(codigos: readonly string[]): string {
  if (codigos.length <= 1) return codigos[0] ?? "—";
  if (codigos.length === 2) return codigos.join(" y ");
  return `${codigos[0]} a ${codigos[codigos.length - 1]}`;
}

export default function TrozaAManoTabla({ g }: { g: DespachoGuiaLoth }) {
  /* Qué código imprime cada fila: `piezasManuales` sale en el orden de las filas. */
  const filas = useMemo(() => {
    let i = 0;
    return g.aMano.filas.map((f) => {
      const piezas = g.piezasManuales.slice(i, i + f.cantidad);
      i += f.cantidad;
      return { f, piezas, volumen: volumenDeFila(f) };
    });
  }, [g.aMano.filas, g.piezasManuales]);
  const totalTrozas = g.piezasManuales.length;
  const totalVolumen = filas.reduce((a, x) => a + x.volumen, 0);
  if (filas.length === 0) return null;

  return (
    <div className={MARCO}>
      <DataTable className="w-full">
        <thead>
          <tr>
            <th className={TH}>En la guía</th>
            {/* A 400 px las medidas y la cantidad van debajo del código: con 7 columnas,
                m³ y «quitar» quedaban tras un scroll lateral (450 px en 330). */}
            <th className={`${THR} hidden sm:table-cell`}>D1 cm</th>
            <th className={`${THR} hidden sm:table-cell`}>D2 cm</th>
            <th className={`${THR} hidden sm:table-cell`}>L m</th>
            <th className={`${THR} hidden sm:table-cell`}>Cant.</th>
            <th className={THR}>m³</th>
            <th className={TH}>
              <span className="sr-only">Quitar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map(({ f, piezas, volumen }) => {
            const p = piezas[0];
            const codigos = codigosDeFila(piezas.map((x) => x.codigo));
            const malEspecie = g.especiesAMano.problemaDe(f.especie);
            const arbol = g.arbolesAMano.revisar(f.arbolId, f.especie);
            /* T4 de la fila: lo anotado del árbol ya la incluye. */
            const pasaLaTala = arbol?.ok ? g.arbolesAMano.exceso(f.arbolId) : null;
            return (
              <tr key={f.key}>
                <td className={TD}>
                  <span className="whitespace-nowrap font-mono font-bold">{codigos}</span>
                  {f.especie && (
                    <span className="block text-xs font-semibold text-[var(--text-secondary)]">
                      {f.especie}
                    </span>
                  )}
                  {malEspecie && (
                    <span
                      title={malEspecie.motivo}
                      data-qa="especie-con-problema"
                      className={`${PILDORA} ${PASTILLA[malEspecie.tipo]}`}
                    >
                      {malEspecie.tipo === "catalogo"
                        ? "Ya no está en el catálogo"
                        : "Fuera del permiso"}
                    </span>
                  )}
                  {arbol && !arbol.ok && (
                    <span
                      title={arbol.mensaje}
                      data-qa="arbol-con-problema"
                      className={`${PILDORA} ${ERROR}`}
                    >
                      {ETIQUETA_DEL_ARBOL[arbol.code]}
                    </span>
                  )}
                  {pasaLaTala && (
                    <span
                      title={pasaLaTala}
                      data-qa="arbol-con-problema"
                      className={`${PILDORA} ${ERROR}`}
                    >
                      Pasa la tala del árbol
                    </span>
                  )}
                  {p && (
                    <span className="block font-mono text-xs tabular-nums text-[var(--text-secondary)] sm:hidden">
                      {dec(cm(p.diamMayorM ?? 0), 1)} · {dec(cm(p.diamMenorM ?? 0), 1)} cm ·{" "}
                      {dec(p.lengthM, 2)} m{f.cantidad > 1 && ` · ×${f.cantidad}`}
                    </span>
                  )}
                </td>
                <td className={`${TDR} hidden sm:table-cell`}>
                  {p ? dec(cm(p.diamMayorM ?? 0), 1) : "—"}
                </td>
                <td className={`${TDR} hidden sm:table-cell`}>
                  {p ? dec(cm(p.diamMenorM ?? 0), 1) : "—"}
                </td>
                <td className={`${TDR} hidden sm:table-cell`}>{p ? dec(p.lengthM, 2) : "—"}</td>
                <td className={`${TDR} hidden sm:table-cell`}>{f.cantidad}</td>
                <td className={`${TDR} font-bold`}>{fmtM3(volumen)}</td>
                <td className={`${TD} w-px`}>
                  <button
                    type="button"
                    onClick={() => g.aMano.quitar(f.key)}
                    aria-label={`Quitar la troza ${codigos}`}
                    title="Quitar de la guía"
                    className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-700)] dark:hover:bg-[var(--data-error-500)]/12 dark:hover:text-[var(--data-error-500)]"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--rule-base)]">
            <td className={`${TD} font-bold text-[var(--text-secondary)] sm:hidden`}>
              {totalTrozas} {totalTrozas === 1 ? "troza" : "trozas"} a mano
            </td>
            <td
              colSpan={4}
              className={`${TD} hidden text-right font-bold uppercase tracking-wide text-[var(--text-secondary)] sm:table-cell`}
            >
              A mano
            </td>
            <td className={`${TDR} hidden font-bold sm:table-cell`}>{totalTrozas}</td>
            <td className={`${TDR} font-bold`}>{fmtM3(totalVolumen)}</td>
            <td className={TD} />
          </tr>
        </tfoot>
      </DataTable>
    </div>
  );
}
