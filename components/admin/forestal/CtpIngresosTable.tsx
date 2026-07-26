"use client";

/**
 * CtpIngresosTable — la tabla de la pestaña Ingresos del Libro CTP.
 *
 * Extraída de CtpIngresosView para que ninguno de los dos pase de ~300 LOC
 * (regla del repo): la vista se queda con KPIs, filtros y paginación; acá vive
 * el render de las filas y sus acciones por registro.
 *
 * Dual-render: la <table> se muestra solo en ≥640px (hidden sm:block) y en
 * mobile se sirven cards a medida (CtpIngresoCardMobile). El `hidden` de Tailwind
 * a <640px gana sobre la conversión genérica table→card del shell admin, así que
 * la tabla NO se auto-convierte y no compite con las cards premium.
 */

import { RefreshCw, TreePine } from "@buleje/design-system/icons";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import CtpEntryActions from "./CtpEntryActions";
import CtpIngresoCardMobile from "./CtpIngresoCardMobile";
import {
  PLAZO_REGISTRO_DIAS,
  StatusBadge,
  diasDeRegistro,
  estaFueraDePlazo,
  formatDate,
  originLabel,
  productLabel,
  type WoodEntry,
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
  onChain: (entry: WoodEntry) => void;
}

export default function CtpIngresosTable(props: CtpIngresosTableProps) {
  const {
    entries,
    loading,
    period,
    filtered,
    pendingIds,
    selectedIds,
    selectedPending,
    setSelectedIds,
    onDetail,
  } = props;

  // Acciones por fila/card: el mismo componente para desktop y mobile.
  const actionProps = {
    busy: props.busy,
    rejectingId: props.rejectingId,
    rejectReason: props.rejectReason,
    setRejectReason: props.setRejectReason,
    onStartReject: props.onStartReject,
    onCancelReject: props.onCancelReject,
    onConfirmReject: props.onConfirmReject,
    onValidate: props.onValidate,
    onDetail,
    onChain: props.onChain,
  };
  const toggleSelect = (id: string, checked: boolean) =>
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));

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

      {/* ── Desktop: tabla (≥640px) ── */}
      <div className="hidden overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] sm:block">
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
                        onChange={(ev) => toggleSelect(e.id, ev.target.checked)}
                        className="h-4 w-4 accent-[var(--brand-ink)]"
                      />
                    )}
                  </Td>
                  <Td>
                    <div className="font-bold text-[var(--text-primary)]">{formatDate(e.entryDate)}</div>
                    {tarde && (
                      <div
                        title={`Registrado ${diasDeRegistro(e)} días después de la operación (plazo ${PLAZO_REGISTRO_DIAS} días hábiles)`}
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
                      className="font-mono text-sm font-bold text-[var(--brand-ink)] dark:text-[var(--text-primary)] underline-offset-2 hover:underline"
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
                      <div className="mt-1 text-sm text-[var(--data-error-700)]">{e.rejectionReason}</div>
                    )}
                  </Td>
                  <Td className="text-right">
                    <CtpEntryActions entry={e} {...actionProps} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Mobile: cards a medida (<640px) ── */}
      {entries.length > 0 && (
        <div className="space-y-3 sm:hidden">
          {entries.map((e) => (
            <CtpIngresoCardMobile
              key={e.id}
              entry={e}
              selected={selectedIds.includes(e.id)}
              onToggleSelect={toggleSelect}
              {...actionProps}
            />
          ))}
        </div>
      )}

      {/* ── Estados compartidos (vacío / cargando) ── */}
      {!loading && entries.length === 0 && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center text-[var(--text-tertiary)]">
          <TreePine className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-base font-medium">
            {filtered ? "Ningún ingreso coincide con el filtro." : `Sin ingresos en ${period.label}.`}
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
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 text-center text-[var(--text-tertiary)]">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin" />
          <p className="mt-2 text-sm">Cargando registros...</p>
        </div>
      )}
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
