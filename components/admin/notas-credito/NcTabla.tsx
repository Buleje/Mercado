"use client";

import { CardTitle, DataTable, LoadingState } from "@buleje/design-system";
import { AnimatePresence } from "@/components/admin/providers";
import { formatCurrency, formatDate } from "@/lib/format";
import { ChevronLeft, ChevronRight, AlertTriangle, Copy, Trash2, Send, FileText, Link2 } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { cn } from "@/lib/utils";
import { PER_PAGE, STATUS_META, type NotaCredito } from "@/components/admin/notas-credito/nc-compartido";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { diaDeVigencia } from "@/lib/cotizaciones/vigencia";
import { NCCard } from "@/components/admin/notas-credito/NcPiezas";
import type { NotasCreditoVista } from "@/components/admin/notas-credito/hooks/use-notas-credito";

/** Filtros de columna: la lista llega entera (se pagina acá, en el cliente), así que filtran todas las notas, no sólo la página. */
const COLUMNAS: readonly ColumnaFiltro<NotaCredito>[] = [
  { id: "numero", label: "Documento", tipo: "texto", valor: (n) => [n.numero, n.clienteNombre ?? ""] },
  { id: "referencia", label: "Referencia", tipo: "texto", valor: (n) => n.orderNumero || null },
  { id: "motivo", label: "Motivo", tipo: "multi", valor: (n) => n.motivoDesc || null, soloConVarios: true },
  { id: "total", label: "Total", tipo: "rango", numero: (n) => n.total, unidad: "S/", paso: 0.01 },
  { id: "estado", label: "Estado", tipo: "multi", valor: (n) => STATUS_META[n.status].label, soloConVarios: true },
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (n) => diaDeVigencia(n.createdAt) },
];

const ORDEN: Record<string, AccesorOrden<NotaCredito>> = {
  numero: { valor: (n) => n.numero, texto: true },
  referencia: { valor: (n) => n.orderNumero, texto: true },
  motivo: { valor: (n) => n.motivoDesc, texto: true },
  total: { valor: (n) => n.total },
  estado: { valor: (n) => STATUS_META[n.status].label, texto: true },
  fecha: { valor: (n) => diaDeVigencia(n.createdAt) },
};

