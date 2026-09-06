"use client";

/**
 * LothSeccionTabla — la tabla de una sección del libro, leída como un libro:
 * ordenable por columna, con selección, con la suma al pie y con las líneas
 * corregidas marcadas.
 *
 * Lo que agrega respecto de la tabla que vivía inline en el módulo:
 *  · **orden por columna** (antes sólo llegaba el orden del backend);
 *  · **selección múltiple** para etiquetas QR, exportar y anular en lote;
 *  · **totales** —un libro sin suma obliga a sacar la calculadora—, sin contar
 *    las anuladas, que se ven pero no cuadran;
 *  · el vínculo de **subsanación**: qué línea corrige a cuál.
 */

import { DataTable } from "@buleje/design-system";
import { Ban, Copy, Eye, PencilLine, Share2 } from "@buleje/design-system/icons";
import { IconAction } from "./ctp-shared";
import {
  diasDeRegistro,
  estaFueraDePlazo,
  PLAZO_REGISTRO_DIAS,
  type LothEntryDTO,
  type LothSection,
} from "@/lib/forestal/loth-constants";
import { totalRelevante, totalesDe, type OrdenCampo, type OrdenDir } from "@/lib/forestal/loth-seccion";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

export interface ColDef {
  key: string;
  label: string;
  align?: "right";
  /** Campo por el que ordena esta columna (si se puede ordenar). */
  orden?: OrdenCampo;
  render: (e: LothEntryDTO) => React.ReactNode;
}

