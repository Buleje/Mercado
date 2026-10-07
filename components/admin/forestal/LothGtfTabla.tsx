"use client";

/**
 * LothGtfTabla — la tabla de guías (GTF) del Libro TH, separada de su vista
 * (`LothGtfView`). Cada columna lleva su autofiltro estilo Excel en el título
 * (Brandon, 07-10: «la tabla tiene que tener en sus encabezados todos sus
 * filtros»), se puede ocultar desde «Columnas» y arrastrar de lugar.
 *
 * La lista llega ENTERA del servidor (`/api/admin/forestal/gtf`, ≤200) y se
 * pagina acá: por eso el autofiltro local de `filtros-tabla-forestal` aplica.
 */

import { useEffect, useMemo, useState, type ReactNode, type RefObject } from "react";
import { DataTable } from "@buleje/design-system";
import { Ban, FileText, LogIn, Printer } from "@buleje/design-system/icons";
import { EnOrden, type UseOrdenColumnasResult, type UseVisibilidadColumnasResult } from "@/components/admin/shared/columnas-ordenables";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { importacionDeLaGuia } from "@/lib/forestal/loth-importar-guia-deshacer";
import type { PlanDeLaGuia } from "@/lib/forestal/gtf-columnas";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla } from "./filtros-tabla-forestal";
import { FILTROS_GTF, cabecerasGtf, celdasGtf, filasGtf, type FilaGtf, type Gtf } from "./gtf-tabla-columnas";
import BotonDeshacerImportacion from "./LothImportarGuiasDeshacer";
import BotonFichaImportada from "./LothImportarGuiasFicha";

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
  onIngresarCtp, onHoja, onResumen, onAnular, onRecargar,
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
  const columnasTotal = ordenVisible.length + 1;

  return (
    <div className="space-y-3">
      <BarraFiltrosTabla f={f} />
      <div className="overflow-x-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <DataTable filtrable className="w-full text-sm">
          <thead ref={orden.refCabecera} className="bg-[var(--surface-sunken)] text-left align-top">
            <tr>
              <EnOrden orden={ordenVisible} celdas={soloVisibles(cabecerasGtf(f))} />
              <th className="px-3 py-2.5 font-bold text-[var(--text-primary)]">Acciones</th>
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
                  <EnOrden orden={ordenVisible} celdas={soloVisibles(celdasGtf(fila))} />
                  <td className="px-3 py-2.5">
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

const BOTON = "inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]";

function AccionesGtf({
  g, porIngresar, onIngresarCtp, onHoja, onResumen, onAnular, onRecargar,
}: {
  g: Gtf;
  porIngresar: boolean;
  onIngresarCtp: (gtfNumber: string) => void;
  onHoja: (g: Gtf) => void;
  onResumen: (g: Gtf) => void;
  onAnular: (id: string) => void;
  onRecargar: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      {porIngresar && (
        <button
          type="button"
          onClick={() => onIngresarCtp(g.gtfNumber)}
          title="Registrar estas trozas como ingreso en el Libro de Operaciones del CTP"
          className="inline-flex h-8 items-center gap-1 rounded-lg border-2 border-[var(--accent)] bg-primary/10 px-2.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/15"
        >
          <LogIn className="h-3.5 w-3.5" /> Ingresar al CTP
        </button>
      )}
      {/* ADR-461: la guía importada guarda su ficha de SERFOR entera (titular, destinatario, transporte, productos). */}
      <BotonFichaImportada gtfDatos={g.gtfDatos} gtfNumber={g.gtfNumber} items={g.items} />
      <button type="button" onClick={() => onHoja(g)} title="Imprimir en la hoja de casilleros SERFOR (mismo formato que el Libro CTP)" className={BOTON}>
        <Printer className="h-3.5 w-3.5" /> Hoja SERFOR
      </button>
      <button type="button" onClick={() => onResumen(g)} title="Imprimir el resumen interno" className={BOTON}>
        <Printer className="h-3.5 w-3.5" /> Resumen
      </button>
      {/* ADR-461 §12: la guía que asentó una importación se deshace entera (su madera ya estaba en el CTP). */}
      {g.status !== "anulada" && importacionDeLaGuia(g.observations) && (
        <BotonDeshacerImportacion compacto gtfId={g.id} gtfNumber={g.gtfNumber} onHecho={onRecargar} />
      )}
      {g.status !== "anulada" && (
        <button
          type="button"
          onClick={() => onAnular(g.id)}
          title="Anular esta guía"
          aria-label={`Anular la GTF ${g.gtfNumber}`}
          className="inline-flex h-8 items-center gap-1 rounded-lg border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2.5 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"
        >
          <Ban className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