/** Tabla y tarjetas de Notas de crédito. Pieza de NotasCreditoModule: recibe `useNotasCredito` entero. */
export default function NcTabla({ nc }: { nc: NotasCreditoVista }) {
  const {
    loading, error, page, setPage, setSelected, checkedIds, viewMode, setShowNew,
    setWizardStep, setCreateError, fetchNotas, filteredNotas, setCheckedIds,
    toggleCheck, handleDuplicate, handleEmitSunat, handleAnular,
  } = nc;
  const f = useFiltrosTabla(filteredNotas, COLUMNAS);
  const ord = useOrdenColumna(ORDEN);
  const filas = ord.ordenar(f.filtradas);
  const totalPages = Math.max(1, Math.ceil(filas.length / PER_PAGE));
  const actual = Math.min(page, totalPages);
  const paginated = filas.slice((actual - 1) * PER_PAGE, actual * PER_PAGE);
  const allChecked = paginated.length > 0 && paginated.every((n) => checkedIds.has(n.id));
  const toggleAll = () => setCheckedIds(allChecked ? new Set() : new Set(paginated.map((n) => n.id)));
  return (
    <>
      {/* ── Table / Cards View ─────────────────────────────────────────── */}
      {viewMode !== "kanban" && filteredNotas.length > 0 && !loading && !error && (
        <BarraFiltrosTabla f={f} plegableSiempre={viewMode === "cards"} />
      )}
      {viewMode !== "kanban" && (
      <div className="bg-[var(--surface-raised)] rounded-xl overflow-hidden">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" />
            <p className="text-sm text-[var(--data-error-500)]">{error}</p>
            <button onClick={fetchNotas} className="min-h-12 px-4 text-sm text-primary hover:underline font-semibold">Reintentar</button>
          </div>
        ) : filteredNotas.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="mx-auto mb-4 h-14 w-14 rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-base)] flex items-center justify-center">
              <FileText className="h-7 w-7 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
            </div>
            <CardTitle className="text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)] mb-2">Todavía no emitiste ninguna</CardTitle>
            <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-md mx-auto">Se crean al devolver, anular o ajustar un comprobante.</p>
            <button onClick={() => { setShowNew(true); setCreateError(null); setWizardStep(0); }} className="bg-primary text-white px-6 min-h-12 rounded-xl font-medium hover:bg-primary-dark">Crear NC</button>
          </div>
        ) : viewMode === "cards" ? (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {paginated.length === 0 && <p className="col-span-full text-center text-[var(--text-tertiary)]">Ninguna nota coincide con los filtros de columna.</p>}
            <AnimatePresence>
              {paginated.map(nc => (
                <NCCard key={nc.id} nc={nc} onSelect={() => setSelected(nc)} selected={checkedIds.has(nc.id)} onToggle={() => toggleCheck(nc.id)} />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <>
            <DataTable className="min-w-175">
                <thead>
                  <tr>
                    <th className="w-14">
                      <button onClick={toggleAll} aria-label="Elegir todas" aria-pressed={allChecked} className="flex h-12 w-12 items-center justify-center">
                        <span className={cn("flex h-5 w-5 items-center justify-center rounded border-2 transition-colors",
                          allChecked ? "bg-primary border-primary text-white" : "border-[var(--rule-base)]")}>
                          {allChecked && <span className="text-sm leading-none">{"\u2713"}</span>}
                        </span>
                      </button>
                    </th>
                    <ThColumna label="Documento" ids={["numero"]} f={f} orden={ord} ordenId="numero" />
                    <ThColumna label="Referencia" ids={["referencia"]} f={f} orden={ord} ordenId="referencia" className="hidden sm:table-cell" />
                    <ThColumna label="Motivo" ids={["motivo"]} f={f} orden={ord} ordenId="motivo" />
                    <ThColumna label="Total" ids={["total"]} f={f} derecha orden={ord} ordenId="total" />
                    <ThColumna label="Estado" ids={["estado"]} f={f} orden={ord} ordenId="estado" />
                    <ThColumna label="Fecha" ids={["fecha"]} f={f} orden={ord} ordenId="fecha" className="hidden md:table-cell" />
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 && <SinCoincidenciasFila colSpan={8} />}
                  {paginated.map(nc => {
                    const meta = STATUS_META[nc.status];
                    return (
                      <tr key={nc.id} className="group">
                        <td>
                          <button onClick={() => toggleCheck(nc.id)} aria-label={`Elegir ${nc.numero}`} aria-pressed={checkedIds.has(nc.id)} className="flex h-12 w-12 items-center justify-center">
                            <span className={cn("flex h-5 w-5 items-center justify-center rounded border-2 transition-colors",
                              checkedIds.has(nc.id) ? "bg-primary border-primary text-white" : "border-[var(--rule-base)]")}>
                              {checkedIds.has(nc.id) && <span className="text-sm leading-none">{"\u2713"}</span>}
                            </span>
                          </button>
                        </td>
                        <td
                          className="cursor-pointer"
                          onClick={() => setSelected(nc)}
                          tabIndex={0}
                          aria-label={`Ver detalle de ${nc.numero}`}
                          onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(nc); } }}
                        >
                          <span className="flex items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                            <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{nc.numero}</span>
                          </span>
                          {nc.clienteNombre && <p className="text-sm text-[var(--text-tertiary)] mt-0.5">{nc.clienteNombre}</p>}
                        </td>
                        <td className="hidden sm:table-cell">
                          {nc.orderNumero ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-sm font-bold bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                              <Link2 className="h-3.5 w-3.5" aria-hidden /> {nc.orderNumero}
                            </span>
                          ) : <span className="text-[var(--text-tertiary)]">{"\u2014"}</span>}
                        </td>
                        <td className="sm:truncate sm:max-w-45">
                          <span className="text-sm text-[var(--text-tertiary)] mr-1">[{nc.motivoCodigo}]</span>
                          {nc.motivoDesc}
                        </td>
                        <td className="text-right font-bold whitespace-nowrap">{formatCurrency(nc.total)}</td>
                        <td>
                          <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-bold", meta.bg, meta.color)}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="text-[var(--text-secondary)] hidden md:table-cell whitespace-nowrap">{formatDate(nc.createdAt)}</td>
                        <td>
                          <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
                            <ActionMenu
                              label={`Acciones de ${nc.numero}`}
                              soloIcono
                              size="xs"
                              actions={[
                                ...(nc.status === "BORRADOR" ? [{ id: "emitir", label: "Marcar emitida", hint: "No se envía a SUNAT desde aquí", icon: Send, onSelect: () => handleEmitSunat(nc) }] : []),
                                { id: "duplicar", label: "Duplicar", icon: Copy, onSelect: () => handleDuplicate(nc) },
                                ...(nc.status !== "ANULADA" ? [{ id: "anular", label: "Anular", icon: Trash2, tone: "danger" as const, onSelect: () => handleAnular(nc) }] : []),
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--rule-soft)]">
                <p className="text-sm text-[var(--text-secondary)]">{filas.length} doc{filas.length !== 1 ? "s" : ""} {"\u2014"} P{"\u00e1"}g. {actual}/{totalPages}</p>
                <div className="flex gap-1">
                  <button aria-label="Anterior" disabled={actual <= 1} onClick={() => setPage(actual - 1)} className="inline-flex h-12 w-12 items-center justify-center rounded-xl hover:bg-[var(--surface-sunken)] disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                  <button aria-label="Siguiente" disabled={actual >= totalPages} onClick={() => setPage(actual + 1)} className="inline-flex h-12 w-12 items-center justify-center rounded-xl hover:bg-[var(--surface-sunken)] disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      )}
    </>
  );
}