const TH = "px-4 py-2.5 text-left font-bold text-[var(--text-primary)]";
const TD = "px-4 py-2.5 align-top";

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export default function LothSeccionTabla({
  section,
  entries,
  cols,
  loading,
  orden,
  dir,
  onOrdenar,
  seleccion,
  onSeleccionar,
  onSeleccionarTodo,
  corregidaPor,
  mesCerrado = false,
  onDetalle,
  onCadena,
  onDuplicar,
  onCorregir,
  onAnular,
}: {
  section: LothSection;
  entries: LothEntryDTO[];
  cols: ColDef[];
  loading: boolean;
  orden: OrdenCampo;
  dir: OrdenDir;
  onOrdenar: (campo: OrdenCampo) => void;
  seleccion: Set<string>;
  onSeleccionar: (id: string) => void;
  onSeleccionarTodo: () => void;
  corregidaPor: Map<number, number>;
  /** El período está cerrado: las líneas son inmutables (invariante P1). */
  mesCerrado?: boolean;
  onDetalle: (e: LothEntryDTO) => void;
  onCadena: (code: string) => void;
  onDuplicar: (e: LothEntryDTO) => void;
  onCorregir: (e: LothEntryDTO) => void;
  onAnular: (e: LothEntryDTO) => void;
}) {
  const totales = totalesDe(entries);
  const queSuma = totalRelevante(section);
  const todasElegidas = entries.length > 0 && entries.every((e) => seleccion.has(e.id));

  return (
    <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <DataTable className="w-full text-sm">
        <thead className="bg-[var(--surface-sunken)]">
          <tr>
            <th className={`${TH} w-10`}>
              <input
                type="checkbox"
                checked={todasElegidas}
                onChange={onSeleccionarTodo}
                aria-label="Seleccionar todas las líneas de la página"
                className="h-4 w-4 cursor-pointer accent-[var(--data-info-600)]"
              />
            </th>
            <Encabezado label="N°" campo="lineNo" orden={orden} dir={dir} onOrdenar={onOrdenar} alinear="right" />
            <Encabezado label="Fecha" campo="fecha" orden={orden} dir={dir} onOrdenar={onOrdenar} />
            {cols.map((c) =>
              c.orden ? (
                <Encabezado key={c.key} label={c.label} campo={c.orden} orden={orden} dir={dir} onOrdenar={onOrdenar} alinear={c.align} />
              ) : (
                <th key={c.key} className={`${TH} ${c.align === "right" ? "text-right" : ""}`}>
                  {c.label}
                </th>
              ),
            )}
            <th className={TH}>Observaciones</th>
            <th className={`${TH} text-right`}>Acciones</th>
          </tr>
        </thead>

        <tbody>
          {entries.map((e) => {
            const anulada = e.status === "anulado";
            const corregida = corregidaPor.get(e.lineNo);
            const tarde = !anulada && estaFueraDePlazo(e.entryDate, e.createdAt);
            const elegida = seleccion.has(e.id);
            return (
              <tr
                key={e.id}
                className={`border-t border-[var(--rule-soft)] transition-colors hover:bg-[var(--surface-canvas)]/40 ${
                  anulada ? "opacity-50" : ""
                } ${elegida ? "bg-[var(--data-info-500)]/10" : ""}`}
              >
                <td className={TD}>
                  <input
                    type="checkbox"
                    checked={elegida}
                    onChange={() => onSeleccionar(e.id)}
                    aria-label={`Seleccionar la línea ${e.lineNo}`}
                    className="h-4 w-4 cursor-pointer accent-[var(--data-info-600)]"
                  />
                </td>
                <td className={`${TD} text-right`}>
                  <span className="font-mono tabular-nums text-[var(--text-tertiary)]">{e.lineNo}</span>
                </td>
                <td className={TD}>
                  <span className="text-[var(--text-secondary)]">{fmtFecha(e.entryDate)}</span>
                </td>
                {cols.map((c) => (
                  <td key={c.key} className={`${TD} ${c.align === "right" ? "text-right" : ""}`}>
                    {anulada && c.key === cols[0].key ? <span className="line-through">{c.render(e)}</span> : c.render(e)}
                  </td>
                ))}
                <td className={TD}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {e.discarded && <Etiqueta tono="error">descartado</Etiqueta>}
                    {anulada && <Etiqueta tono="error">ANULADA</Etiqueta>}
                    {corregida != null && <Etiqueta tono="info">corregida por N° {corregida}</Etiqueta>}
                    {e.correctsLineNo != null && <Etiqueta tono="info">corrige a N° {e.correctsLineNo}</Etiqueta>}
                    {tarde && (
                      <span
                        title={`Asentada ${diasDeRegistro(e.entryDate, e.createdAt)} días después de la actividad — SERFOR exige registro dentro de ${PLAZO_REGISTRO_DIAS} días`}
                        className="rounded-full bg-[var(--data-warning-500)]/15 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                      >
                        fuera de plazo · {diasDeRegistro(e.entryDate, e.createdAt)}d
                      </span>
                    )}
                    {e.observations && <span className="text-xs text-[var(--text-tertiary)]">{e.observations}</span>}
                    {anulada && e.annulledReason && (
                      <span className="text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">· {e.annulledReason}</span>
                    )}
                  </div>
                </td>
                <td className={`${TD} text-right`}>
                  <div className="inline-flex items-center justify-end gap-1">
                    <IconAction icon={Eye} label="Ver el detalle de la línea" onClick={() => onDetalle(e)} />
                    {(e.trozaCode || e.treeCode) && (
                      <IconAction
                        icon={Share2}
                        label="Ver la cadena de custodia de este árbol/troza"
                        onClick={() => onCadena((e.trozaCode || e.treeCode) as string)}
                      />
                    )}
                    {!anulada && !mesCerrado && (
                      <>
                        <IconAction icon={Copy} label="Duplicar: registrar otra línea partiendo de ésta" onClick={() => onDuplicar(e)} />
                        <IconAction
                          icon={PencilLine}
                          label="Corregir (subsanación SERFOR: se asienta una línea nueva, ésta queda)"
                          onClick={() => onCorregir(e)}
                        />
                        <IconAction icon={Ban} tone="danger" label="Anular (queda visible con su motivo)" onClick={() => onAnular(e)} />
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>

        {/* Pie: la suma. Un libro que no suma obliga a sacar la calculadora. */}
        {entries.length > 0 && !loading && (
          <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
            <tr>
              <td className={TD} colSpan={3}>
                <span className="text-xs font-black uppercase tracking-widest text-[var(--text-secondary)]">
                  Total · {totales.lineas} línea{totales.lineas === 1 ? "" : "s"}
                </span>
                {totales.anuladas > 0 && (
                  <span className="ml-2 text-xs text-[var(--text-tertiary)]">
                    ({totales.anuladas} anulada{totales.anuladas === 1 ? "" : "s"}, no suman)
                  </span>
                )}
              </td>
              {cols.map((c, i) => (
                <td key={c.key} className={`${TD} ${c.align === "right" ? "text-right" : ""}`}>
                  {i === cols.length - 1 && (
                    <span className="font-mono text-base font-black tabular-nums text-[var(--text-primary)]">
                      {queSuma === "volumen"
                        ? `${fmtM3(totales.volumenM3)} m³`
                        : queSuma === "cantidad"
                          ? totales.unidades.length > 1
                            ? "—"
                            : totales.unidades[0] === "m3"
                              ? `${fmtM3(totales.cantidad)} m³`
                              : `${totales.cantidad.toFixed(4)} ${totales.unidades[0] ?? ""}`
                          : ""}
                    </span>
                  )}
                </td>
              ))}
              <td className={TD} colSpan={2}>
                {queSuma === "cantidad" && totales.unidades.length > 1 && (
                  <span className="text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                    Hay {totales.unidades.length} unidades distintas ({totales.unidades.join(", ")}): sumarlas no daría un total real.
                  </span>
                )}
                {totales.piezas > 0 && (
                  <span className="ml-2 font-mono text-xs tabular-nums text-[var(--text-secondary)]">{totales.piezas} piezas</span>
                )}
              </td>
            </tr>
          </tfoot>
        )}
      </DataTable>
    </div>
  );
}

function Encabezado({
  label,
  campo,
  orden,
  dir,
  onOrdenar,
  alinear,
}: {
  label: string;
  campo: OrdenCampo;
  orden: OrdenCampo;
  dir: OrdenDir;
  onOrdenar: (c: OrdenCampo) => void;
  alinear?: "right";
}) {
  const activo = orden === campo;
  return (
    <th className={`${TH} ${alinear === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onOrdenar(campo)}
        title={`Ordenar por ${label.toLowerCase()}`}
        className={`inline-flex items-center gap-1 rounded transition-colors hover:text-[var(--accent)] ${
          activo ? "text-[var(--accent)]" : ""
        }`}
      >
        {label}
        {activo && <span aria-hidden="true">{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function Etiqueta({ children, tono }: { children: React.ReactNode; tono: "error" | "info" }) {
  const cls =
    tono === "error"
      ? "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
      : "bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide ${cls}`}>{children}</span>
  );
}
