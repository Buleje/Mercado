"use client";

/**
 * LothGtfTabla — la tabla de guías (GTF) del Libro TH, separada de su vista
 * (`LothGtfView`). Cada columna lleva su autofiltro estilo Excel en el título
 * (Brandon, 07-10: «la tabla tiene que tener en sus encabezados todos sus
 * filtros»), se puede ocultar desde «Columnas» y arrastrar de lugar.
 *
 * La lista llega ENTERA del servidor (`/api/admin/forestal/gtf`, ≤200) y se
 * pagina acá: por eso el autofiltro local de `filtros-tabla-forestal` aplica.
 * Las acciones de cada fila van en un menú ⋯ (`gtf-acciones-menu`, 07-10).
 */

import { useEffect, useMemo, useState, type ReactNode, type RefObject } from "react";
import { DataTable } from "@buleje/design-system";
import { FileText } from "@buleje/design-system/icons";
import { EnOrden, type UseOrdenColumnasResult, type UseVisibilidadColumnasResult } from "@/components/admin/shared/columnas-ordenables";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { PlanDeLaGuia } from "@/lib/forestal/gtf-columnas";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla } from "./filtros-tabla-forestal";
import { FILTROS_GTF, cabecerasGtf, celdasGtf, filasGtf, type FilaGtf, type Gtf } from "./gtf-tabla-columnas";
import AccionesGtf from "./gtf-acciones-menu";
import { CasillaFilaGtf, CasillaTodasGtf, ElegirFiltradasMovil } from "./gtf-seleccion-casillas";
import type { SeleccionGuias } from "./hooks/use-seleccion-guias";

const POR_PAGINA = 25;

export interface LothGtfTablaProps {
  gtfs: Gtf[];
  /** Los planes del libro (id → tipo y resolución) para «Tipo de plan» y «Permiso». */
  planes: readonly (PlanDeLaGuia & { id: string })[];
  /** El buscador general de la vista (no es una columna sola). */
  busqueda: string;
  /** N° de las guías de trozas que la bandeja del CTP ofrece ingresar. */
  sinIngresar: ReadonlySet<string>;
  focusGtf?: string | null;
  filaEnfocada: RefObject<HTMLTableRowElement | null>;
  orden: UseOrdenColumnasResult;
  vis: UseVisibilidadColumnasResult;
  onIngresarCtp: (gtfNumber: string) => void;
  onHoja: (g: Gtf) => void;
  onResumen: (g: Gtf) => void;
  onAnular: (id: string) => void;
  onRecargar: () => void;
  /** Casillas para usar las guías en un trámite (07-10). Sin esto, la tabla de siempre. */
  seleccion?: SeleccionGuias;
}

/** Minúsculas sin tildes, para el buscador general. */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function buscar(filas: FilaGtf[], q: string): FilaGtf[] {
  const t = norm(q.trim());
  if (!t) return filas;
  return filas.filter(({ g, origen, resolucion }) =>
    norm(
      [g.gtfNumber, origen.registro, g.titularName, g.destino, g.transportista, g.placaVehiculo, g.origen, g.tituloHabilitante, resolucion]
        .filter(Boolean)
        .join(" "),
    ).includes(t),
  );
}

