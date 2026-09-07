"use client";

/**
 * Qué hay DETRÁS de una fila del balance de capacidad.
 *
 * La tarjeta contesta «cuánto puede salir»; esto contesta «de qué está hecho
 * ese número». Sin el detalle, un total de 84 m³ hay que creerlo: no se puede
 * cruzar contra el patio ni contra una guía, que es exactamente lo que pide un
 * fiscalizador —y lo que hace el dueño antes de comprometer una venta—.
 *
 * Las filas las arma `lib/forestal/capacidad-detalle-filas.ts`, la MISMA
 * función que alimenta el Excel y el PDF: lo que se ve es lo que se baja.
 *
 * Un lote se despliega y muestra sus piezas, cada una con su guía: es el cruce
 * lote↔guía que antes obligaba a salir a la Ficha del lote.
 *
 * El reporte que baja de acá es SÓLO lo filtrado, y lo dice en el encabezado:
 * un PDF que no declara su filtro se archiva como si fuera todo el patio.
 */

import { Fragment, useMemo, useState } from "react";
import AdminModal from "@/components/admin/shared/AdminModal";
import { DataTable } from "@buleje/design-system";
import {
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Layers,
  Printer,
} from "@buleje/design-system/icons";
import { Btn, MODAL_BODY } from "../ctp-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import {
  hayFiltro,
  type EntradaCapacidad,
  type FiltrosCapacidad,
  type FuenteDeCapacidad,
} from "@/lib/forestal/capacidad-de-planta";
import {
  esColumnaM3,
  esColumnaNumerica,
  filasPlanas,
  tablaDeFuente,
  type Celda,
} from "@/lib/forestal/capacidad-detalle-filas";
import { printCapacidadDetalle } from "@/lib/forestal/capacidad-detalle-print";

const pt = (v: number) => pieTablarDe(v).toLocaleString("es-PE");

/** Cómo se lee el filtro puesto, para el encabezado y para el reporte. */
export function textoDeFiltros(f: FiltrosCapacidad): string {
  const partes = [
    f.permiso && `permiso ${f.permiso}`,
    f.especie && `especie ${f.especie}`,
    f.guia && `guía ${f.guia}`,
  ].filter(Boolean);
  return partes.length === 0 ? "Toda la planta" : `Sólo ${partes.join(" · ")}`;
}

function Valor({ col, v }: { col: string; v: Celda }) {
  if (typeof v !== "number") return <>{v}</>;
  return <>{esColumnaM3(col) ? fmtM3(v) : v.toLocaleString("es-PE")}</>;
}

