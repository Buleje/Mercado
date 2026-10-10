"use client";

/**
 * «Anuladas y otras» de la vista GTF del Libro TH (Brandon 07-10: «crea otra
 * sección de Anuladas o Rechazadas u otros: ahí estarán las guías anuladas,
 * eliminadas y otros; ya no estará la guía anulada en la misma sección»).
 *
 * Las trae `GET /api/admin/forestal/gtf?estado=bajas` (anuladas + borradas,
 * mismo filtro de permiso que la lista). Sólo lectura: ver sus datos e
 * imprimirlas con el sello de anulada. Cada columna con su autofiltro en el
 * título, como la tabla de guías vigentes.
 */

import { useMemo, type ReactNode } from "react";
import { DataTable } from "@buleje/design-system";
import { Ban, Loader2 } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatDateNumeric } from "@/lib/format";
import { limaDateKey } from "@/lib/utils";
import { BarraFiltrosTabla, FiltroEnCabecera, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro, type FiltrosTabla } from "./filtros-tabla-forestal";
import AccionesGtf from "./gtf-acciones-menu";
import type { Gtf } from "./gtf-tabla-columnas";
import { CasillaFilaGtf, CasillaTodasGtf, ElegirFiltradasMovil } from "./gtf-seleccion-casillas";
import type { SeleccionGuias } from "./hooks/use-seleccion-guias";

export type SituacionBaja = "Anulada" | "Eliminada";

export interface FilaBaja {
  g: Gtf;
  situacion: SituacionBaja;
  motivo: string | null;
  /** ISO de la baja: la del borrado, o la última modificación de la anulada. */
  fechaBaja: string | null;
}

/** Una guía dada de baja con lo que la tabla muestra de ella. Borrada manda sobre anulada. */
export function filaDeBaja(g: Gtf): FilaBaja {
  const eliminada = !!g.deletedAt;
  return {
    g,
    situacion: eliminada ? "Eliminada" : "Anulada",
    motivo: g.annulledReason?.trim() || null,
    fechaBaja: g.deletedAt ?? g.updatedAt ?? null,
  };
}

/** Para imprimir: la borrada sale con el mismo sello que la anulada. */
const conSello = (f: FilaBaja): Gtf =>
  f.situacion === "Eliminada"
    ? { ...f.g, status: "anulada", annulledReason: f.motivo ?? "Eliminada del libro" }
    : f.g;

const ddmm = (v: number | string) => (typeof v === "string" && v.length >= 10 ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : String(v));

const FILTROS_BAJAS: readonly ColumnaFiltro<FilaBaja>[] = [
  { id: "gtf", label: "N° GTF", tipo: "texto", valor: (f) => f.g.gtfNumber },
  { id: "situacion", label: "Situación", tipo: "multi", valor: (f) => f.situacion },
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (f) => f.g.gtfDate?.slice(0, 10) ?? null, formatearValor: ddmm },
  { id: "tipo", label: "Tipo", tipo: "multi", valor: (f) => (f.g.tipo === "producto" ? "Producto" : "Trozas") },
  { id: "titular", label: "Titular", tipo: "texto", valor: (f) => f.g.titularName },
  { id: "destino", label: "Destino", tipo: "texto", valor: (f) => f.g.destino },
  {
    id: "volumen",
    label: "Vol. m³",
    tipo: "rango",
    numero: (f) => (f.g.volumenTotalM3 == null ? null : Number(f.g.volumenTotalM3)),
    unidad: "m³",
    paso: 0.001,
  },
  { id: "motivo", label: "Motivo", tipo: "texto", valor: (f) => f.motivo },
  { id: "baja", label: "Fecha de baja", tipo: "fecha", numero: (f) => (f.fechaBaja ? limaDateKey(f.fechaBaja) : null), formatearValor: ddmm },
];

const TH = "px-3 py-2.5 font-bold text-[var(--text-primary)]";
const TD = "px-3 py-2.5";

function Th({ id, f, children, className = "", title }: { id: string; f: FiltrosTabla<FilaBaja>; children: ReactNode; className?: string; title?: string }) {
  return (
    <th className={`${TH} ${className}`} title={title}>
      <span className="whitespace-nowrap">
        {children}
        <FiltroEnCabecera id={id} f={f} compacto />
      </span>
    </th>
  );
}

const ESTILO_SITUACION: Record<SituacionBaja, string> = {
  Anulada: "bg-[var(--data-error-100)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]",
  Eliminada: "bg-[var(--surface-canvas)] text-[var(--text-secondary)]",
};