export default function LothGtfTabla({
  gtfs, planes, busqueda, sinIngresar, focusGtf, filaEnfocada, orden, vis,
  onIngresarCtp, onHoja, onResumen, onAnular, onRecargar, seleccion,
}: LothGtfTablaProps) {
  const planesPorId = useMemo(() => new Map(planes.map((p) => [p.id, p])), [planes]);
  const filas = useMemo(() => filasGtf(gtfs, planesPorId), [gtfs, planesPorId]);
  const buscadas = useMemo(() => buscar(filas, busqueda), [filas, busqueda]);
  /* La columna oculta manda su filtro al panel (nunca un filtro huérfano). */
  const { esVisible } = vis;
  const columnasFiltro = useMemo(() => FILTROS_GTF.map((c) => ({ ...c, visible: esVisible(c.id) })), [esVisible]);
  const f = useFiltrosTabla(buscadas, columnasFiltro);

  const [pagina, setPagina] = useState(0);
  useEffect(() => setPagina(0), [busqueda, f.facetas, f.textos]);
  const filtradas = f.filtradas;
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pagActual = Math.min(pagina, totalPaginas - 1);
  const enPagina = filtradas.slice(pagActual * POR_PAGINA, (pagActual + 1) * POR_PAGINA);
  /* Vista previa del volumen de lo filtrado (el total del libro lo da el servidor). */
  const volumenFiltrado = filtradas.filter((x) => x.g.status !== "anulada").reduce((a, x) => a + Number(x.g.volumenTotalM3 ?? 0), 0);

  const ordenVisible = vis.filtrar(orden.orden);
  const soloVisibles = (celdas: Record<string, ReactNode>) =>
    Object.fromEntries(Object.entries(celdas).filter(([id]) => esVisible(id)));
  const columnasTotal = ordenVisible.length + 1 + (seleccion ? 1 : 0);
  const idsFiltradas = useMemo(() => filtradas.map((x) => x.g.id), [filtradas]);

  return (
    <div className="space-y-3">
      <BarraFiltrosTabla f={f} />
      <div className="overflow-x-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <DataTable filtrable className="w-full text-sm">
          <thead ref={orden.refCabecera} className="bg-[var(--surface-sunken)] text-left align-top">
            <tr>
              {seleccion && <CasillaTodasGtf ids={idsFiltradas} sel={seleccion} etiqueta={`Elegir las ${idsFiltradas.length} guías filtradas`} />}
              <EnOrden orden={ordenVisible} celdas={soloVisibles(cabecerasGtf(f))} />
              <th className="w-px px-3 py-2.5 text-right font-bold text-[var(--text-primary)]">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {enPagina.map((fila) => {
              const g = fila.g;
              return (
                <tr
                  key={g.id}
                  ref={g.gtfNumber === focusGtf ? filaEnfocada : undefined}
                  className={`border-t border-[var(--rule-soft)] ${g.status === "anulada" ? "opacity-50" : ""} ${
                    g.gtfNumber === focusGtf ? "bg-[var(--data-info-500)]/15 outline outline-2 -outline-offset-2 outline-[var(--data-info-500)]" : ""
                  }`}
                >
                  {seleccion && <CasillaFilaGtf id={g.id} numero={g.gtfNumber} sel={seleccion} />}
                  <EnOrden orden={ordenVisible} celdas={soloVisibles(celdasGtf(fila))} />
                  <td data-label="Acciones" className="w-px px-3 py-2.5">
                    <AccionesGtf
                      g={g}
                      porIngresar={g.tipo !== "producto" && g.status !== "anulada" && sinIngresar.has(g.gtfNumber)}
                      onIngresarCtp={onIngresarCtp}
                      onHoja={onHoja}
                      onResumen={onResumen}
                      onAnular={onAnular}
                      onRecargar={onRecargar}
                    />
                  </td>
                </tr>
              );
            })}
            {gtfs.length > 0 && filtradas.length === 0 && <SinCoincidenciasFila colSpan={columnasTotal} />}
            {gtfs.length === 0 && (
              <tr>
                <td colSpan={columnasTotal} className="px-4 py-10 text-center text-[var(--text-tertiary)]">
                  <FileText className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  Sin GTF emitidas. Haz click en &quot;Emitir GTF&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </div>
      {filtradas.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--text-tertiary)]">
            {filtradas.length === gtfs.length ? `${gtfs.length} guía${gtfs.length === 1 ? "" : "s"}` : `${filtradas.length} de ${gtfs.length} guías`}
            {" · "}
            <span className="font-mono tabular-nums">{fmtM3(volumenFiltrado)}</span> m³
            {totalPaginas > 1 && ` · página ${pagActual + 1} de ${totalPaginas}`}
          </p>
          {seleccion && <ElegirFiltradasMovil ids={idsFiltradas} sel={seleccion} />}
          {totalPaginas > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
                disabled={pagActual === 0}
                className="h-10 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                disabled={pagActual >= totalPaginas - 1}
                className="h-10 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
