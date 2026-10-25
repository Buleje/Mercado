"use client";

/**
 * Tabla de Deudores de «Me deben»: buscador y chips de estado PEGADOS a la
 * tabla (ley de la vista), orden por columna, casillas para el cobro masivo
 * y paginado. Salió de FiadosModule; el recordatorio por WhatsApp ahora usa
 * las plantillas de Cobranza y queda anotado en la bitácora.
 */
import { LoadingState, DataTable } from "@buleje/design-system";
import { AlertTriangle, ChevronLeft, ChevronRight, MessageCircle, Search } from "@buleje/design-system/icons";
import EmptyState from "@/components/admin/shared/EmptyState";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { FiadoAvatar, FiadoReliabilityBadge, FiadoSemaphore, FiadoStreakBadge } from "./FiadoBadges";
import { diasDeAtraso, useRecordarPorWhatsApp } from "./recordar";
import type { Gestion } from "@/lib/fiados/gestion-cobranza";
import { ultimosContactos } from "@/lib/fiados/ultimo-contacto";
import { useEffect, useMemo, useState } from "react";
import { diaLeido } from "./fechas";
import { PER_PAGE, STATUS_META, estaAbierto, type Fiado, type FiadoStatus } from "./tipos";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import type { EstadoFiados } from "./use-fiados";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import PonerPlazo from "./PonerPlazo";

const STATUS_FILTERS: { key: FiadoStatus | ""; label: string }[] = [
  { key: "", label: "Todos" },
  { key: "ACTIVO", label: "Activo" },
  { key: "VENCIDO", label: "Vencido" },
  { key: "PAGADO", label: "Pagado" },
];

type Props = {
  estado: EstadoFiados;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  openDetail: (f: Fiado) => void;
  onNuevo: () => void;
  onRecordado: () => void;
  /** Bitácora de Cobranza: último contacto y «ya le escribiste hoy» en la vista previa del recordatorio. */
  gestiones?: readonly Gestion[];
};

const ddmm = (v: number | string) => String(v).split("-").reverse().slice(0, 2).join("/");

/** Filtros de columna (como Adelantos › Lista) sobre lo que ya pasó el buscador y el estado: los fiados llegan enteros. */
const COLUMNAS: readonly ColumnaFiltro<Fiado>[] = [
  { id: "total", label: "Total", tipo: "rango", numero: (f) => f.total, unidad: "S/", paso: 0.01 },
  { id: "saldo", label: "Saldo", tipo: "rango", numero: (f) => f.saldo, unidad: "S/", paso: 0.01 },
  { id: "vence", label: "Vencimiento", tipo: "fecha", numero: (f) => f.fechaVence?.slice(0, 10) ?? null, formatearValor: ddmm },
];

const ORDEN: Record<string, AccesorOrden<Fiado>> = {
  name: { valor: (f) => f.customerName || f.customerId, texto: true },
  total: { valor: (f) => f.total },
  saldo: { valor: (f) => f.saldo },
  vence: { valor: (f) => f.fechaVence?.slice(0, 10) ?? null },
  estado: { valor: (f) => STATUS_META[f.status].label, texto: true },
};

