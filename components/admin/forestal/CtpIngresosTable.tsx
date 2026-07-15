"use client";

/**
 * CtpIngresosTable — la tabla de la pestaña Ingresos del Libro CTP.
 *
 * Extraída de CtpIngresosView para que ninguno de los dos pase de ~300 LOC
 * (regla del repo): la vista se queda con KPIs, filtros y paginación; acá vive
 * el render de las filas y sus acciones por registro.
 */

import {
  Eye,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  TreePine,
} from "@buleje/design-system/icons";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import {
  PLAZO_REGISTRO_DIAS,
  STATUS_META,
  diasDeRegistro,
  estaFueraDePlazo,
  formatDate,
  originLabel,
  productLabel,
  type WoodEntry,
  type WoodEntryStatus,
} from "./ctp-shared";

export interface CtpIngresosTableProps {
  entries: WoodEntry[];
  loading: boolean;
  period: CtpPeriod;
  /** Hay algún filtro activo → el vacío significa "no coincide", no "no hay datos". */
  filtered: boolean;
  pendingIds: string[];
  selectedIds: string[];
  /** Intersección selectedIds ∩ pendingIds — la calcula la vista (single source). */
  selectedPending: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  busy: string | null;
  rejectingId: string | null;
  rejectReason: string;
  setRejectReason: (v: string) => void;
  onStartReject: (id: string) => void;
  onCancelReject: () => void;
  onConfirmReject: (id: string) => void;
  onValidate: (id: string) => void;
  onDetail: (entry: WoodEntry) => void;
}

