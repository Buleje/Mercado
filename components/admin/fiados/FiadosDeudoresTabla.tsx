"use client";

/**
 * Tabla de Deudores de «Me deben»: buscador y chips de estado PEGADOS a la
 * tabla (ley de la vista), orden por columna, casillas para el cobro masivo
 * y paginado. Salió de FiadosModule; el recordatorio por WhatsApp ahora usa
 * las plantillas de Cobranza y queda anotado en la bitácora.
 */
import { LoadingState } from "@buleje/design-system";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, MessageCircle, Search } from "@buleje/design-system/icons";
import EmptyState from "@/components/admin/shared/EmptyState";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import { FiadoAvatar, FiadoReliabilityBadge, FiadoSemaphore, FiadoStreakBadge } from "./FiadoBadges";
import { diasDeAtraso, recordarPorWhatsApp } from "./recordar";
import { STATUS_META, estaAbierto, type ColumnaOrden, type Fiado, type FiadoStatus } from "./tipos";
import type { EstadoFiados } from "./use-fiados";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";

const STATUS_FILTERS: { key: FiadoStatus | ""; label: string }[] = [
  { key: "", label: "Todos" },
  { key: "ACTIVO", label: "Activo" },
  { key: "VENCIDO", label: "Vencido" },
  { key: "PAGADO", label: "Pagado" },
];

type Props = {
  estado: EstadoFiados;
  totalSaldo: number;
  activosCount: number;
  vencidosCount: number;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  openDetail: (f: Fiado) => void;
  onNuevo: () => void;
  onRecordado: () => void;
};