export default function DetalleDeFuente({
  fuente,
  entrada,
  filtros,
  periodoLabel,
  onClose,
}: {
  fuente: FuenteDeCapacidad;
  entrada: EntradaCapacidad;
  filtros: FiltrosCapacidad;
  periodoLabel: string;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());
  const tabla = useMemo(() => tablaDeFuente(fuente, entrada, filtros), [fuente, entrada, filtros]);
  const { columnas, filas } = tabla;
  const planas = useMemo(() => filasPlanas(tabla), [tabla]);
  const nombreArchivo = `capacidad-${fuente.clave}-${periodoLabel}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const conHijas = filas.some((f) => f.hijas);

  const alternar = (i: number) =>
    setAbiertas((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const excel = async () => {
    setError(null);
    try {
      const { exportSheetsToExcel } = await import("@/lib/export-excel");
      await exportSheetsToExcel(
        [
          { nombre: fuente.label.slice(0, 31), filas: planas },
          /* Las piezas de los lotes van en su hoja, con el lote al lado: en el
             archivo no hay filas que desplegar. */
          ...(conHijas
            ? [
                {
                  nombre: "Piezas por lote",
                  filas: filas.flatMap((f) =>
                    (f.hijas?.filas ?? []).map((h) => ({ Lote: f.celdas[columnas[0]], ...h })),
                  ),
                },
              ]
            : []),
          {
            /* El filtro viaja EN el archivo: un Excel suelto en un correo no
               tiene cómo decir de qué recorte salió. */
            nombre: "Qué se exportó",
            filas: [
              { Dato: "Fuente", Valor: fuente.label },
              { Dato: "Filtro", Valor: textoDeFiltros(filtros) },
              { Dato: "Período del libro", Valor: periodoLabel },
              { Dato: "Filas", Valor: filas.length },
              { Dato: "En producto (m³)", Valor: fuente.enProducto },
              { Dato: "En producto (pt)", Valor: pieTablarDe(fuente.enProducto) },
            ],
          },
        ],
        nombreArchivo,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const pdf = () => {
    setError(null);
    try {
      printCapacidadDetalle({
        titulo: fuente.label,
        filtro: textoDeFiltros(filtros),
        periodoLabel,
        columnas,
        filas: planas,
        totalM3: fuente.m3,
        enProductoM3: fuente.enProducto,
        convertido: fuente.convertido,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      title={`${fuente.label} · detalle`}
      description={`${textoDeFiltros(filtros)} — ${filas.length} ${filas.length === 1 ? "fila" : "filas"}`}
      icon={Layers}
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5">
          <span className="text-sm text-[var(--text-secondary)]">
            {fmtM3(fuente.m3)} m³ hoy
            {fuente.convertido && " · al 56 %"} →{" "}
            <strong className="text-[var(--text-primary)]">{fmtM3(fuente.enProducto)} m³</strong>{" "}
            <span className="font-mono text-[var(--text-tertiary)]">
              ({pt(fuente.enProducto)} pt)
            </span>
          </span>
          <span className="flex gap-2">
            <Btn variant="secondary" size="sm" onClick={pdf} disabled={filas.length === 0}>
              <Printer className="h-4 w-4" /> PDF
            </Btn>
            <Btn
              variant="secondary"
              size="sm"
              onClick={() => void excel()}
              disabled={filas.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Btn>
          </span>
        </div>

        {fuente.detalle && <p className="text-xs text-[var(--text-tertiary)]">{fuente.detalle}</p>}

        {error && (
          <p className="rounded-xl border-2 border-[var(--data-error-500)] px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            {error}
          </p>
        )}

        {filas.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">
            {fuente.noAtribuible ?? `Sin filas${hayFiltro(filtros) ? " con este filtro" : ""}.`}
          </p>
        ) : (
          <DataTable>
            <thead>
              <tr>
                {conHijas && <th className="w-8" aria-label="Desplegar" />}
                {columnas.map((c) => (
                  <th key={c} className={esColumnaNumerica(c) ? "text-right" : undefined}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const abierta = abiertas.has(i);
                return (
                  <Fragment key={`${f.celdas[columnas[0]]}-${i}`}>
                    <tr>
                      {conHijas && (
                        <td className="px-1">
                          {f.hijas ? (
                            <button
                              type="button"
                              onClick={() => alternar(i)}
                              aria-expanded={abierta}
                              aria-label={abierta ? "Ocultar piezas" : "Ver piezas"}
                              className="rounded p-1 text-[var(--accent-dark)] hover:bg-[var(--accent-soft)] dark:text-[var(--accent)]"
                            >
                              {abierta ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          ) : null}
                        </td>
                      )}
                      {columnas.map((c) => (
                        <td
                          key={c}
                          className={
                            typeof f.celdas[c] === "number"
                              ? "text-right font-mono tabular-nums"
                              : undefined
                          }
                        >
                          <Valor col={c} v={f.celdas[c]} />
                        </td>
                      ))}
                    </tr>
                    {abierta && f.hijas && (
                      <tr>
                        <td
                          colSpan={columnas.length + 1}
                          className="bg-[var(--surface-sunken)] px-4 py-2"
                        >
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-[var(--text-tertiary)]">
                                {f.hijas.columnas.map((c) => (
                                  <th
                                    key={c}
                                    className={`py-1 font-bold ${esColumnaNumerica(c) ? "text-right" : "text-left"}`}
                                  >
                                    {c}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {f.hijas.filas.map((h, j) => (
                                <tr key={j} className="border-t border-[var(--rule-soft)]">
                                  {f.hijas!.columnas.map((c) => (
                                    <td
                                      key={c}
                                      className={`py-1 ${typeof h[c] === "number" ? "text-right font-mono tabular-nums" : ""}`}
                                    >
                                      <Valor col={c} v={h[c]} />
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </div>
    </AdminModal>
  );
}