export default function CtpIngresosTable({
  entries,
  loading,
  period,
  filtered,
  pendingIds,
  selectedIds,
  selectedPending,
  setSelectedIds,
  busy,
  rejectingId,
  rejectReason,
  setRejectReason,
  onStartReject,
  onCancelReject,
  onConfirmReject,
  onValidate,
  onDetail,
}: CtpIngresosTableProps) {
  return (
    <>
      {/* sr-only + aria-labelledby (no aria-label inline): el shell admin
          auto-genera data-label de mobile-cards leyendo el <th> completo
          (incl. aria-label/title de hijos) — un aria-label inline acá se
          filtraría como etiqueta repetida en CADA fila del checkbox por
          registro. Referenciar un id externo lo evita sin perder el nombre
          accesible. */}
      <span id="ctp-select-all-label" className="sr-only">
        Seleccionar todos los ingresos pendientes de esta página
      </span>
      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left">
            <tr>
              <Th className="w-10">
                <input
                  type="checkbox"
                  aria-labelledby="ctp-select-all-label"
                  disabled={pendingIds.length === 0}
                  checked={pendingIds.length > 0 && selectedPending.length === pendingIds.length}
                  onChange={(e) => setSelectedIds(e.target.checked ? pendingIds : [])}
                  className="h-4 w-4 accent-[var(--brand-ink)]"
                />
              </Th>
              <Th>Fecha</Th>
              <Th>GTF</Th>
              <Th>Proveedor / Origen</Th>
              <Th>Especie</Th>
              <Th>Producto</Th>
              <Th className="text-right">Volumen (m³)</Th>
              <Th className="text-right">Piezas</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const tarde = estaFueraDePlazo(e);
              return (
                <tr
                  key={e.id}
                  className="border-t border-[var(--rule-soft)] hover:bg-[var(--surface-canvas)]/40"
                >
                  <Td>
                    {e.status === "pendiente" && (
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ingreso ${e.gtfNumber}`}
                        checked={selectedIds.includes(e.id)}
                        onChange={(ev) =>
                          setSelectedIds((prev) =>
                            ev.target.checked ? [...prev, e.id] : prev.filter((id) => id !== e.id),
                          )
                        }
                        className="h-4 w-4 accent-[var(--brand-ink)]"
                      />
                    )}
                  </Td>
                  <Td>
                    <div className="font-bold text-[var(--text-primary)]">{formatDate(e.entryDate)}</div>
                    {tarde && (
                      <div
                        title={`Registrado ${diasDeRegistro(e)} días después de la operación (plazo ${PLAZO_REGISTRO_DIAS})`}
                        className="text-xs font-bold text-[var(--data-warning-700)]"
                      >
                        fuera de plazo
                      </div>
                    )}
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => onDetail(e)}
                      className="font-mono text-xs font-bold text-[var(--brand-ink)] underline-offset-2 hover:underline"
                    >
                      {e.gtfNumber}
                    </button>
                    {e.gtfDate && (
                      <div className="text-xs text-[var(--text-tertiary)]">{formatDate(e.gtfDate)}</div>
                    )}
                  </Td>
                  <Td>
                    <div className="font-medium text-[var(--text-primary)]">{e.providerName}</div>
                    <div className="text-xs text-[var(--text-tertiary)]">{originLabel(e.originType)}</div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--text-primary)]">{e.speciesCommonName}</span>
                      {e.speciesCites && (
                        <span
                          title="Especie protegida CITES"
                          className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]"
                        >
                          CITES
                        </span>
                      )}
                    </div>
                    {e.speciesScientificName && (
                      <div className="text-xs italic text-[var(--text-tertiary)]">
                        {e.speciesScientificName}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <span className="rounded-full bg-[var(--surface-canvas)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                      {productLabel(e.productType)}
                    </span>
                  </Td>
                  <Td className="text-right">
                    <div className="font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {Number(e.volumeM3).toFixed(4)}
                    </div>
                  </Td>
                  <Td className="text-right">
                    <div className="font-mono tabular-nums text-[var(--text-primary)]">{e.pieces}</div>
                  </Td>
                  <Td>
                    <StatusBadge status={e.status} />
                    {e.rejectionReason && (
                      <div className="mt-1 text-xs text-[var(--data-error-700)]">{e.rejectionReason}</div>
                    )}
                  </Td>
                  <Td className="text-right">
                    {rejectingId === e.id ? (
                      // w-full sm:w-auto/w-48: en desktop es idéntico a antes
                      // (192px fijo); en mobile-card el valor de la celda solo
                      // tiene ~58% del ancho (42% se lo lleva el label), y un
                      // ancho fijo de 192px desborda en pantallas chicas.
                      <div className="inline-flex w-full flex-col items-end gap-2 sm:w-auto">
                        <input
                          type="text"
                          value={rejectReason}
                          onChange={(ev) => setRejectReason(ev.target.value)}
                          placeholder="Motivo (min 3 chars)"
                          aria-label="Motivo del rechazo"
                          className="h-9 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm outline-none focus:border-[var(--data-error-500)] sm:w-48"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={rejectReason.trim().length < 3 || busy === `${e.id}:reject`}
                            onClick={() => onConfirmReject(e.id)}
                            className="inline-flex h-9 items-center gap-1 rounded-xl bg-[var(--data-error-600)] px-3 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                          >
                            Confirmar rechazo
                          </button>
                          <button
                            type="button"
                            onClick={onCancelReject}
                            className="inline-flex h-9 items-center rounded-xl border-2 border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-primary)]"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onDetail(e)}
                          title="Ver ficha completa"
                          className="inline-flex h-9 items-center gap-1 rounded-xl border-2 border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver
                        </button>
                        {e.status === "pendiente" && (
                          <>
                            <button
                              type="button"
                              disabled={busy === `${e.id}:validate`}
                              onClick={() => onValidate(e.id)}
                              title="Validar ingreso"
                              className="inline-flex h-9 items-center gap-1 rounded-xl bg-[var(--data-success-600)] px-3 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                            >
                              <ThumbsUp className="h-3 w-3" />
                              Validar
                            </button>
                            <button
                              type="button"
                              onClick={() => onStartReject(e.id)}
                              title="Rechazar"
                              className="inline-flex h-9 items-center gap-1 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-100)]"
                            >
                              <ThumbsDown className="h-3 w-3" />
                              Rechazar
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!loading && entries.length === 0 && (
          <div className="p-12 text-center text-[var(--text-tertiary)]">
            <TreePine className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-base font-medium">
              {filtered
                ? "Ningún ingreso coincide con el filtro."
                : `Sin ingresos en ${period.label}.`}
            </p>
            <p className="mt-1 text-sm">
              {filtered
                ? "Probá limpiar la búsqueda o ampliar el período."
                : period.from
                  ? 'Puede haber registros fuera de este período: elegí "Todo el histórico" arriba, o registrá uno con "Nuevo ingreso".'
                  : 'Hacé click en "Nuevo ingreso" para registrar el primer movimiento de madera.'}
            </p>
          </div>
        )}

        {loading && (
          <div className="p-8 text-center text-[var(--text-tertiary)]">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin" />
            <p className="mt-2 text-sm">Cargando registros...</p>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Piezas internas ───────────────────────────────────────────────────────
function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}

function StatusBadge({ status }: { status: WoodEntryStatus }) {
  const meta = STATUS_META[status];
  const { Icon } = meta;
  const cls =
    meta.tone === "success"
      ? "bg-[var(--data-success-100)] text-[var(--data-success-900)]"
      : meta.tone === "warning"
        ? "bg-[var(--data-warning-100)] text-[var(--data-warning-900)]"
        : meta.tone === "danger"
          ? "bg-[var(--data-error-100)] text-[var(--data-error-700)]"
          : meta.tone === "info"
            ? "bg-[var(--data-info-100)] text-[var(--data-info-900)]"
            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}