function Cabecera({ col, label, estado, alinear = "left" }: { col: ColumnaOrden; label: string; estado: EstadoFiados; alinear?: "left" | "right" }) {
  const activa = estado.sortBy === col;
  return (
    <th aria-sort={activa ? (estado.sortDir === "asc" ? "ascending" : "descending") : undefined} onClick={() => estado.toggleSort(col)}
      className={cn("cursor-pointer select-none px-4 py-3 font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]", alinear === "right" && "text-right")}>
      <div className={cn("flex items-center gap-1", alinear === "right" && "justify-end")}>
        {label} {activa && (estado.sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </div>
    </th>
  );
}

export default function FiadosDeudoresTabla({ estado, totalSaldo, activosCount, vencidosCount, selectedIds, toggleSelect, openDetail, onNuevo, onRecordado }: Props) {
  const { loading, error, fiados, filtrados, paginated, page, setPage, totalPages, densidad } = estado;
  return (
    <div className={cn("overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]", densidad === "compact" ? "table-compact" : densidad === "wide" ? "table-wide" : "")}>
      {/* Filtros pegados a la tabla */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-soft)] p-3">
        <div className="relative min-w-[13rem] max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" strokeWidth={1.75} aria-hidden />
          <input type="search" value={estado.search} onChange={(e) => estado.setSearch(e.target.value)} placeholder="Buscar cliente, celular o detalle…" aria-label="Buscar fiado o cliente"
            className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-10 pr-4 text-sm outline-none transition-all focus:border-primary/40 focus:ring-1 focus:ring-primary/30 sm:h-10" />
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filtrar por estado">
          {STATUS_FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={estado.statusFilter === f.key} onClick={() => estado.setStatusFilter(f.key)}
              className={cn("inline-flex items-center rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                estado.statusFilter === f.key ? "border-primary bg-primary text-white" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-primary/40 hover:text-primary")}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs tabular-nums text-[var(--text-tertiary)]">
          {totalSaldo > 0 && (
            <>
              Te deben <b className="font-mono text-sm text-[var(--text-primary)]">{formatCurrency(totalSaldo)}</b>
              {" · "}<b className="text-[var(--data-success-500)]">{activosCount}</b>
              {vencidosCount > 0 && <> · <b className="text-[var(--data-error-500)]">{vencidosCount} venc.</b></>}
              {" · "}
            </>
          )}
          {filtrados.length} {filtrados.length === 1 ? "resultado" : "resultados"}
        </span>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12">
          <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" />
          <p className="text-sm text-[var(--data-error-500)]">{error}</p>
          <button type="button" onClick={estado.fetchFiados} className="mt-1 text-xs font-semibold text-primary hover:underline">Reintentar</button>
        </div>
      ) : fiados.length === 0 ? (
        <EmptyState illustration="generic" title="Sin fiados registrados" description="Los créditos a clientes aparecerán aquí." action={{ label: "Crear primer fiado", onClick: onNuevo }} />
      ) : filtrados.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">Ningún fiado con ese filtro.</p>
      ) : (
        <>
            <div className="max-h-[65vh] overflow-x-auto overflow-y-auto">
              {/* ds-ignore-table — caso legítimo: thead clickable con
                  sort indicators, mobile-aware (hidden sm:table-cell),
                  sticky positioning, sr-only labels. DataTable del DS
                  no soporta esta combinación de features (ADR-075). */}
              <table className="w-full min-w-[700px] sm:min-w-0 text-sm">
                <thead className="sticky top-0 bg-[var(--surface-raised)] z-10 shadow-[var(--shadow-sm)]">
                  <tr className="border-b border-[var(--rule-soft)] text-left">
                    <th className="px-2 py-3 w-8">
                      <span className="sr-only">Seleccionar</span>
                    </th>
                    <Cabecera col="name" label="Cliente" estado={estado} />
                    <Cabecera col="total" label="Total" estado={estado} alinear="right" />
                    <Cabecera col="saldo" label="Saldo" estado={estado} alinear="right" />
                    <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] hidden sm:table-cell">Vencimiento</th>
                    <th className="px-4 py-3 font-semibold text-[var(--text-secondary)]">Estado</th>
                    <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] text-center hidden sm:table-cell">Recordar</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(f => {
                    const meta = STATUS_META[f.status];
                    const StatusIcon = meta.icon;
                    return (
                      <tr
                        key={f.id}
                        onClick={() => openDetail(f)}
                        tabIndex={0}
                        role="button"
                        aria-label={`Ver fiado de ${f.customerName || f.customerId}`}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          const target = e.target as HTMLElement;
                          if (target.closest("button, input, a, [data-no-row-click]")) return;
                          e.preventDefault();
                          openDetail(f);
                        }}
                        className="border-b border-[var(--rule-soft)] hover:bg-[var(--surface-alt)] cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      >
                        <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                          {estaAbierto(f) && (
                            <input
                              type="checkbox"
                              aria-label={`Seleccionar fiado de ${f.customerName || f.customerId}`}
                              checked={selectedIds.has(f.id)}
                              onChange={() => toggleSelect(f.id)}
                              className="h-4 w-4 rounded border-[var(--rule-base)] text-primary focus:ring-primary"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FiadoAvatar nombre={f.customerName || f.customerId} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-medium text-[var(--text-primary)] truncate"><EnlacePanel cosa="cliente" id={f.customerId}>{f.customerName || f.customerId}</EnlacePanel></p>
                                {/* Mejora 15: Semáforo visual */}
                                <FiadoSemaphore fiado={f} />
                                {/* Mejora 11: Score de confiabilidad */}
                                <FiadoReliabilityBadge customerId={f.customerId} fiados={fiados} />
                                {/* Mejora QW-10h: Streak de pagos */}
                                <FiadoStreakBadge customerId={f.customerId} fiados={fiados} />
                              </div>
                              {f.descripcion && (
                                <p className="text-xs text-[var(--text-tertiary)] truncate max-w-[200px]">{f.descripcion}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-[var(--text-primary)]">{formatCurrency(f.total)}</td>
                        <td className={cn("px-4 py-3 text-right font-bold font-mono", f.status === "PAGADO" ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{formatCurrency(f.saldo)}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)] hidden sm:table-cell">
                          {f.fechaVence ? formatDate(f.fechaVence) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold", meta.bg, meta.color)}>
                            <StatusIcon className="h-3 w-3" />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center hidden sm:table-cell">
                          {estaAbierto(f) && f.customerId && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                recordarPorWhatsApp({ telefono: f.customerId, nombre: f.customerName || f.customerId, saldo: f.saldo, dias: diasDeAtraso(f) }, onRecordado);
                              }}
                              title="Recordar por WhatsApp"
                              aria-label={`Recordar a ${f.customerName || f.customerId} por WhatsApp`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-[var(--accent-ink)] transition-colors hover:bg-primary/20 dark:text-[var(--accent)]"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--rule-soft)]">
                <p className="text-xs text-[var(--text-secondary)]">
                  {filtrados.length} fiado{filtrados.length !== 1 ? "s" : ""} · pág. {page}/{totalPages}
                </p>
                <div className="flex gap-1">
                  <button aria-label="Anterior"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="p-1.5 rounded-xl hover:bg-[var(--surface-sunken)] disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button aria-label="Siguiente"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="p-1.5 rounded-xl hover:bg-[var(--surface-sunken)] disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
    </div>
  );
}
