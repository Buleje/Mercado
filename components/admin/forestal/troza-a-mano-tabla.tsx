"use client";

/**
 * La lista de las trozas anotadas a mano en el despacho con guía: qué código
 * imprime cada fila en la guía, sus medidas, el volumen y «quitar». Cada fila
 * avisa con una pastilla lo que el servidor rechazaría al registrar: la especie
 * (catálogo, T7) y el árbol (plan, especie del censo, T4).
 *
 * Salió de `LothGuiaTrozaAMano` (15-10) al sumar el árbol de origen: el alta y
 * la lista ya no entraban en 300 líneas.
 *
 * Es una PLANILLA (15-10): D1, D2, largo y cantidad se corrigen en la fila
 * (`CeldaAMano`) y las flechas pasan de una a otra como en el cubicador
 * (`useTecladoGrilla`); la última fila baja a la de alta. Arriba, la barra con
 * Leer (fila por fila, en voz alta) y Ordenar Ø con Deshacer/Rehacer.
 */

import { useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Trash2 } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { volumenDeFila, type ProblemaEspecieAMano } from "@/lib/forestal/loth-trozas-a-mano";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import { MARCO, TD, TDR, TH, THR } from "./LothGuiaListaMovilizar";
import { ETIQUETA_DEL_ARBOL } from "./arbol-de-troza-a-mano";
import { useTecladoGrilla } from "./celdas-excel";
import {
  CeldaAMano,
  COLUMNAS_A_MANO,
  COLUMNAS_A_MANO_MOVIL,
  GRILLA_A_MANO,
  MEDIDAS_EDITABLES,
} from "./troza-a-mano-celda";
import TrozaAManoBarra from "./troza-a-mano-barra";
import { idDeFilaAMano, useLecturaTrozasAMano } from "./hooks/use-lectura-trozas-a-mano";

const ETIQUETA = { d1: "D1 cm", d2: "D2 cm", largo: "L m", cantidad: "Cant." } as const;
const ERROR =
  "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]";
const AVISO =
  "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]";
const PASTILLA: Record<ProblemaEspecieAMano["tipo"], string> = { catalogo: ERROR, permiso: AVISO };
const PILDORA = "mt-0.5 mr-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold";
const FOTO = "bg-[var(--accent-soft)] text-[var(--accent-ink)]";

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
  const lectura = useLecturaTrozasAMano(g.aMano.filas);
  /* Lo que no se pudo corregir en una celda (volvió a lo último válido). */
  const [avisoCelda, setAvisoCelda] = useState<string | null>(null);
  /* Una sola grilla con la fila de alta (la que sigue a la última anotada). */
  const teclas = useTecladoGrilla({ grilla: GRILLA_A_MANO, columnas: COLUMNAS_A_MANO, totalFilas: filas.length + 1, envolver: true });
  const teclasMovil = useTecladoGrilla({ grilla: GRILLA_A_MANO, columnas: COLUMNAS_A_MANO_MOVIL, totalFilas: filas.length, envolver: true });
  if (filas.length === 0) return null;

  return (
    <div className="space-y-2">
      <TrozaAManoBarra aMano={g.aMano} lectura={lectura} />
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
              <th className={`${THR} hidden sm:table-cell`}>m³</th>
              <th className={TH}>
                <span className="sr-only">Quitar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ f, piezas, volumen }, i) => {
              const codigos = codigosDeFila(piezas.map((x) => x.codigo));
              const malEspecie = g.especiesAMano.problemaDe(f.especie);
              const arbol = g.arbolesAMano.revisar(f.arbolId, f.especie);
              /* T4 de la fila: lo anotado del árbol ya la incluye. */
              const pasaLaTala = arbol?.ok ? g.arbolesAMano.exceso(f.arbolId) : null;
              const leyendo = lectura.leyendoId === String(f.key);
              const celda = (c: (typeof MEDIDAS_EDITABLES)[number], j: number, movil: boolean) => (
                <CeldaAMano
                  fila={f}
                  campo={c}
                  filaGrilla={i}
                  col={(movil ? COLUMNAS_A_MANO_MOVIL : COLUMNAS_A_MANO)[j]}
                  otrasTrozas={g.piezas.length - f.cantidad}
                  etiqueta={`${ETIQUETA[c]} de ${codigos}`}
                  onCambio={(cambio) => g.aMano.editar(f.key, cambio)}
                  onError={setAvisoCelda}
                  onKeyDown={movil ? teclasMovil : teclas}
                  className={movil ? "px-1!" : "w-20"}
                />
              );
              return (
                <tr
                  key={f.key}
                  id={idDeFilaAMano(f.key)}
                  aria-current={leyendo ? "true" : undefined}
                  className={leyendo ? "bg-[var(--accent-soft)]! outline outline-2 -outline-offset-2 outline-[var(--accent)]" : ""}
                >
                  <td className={TD}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="whitespace-nowrap font-mono font-bold">{codigos}</span>
                      {/* A 400 px el m³ va acá: su columna les quitaba ancho a las medidas («38,5» se veía «38,»). */}
                      <span className="whitespace-nowrap font-mono font-bold sm:hidden">{fmtM3(volumen)} m³</span>
                    </span>
                    {f.especie && (
                      <span className="block text-xs font-semibold text-[var(--text-secondary)]">
                        {f.especie}
                      </span>
                    )}
                    {f.medidoPorFoto && (
                      <span title="El D1 salió de la foto de la carga" className={`${PILDORA} ${FOTO}`}>
                        Foto
                      </span>
                    )}
                    {f.d2Supuesto && (
                      <span title="No se midió la otra punta: va pareja (ADR-492). Anota el D2 si lo tienes." data-qa="d2-supuesto" className={`${PILDORA} ${AVISO}`}>
                        D2 = D1
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
                    {/* A 400 px, las cuatro medidas debajo del código (otras columnas de la grilla). */}
                    <span className="mt-1 grid grid-cols-4 gap-1 sm:hidden">
                      {MEDIDAS_EDITABLES.map((c, j) => (
                        <span key={c} className="grid gap-0.5">
                          <span className="text-xs font-semibold text-[var(--text-tertiary)]">{ETIQUETA[c]}</span>
                          {celda(c, j, true)}
                        </span>
                      ))}
                    </span>
                  </td>
                  {MEDIDAS_EDITABLES.map((c, j) => (
                    <td key={c} className={`${TDR} hidden sm:table-cell`}>
                      {celda(c, j, false)}
                    </td>
                  ))}
                  <td className={`${TDR} hidden font-bold sm:table-cell`}>{fmtM3(volumen)}</td>
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
                {totalTrozas} {totalTrozas === 1 ? "troza" : "trozas"} a mano · {fmtM3(totalVolumen)} m³
              </td>
              <td
                colSpan={4}
                className={`${TD} hidden text-right font-bold uppercase tracking-wide text-[var(--text-secondary)] sm:table-cell`}
              >
                A mano
              </td>
              <td className={`${TDR} hidden font-bold sm:table-cell`}>{totalTrozas}</td>
              <td className={`${TDR} hidden font-bold sm:table-cell`}>{fmtM3(totalVolumen)}</td>
              <td className={TD} />
            </tr>
          </tfoot>
        </DataTable>
      </div>
      {avisoCelda && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {avisoCelda}
        </p>
      )}
    </div>
  );
}