export default function LothGtfBajas({
  bajas,
  cargando,
  error,
  focusGtf,
  onReintentar,
  onHoja,
  onResumen,
  seleccion,
}: {
  bajas: readonly Gtf[];
  cargando: boolean;
  error: string | null;
  focusGtf?: string | null;
  onReintentar: () => void;
  onHoja: (g: Gtf) => void;
  onResumen: (g: Gtf) => void;
  /** Casillas para declarar las anuladas en un trámite (07-10). Una eliminada no se declara: sin casilla. */
  seleccion?: SeleccionGuias;
}) {
  const filas = useMemo(() => bajas.map(filaDeBaja), [bajas]);
  const f = useFiltrosTabla(filas, FILTROS_BAJAS);
  const filtradas = f.filtradas;
  const COLUMNAS = seleccion ? 11 : 10;
  const idsAnuladas = useMemo(() => filtradas.filter((x) => x.situacion === "Anulada").map((x) => x.g.id), [filtradas]);

  if (cargando) return <div className="p-6 text-center text-[var(--text-tertiary)]"><Loader2 className="mx-auto h-5 w-5 animate-spin" aria-label="Cargando las guías dadas de baja" /></div>;
  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
        <span>{error}</span>
        <button type="button" onClick={onReintentar} className="inline-flex h-9 items-center rounded-lg border-2 border-[var(--data-error-500)] px-3 text-xs font-bold hover:bg-[var(--data-error-100)]">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <BarraFiltrosTabla f={f} />
      <div className="overflow-x-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <DataTable filtrable className="w-full text-sm" aria-label="Guías anuladas y eliminadas">
          <thead className="bg-[var(--surface-sunken)] text-left align-top">
            <tr>
              {seleccion && <CasillaTodasGtf ids={idsAnuladas} sel={seleccion} etiqueta={`Elegir las ${idsAnuladas.length} anuladas filtradas`} />}
              <Th id="gtf" f={f}>N° GTF</Th>
              <Th id="situacion" f={f}>Situación</Th>
              <Th id="fecha" f={f}>Fecha</Th>
              <Th id="tipo" f={f}>Tipo</Th>
              <Th id="titular" f={f}>Titular</Th>
              <Th id="destino" f={f}>Destino</Th>
              <Th id="volumen" f={f} className="text-right">Vol. m³</Th>
              <Th id="motivo" f={f}>Motivo</Th>
              <Th id="baja" f={f} title="Anulada: la fecha de su última modificación (la anulación). Eliminada: la del borrado.">Fecha de baja</Th>
              <th className={`${TH} w-px text-right`}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((fila) => {
              const { g } = fila;
              return (
                <tr
                  key={g.id}
                  className={`border-t border-[var(--rule-soft)] ${g.gtfNumber === focusGtf ? "bg-[var(--data-info-500)]/15 outline outline-2 -outline-offset-2 outline-[var(--data-info-500)]" : ""}`}
                >
                  {seleccion && (fila.situacion === "Anulada"
                    ? <CasillaFilaGtf id={g.id} numero={g.gtfNumber} sel={seleccion} />
                    : <td data-label="Elegir" className="w-px px-1 py-1.5 text-center text-[var(--text-tertiary)]" title="Una guía eliminada no se declara">—</td>)}
                  <td data-label="N° GTF" className={TD}><span className="font-mono font-bold text-[var(--text-primary)] line-through decoration-[var(--data-error-500)]/60">{g.gtfNumber}</span></td>
                  <td data-label="Situación" className={TD}>
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${ESTILO_SITUACION[fila.situacion]}`}>{fila.situacion}</span>
                  </td>
                  <td data-label="Fecha" className={`${TD} whitespace-nowrap text-[var(--text-secondary)]`}>{g.gtfDate ? formatDateNumeric(g.gtfDate, { soloFecha: true }) : "—"}</td>
                  <td data-label="Tipo" className={`${TD} text-[var(--text-secondary)]`}>{g.tipo === "producto" ? "Producto" : "Trozas"}</td>
                  <td data-label="Titular" className={`${TD} text-[var(--text-primary)]`}>{g.titularName ?? "—"}</td>
                  <td data-label="Destino" className={`${TD} text-[var(--text-secondary)]`}>{g.destino ?? "—"}</td>
                  <td data-label="Vol. m³" className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>{g.volumenTotalM3 ? fmtM3(Number(g.volumenTotalM3)) : "—"}</td>
                  <td data-label="Motivo" className={`${TD} max-w-[22rem] text-[var(--text-secondary)]`}>{fila.motivo ?? "—"}</td>
                  <td data-label="Fecha de baja" className={`${TD} whitespace-nowrap text-[var(--text-secondary)]`}>{fila.fechaBaja ? formatDateNumeric(fila.fechaBaja) : "—"}</td>
                  <td data-label="Acciones" className={`${TD} w-px`}>
                    <AccionesGtf g={g} soloLectura onHoja={() => onHoja(conSello(fila))} onResumen={() => onResumen(conSello(fila))} />
                  </td>
                </tr>
              );
            })}
            {filas.length > 0 && filtradas.length === 0 && <SinCoincidenciasFila colSpan={COLUMNAS} />}
            {filas.length === 0 && (
              <tr>
                <td colSpan={COLUMNAS} className="px-4 py-10 text-center text-[var(--text-tertiary)]">
                  <Ban className="mx-auto mb-2 h-8 w-8 opacity-30" aria-hidden />
                  No hay guías anuladas ni eliminadas.
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </div>
      {filtradas.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--text-tertiary)]">
            {filtradas.length === filas.length ? `${filas.length} guía${filas.length === 1 ? "" : "s"} dada${filas.length === 1 ? "" : "s"} de baja` : `${filtradas.length} de ${filas.length} guías dadas de baja`}
          </p>
          {seleccion && <ElegirFiltradasMovil ids={idsAnuladas} sel={seleccion} />}
        </div>
      )}
    </div>
  );
}