export default function FiadosDeudoresTabla({ estado, selectedIds, toggleSelect, openDetail, onNuevo, onRecordado, gestiones }: Props) {
  const recordarPorWhatsApp = useRecordarPorWhatsApp(gestiones);
  // «Último contacto: martes 14/10 por WhatsApp · prometió pagar…» de las gestiones del fiado; sin gestiones, nada.
  const contactos = useMemo(() => ultimosContactos(gestiones ?? []), [gestiones]);
  const { loading, error, fiados, densidad } = estado;
  /* El buscador y los chips de estado siguen en el hook; los embudos de columna, orden y páginas, acá. */
  /* Sin orden elegido, por nombre (el de siempre en esta tabla). */
  const porNombre = useMemo(
    () => [...estado.filtrados].sort((a, b) => (a.customerName || a.customerId).localeCompare(b.customerName || b.customerId, "es", { sensitivity: "base" })),
    [estado.filtrados],
  );
  const f = useFiltrosTabla(porNombre, COLUMNAS);
  const ord = useOrdenColumna(ORDEN);
  const filtrados = ord.ordenar(f.filtradas);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filtrados.length / PER_PAGE));
  const paginated = filtrados.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  useEffect(() => { setPage(1); }, [estado.search, estado.statusFilter, f.filtradas.length]);
  const saldoFiltrado = filtrados.reduce((s, x) => s + (estaAbierto(x) ? x.saldo : 0), 0);
  return (
    <div className={cn("overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]", densidad === "compact" ? "table-compact" : densidad === "wide" ? "table-wide" : "")}>
      {/* Filtros pegados a la tabla */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-soft)] p-3">
        <div className="relative w-full sm:w-72 sm:flex-none">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" strokeWidth={1.75} aria-hidden />
          <input type="search" value={estado.search} onChange={(e) => estado.setSearch(e.target.value)} placeholder="Buscar cliente, celular o detalle…" aria-label="Buscar fiado o cliente"
            className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-10 pr-4 text-base outline-none transition-all focus:border-primary/40 focus:ring-1 focus:ring-primary/30" />
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filtrar por estado">
          {STATUS_FILTERS.map((sf) => (
            <button key={sf.key} type="button" aria-pressed={estado.statusFilter === sf.key} onClick={() => estado.setStatusFilter(sf.key)}
              className={cn("inline-flex min-h-12 items-center rounded-xl border px-3.5 text-sm font-semibold transition-colors",
                estado.statusFilter === sf.key ? "border-[var(--accent)] bg-primary/12 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-primary/40 hover:text-[var(--text-primary)]")}>
              {sf.label}
            </button>
          ))}
        </div>
        {/* Lo de lo filtrado: «Te deben» del total ya está en Indicadores (10-10). */}
        <span className="ml-auto text-sm tabular-nums text-[var(--text-secondary)]">
          {f.activos > 0 && "Total de lo que se ve: "}{filtrados.length} {filtrados.length === 1 ? "fiado" : "fiados"}
          {saldoFiltrado > 0 && <> · saldo <b className="font-mono text-[var(--text-primary)]">{formatCurrency(saldoFiltrado)}</b></>}
        </span>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12">
          <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" />
          <p className="text-sm text-[var(--data-error-500)]">{error}</p>
          <button type="button" onClick={estado.fetchFiados} className="h-12 rounded-xl px-4 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]">Reintentar</button>
        </div>
      ) : fiados.length === 0 ? (
        <EmptyState illustration="generic" title="Sin fiados registrados" description="Los créditos a clientes aparecerán aquí." action={{ label: "Crear primer fiado", onClick: onNuevo }} />
      ) : estado.filtrados.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">Ningún fiado con ese filtro.</p>
      ) : (
        <>
            <BarraFiltrosTabla vistas="fiados" f={f} className="px-3 py-2" sinConteo />
            <div className="max-h-[65vh] overflow-x-auto overflow-y-auto">
              {/* ds-ignore-table — caso legítimo: thead clickable con
                  sort indicators, mobile-aware (hidden sm:table-cell),
                  sticky positioning, sr-only labels. DataTable del DS
                  no soporta esta combinación de features (ADR-075). */}
              <DataTable className="w-full min-w-[700px] sm:min-w-0">
                <thead className="sticky top-0 z-10 shadow-[var(--shadow-sm)]">
                  <tr>
                    <th className="w-8">
                      <span className="sr-only">Seleccionar</span>
                    </th>
                    <ThColumna label="Cliente" f={f} orden={ord} ordenId="name" />
                    <ThColumna label="Total" ids={["total"]} f={f} derecha orden={ord} ordenId="total" />
                    <ThColumna label="Saldo" ids={["saldo"]} f={f} derecha orden={ord} ordenId="saldo" />
                    <ThColumna label="Vencimiento" ids={["vence"]} f={f} className="hidden sm:table-cell" orden={ord} ordenId="vence" />
                    <ThColumna label="Estado" f={f} orden={ord} ordenId="estado" />
                    <th className="text-center hidden sm:table-cell">Recordar</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 && <SinCoincidenciasFila colSpan={7} />}
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
                        className="hover:bg-[var(--surface-alt)] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      >
                        <td onClick={e => e.stopPropagation()}>
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
                        <td>
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
                                <p className="text-sm text-[var(--text-secondary)] truncate max-w-[200px]">{f.descripcion}</p>
                              )}
                              {estaAbierto(f) && contactos.get(f.customerId) && (
                                <p data-qa="fiado-ultimo-contacto"
                                  className={cn("text-sm", contactos.get(f.customerId)?.estadoPromesa === "incumplio" ? "text-[var(--data-error-ink)]" : "text-[var(--text-secondary)]")}>
                                  {contactos.get(f.customerId)?.linea}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap text-right font-medium">{formatCurrency(f.total)}</td>
                        <td className={cn("whitespace-nowrap text-right font-bold font-mono", f.status === "PAGADO" ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{formatCurrency(f.saldo)}</td>
                        <td className="text-[var(--text-secondary)] hidden sm:table-cell" onClick={f.fechaVence ? undefined : (e) => e.stopPropagation()} data-no-row-click={f.fechaVence ? undefined : true}>
                          {f.fechaVence ? diaLeido(f.fechaVence) : estaAbierto(f) ? <PonerPlazo fiadoId={f.id} creado={f.createdAt} onGuardado={estado.fetchFiados} /> : "—"}
                        </td>
                        <td>
                          <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-bold", meta.bg, meta.color)}>
                            <StatusIcon className="h-4 w-4" />
                            {meta.label}
                          </span>
                        </td>
                        <td className="text-center hidden sm:table-cell">
                          {estaAbierto(f) && f.customerId && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void recordarPorWhatsApp({ telefono: f.customerId, nombre: f.customerName || f.customerId, saldo: f.saldo, dias: diasDeAtraso(f) }, onRecordado);
                              }}
                              title="Recordar por WhatsApp"
                              aria-label={`Recordar a ${f.customerName || f.customerId} por WhatsApp`}
                              className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/12 text-[var(--accent-ink)] transition-colors hover:bg-primary/20 dark:text-[var(--accent)]"
                            >
                              <MessageCircle className="h-5 w-5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--rule-soft)]">
                <p className="text-sm text-[var(--text-secondary)]">
                  {filtrados.length} fiado{filtrados.length !== 1 ? "s" : ""} · pág. {page}/{totalPages}
                </p>
                <div className="flex gap-1">
                  <button aria-label="Anterior"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="flex h-12 w-12 items-center justify-center rounded-xl hover:bg-[var(--surface-sunken)] disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button aria-label="Siguiente"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="flex h-12 w-12 items-center justify-center rounded-xl hover:bg-[var(--surface-sunken)] disabled:opacity-30 transition-colors"
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
