"use client";

/**
 * CtpIngresosView — pestaña Ingresos del Libro CTP (ADR-124): la materia prima
 * que entra a planta, su validación y su trazabilidad.
 *
 * Los KPIs vienen de `?stats=1` (agregado en DB sobre todo el período) y no de
 * sumar la tabla: la tabla está paginada y sumarla diría "total" de una página.
 */

import { useEffect, useMemo, useState } from "react";
// `m` (no `motion`): la app usa LazyMotion strict, que lanza error si se usa el
// componente `motion` completo (rompe tree-shaking). Alias a `motion` para el JSX.
import { m as motion } from "framer-motion";
import {
  AlertCircle,
  BarChart3,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  RefreshCw,
  Search,
  ThumbsUp,
  TreePine,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import BulkActionsBar from "@/components/admin/shared/BulkActionsBar";
import { staggerContainer, staggerChild } from "@/components/ui-system/motion";
import { useDebounce } from "@/hooks/use-debounce";
import { CTP_PAGE_SIZE, useCtpIngresos } from "@/hooks/use-ctp-ingresos";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import WoodEntryForm from "./WoodEntryForm";
import SpeciesAggregateChart from "./SpeciesAggregateChart";
import CtpEntryDetailModal from "./CtpEntryDetailModal";
import CtpIngresoCadenaModal from "./CtpIngresoCadenaModal";
import { useActionToasts, ActionToasts } from "./cubicador-toasts";
import CtpIngresosTable from "./CtpIngresosTable";
import CtpGuiasBandeja from "./CtpGuiasBandeja";
import { STATUS_META, type WoodEntry, type WoodEntryStatus } from "./ctp-shared";

const STATUS_ORDER: WoodEntryStatus[] = [
  "pendiente",
  "validado",
  "procesado",
  "rechazado",
  "anulado",
];

/** Clases del chip ACTIVO por tono de estado + color del punto (identidad DS). */
const TONE_CHIP: Record<string, { active: string; dot: string }> = {
  success: { active: "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)]", dot: "bg-[var(--data-success-500)]" },
  warning: { active: "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)]", dot: "bg-[var(--data-warning-500)]" },
  danger: { active: "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)]", dot: "bg-[var(--data-error-500)]" },
  info: { active: "border-[var(--data-info-500)] bg-[var(--data-info-50)] text-[var(--data-info-700)]", dot: "bg-[var(--data-info-500)]" },
  muted: { active: "border-[var(--rule-strong)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]", dot: "bg-[var(--text-tertiary)]" },
};

export default function CtpIngresosView({
  period,
  openGtf,
  onOpenConsumed,
}: {
  period: CtpPeriod;
  /** Puente inverso: GTF que el shell mandó a ingresar (abre el form pre-llenado). */
  openGtf?: string | null;
  onOpenConsumed?: () => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 350);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<WoodEntry | null>(null);
  const [chainEntry, setChainEntry] = useState<WoodEntry | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { toasts, push: pushToast, dismiss: dismissToast } = useActionToasts();
  const [showDashboard, setShowDashboard] = useState(false);
  // Bandeja monte→planta: guía elegida para pre-cargar el form + key para refrescarla tras guardar.
  const [formGtf, setFormGtf] = useState<string | null>(null);
  const [bandejaKey, setBandejaKey] = useState(0);

  const { entries, stats, total, loading, error, setError, reload, runAction, validateMany } =
    useCtpIngresos({ period, status: statusFilter, search, page });

  // Un filtro nuevo describe otro conjunto: la página 4 del anterior no existe.
  useEffect(() => {
    setPage(0);
    setSelectedIds([]);
  }, [search, statusFilter, period]);

  // Puente inverso desde Títulos Habilitantes: abre el form con la guía elegida.
  useEffect(() => {
    if (!openGtf) return;
    setFormGtf(openGtf);
    setShowForm(true);
    onOpenConsumed?.();
  }, [openGtf, onOpenConsumed]);

  const pendingIds = useMemo(
    () => entries.filter((e) => e.status === "pendiente").map((e) => e.id),
    [entries],
  );
  const selectedPending = useMemo(
    () => selectedIds.filter((id) => pendingIds.includes(id)),
    [selectedIds, pendingIds],
  );

  const lastPage = Math.max(0, Math.ceil(total / CTP_PAGE_SIZE) - 1);
  const rangeFrom = total === 0 ? 0 : page * CTP_PAGE_SIZE + 1;
  const rangeTo = Math.min((page + 1) * CTP_PAGE_SIZE, total);

  // Confirma el motivo: rechaza si el ingreso está pendiente, o ANULA si ya
  // estaba validado (corrección post-validación). Reusa el mismo input de motivo.
  async function reject(id: string) {
    const entry = entries.find((e) => e.id === id);
    const action = entry?.status === "validado" ? "annul" : "reject";
    setBusy(`${id}:reject`);
    await runAction(id, action, rejectReason.trim());
    setRejectingId(null);
    setRejectReason("");
    setBusy(null);
  }

  async function validate(id: string) {
    setBusy(`${id}:validate`);
    await runAction(id, "validate");
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <motion.div variants={staggerChild}>
          <StatCard
            label="Ingresos del período"
            value={stats ? stats.totalCount.toLocaleString("es-PE") : "—"}
            subValue={stats ? `${stats.totalPieces.toLocaleString("es-PE")} piezas` : undefined}
            icon={Boxes}
            emphasis="neutral"
          />
        </motion.div>
        <motion.div variants={staggerChild}>
          <StatCard
            label="Volumen del período"
            value={stats ? `${Number(stats.totalVolumeM3).toFixed(2)} m³` : "—"}
            subValue={stats ? `${stats.speciesCount} especies` : undefined}
            icon={TreePine}
            emphasis="success"
          />
        </motion.div>
        <motion.div variants={staggerChild}>
          <StatCard
            label="Pendientes validar"
            value={stats ? String(stats.byStatus.pendiente) : "—"}
            subValue={stats?.byStatus.pendiente ? "Requieren acción" : "Todo al día"}
            icon={Clock}
            emphasis={stats?.byStatus.pendiente ? "warning" : "neutral"}
          />
        </motion.div>
        <motion.div variants={staggerChild}>
          <StatCard
            label="Especies CITES"
            value={stats ? String(stats.citesCount) : "—"}
            subValue={stats ? `${Number(stats.citesVolumeM3).toFixed(2)} m³ protegidos` : undefined}
            icon={AlertCircle}
            emphasis={stats?.citesCount ? "error" : "neutral"}
          />
        </motion.div>
      </motion.div>

      {showDashboard && <SpeciesAggregateChart period={period} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 transition-colors focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)]">
          <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
          <label htmlFor="ctp-ing-search" className="sr-only">
            Buscar ingresos
          </label>
          <input
            id="ctp-ing-search"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por GTF, proveedor o especie..."
            className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none"
          />
        </div>
        {/* En móvil los tres van en UNA fila: con `max-sm:sr-only` y ancho
            completo, Dashboard y Recargar se veían como dos cajas vacías. */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDashboard((v) => !v)}
            aria-pressed={showDashboard}
            title={showDashboard ? "Cerrar el dashboard de especies" : "Dashboard de especies"}
            className={`inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 px-4 text-sm font-bold transition max-sm:w-12 max-sm:px-0 ${
              showDashboard
                ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span className="max-sm:sr-only">{showDashboard ? "Cerrar dashboard" : "Dashboard"}</span>
          </button>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            aria-label="Recargar"
            title="Recargar"
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60 max-sm:w-12 max-sm:px-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="max-sm:sr-only">Recargar</span>
          </button>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-5 text-base font-bold text-white shadow-sm transition hover:shadow-md hover:brightness-110 sm:flex-none"
          >
            <Plus className="h-5 w-5" />
            Nuevo ingreso
          </button>
        </div>
      </div>

      {/* Chips de estado: distribución del período de un vistazo + filtro de 1 clic. */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip label="Todos" count={stats?.totalCount} active={statusFilter === ""} tone="accent" onClick={() => setStatusFilter("")} />
        {STATUS_ORDER.map((s) => (
          <StatusChip
            key={s}
            label={STATUS_META[s].label}
            count={stats?.byStatus[s]}
            active={statusFilter === s}
            tone={STATUS_META[s].tone}
            onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
          />
        ))}
      </div>

      {/* Puente monte→planta: guías emitidas en Títulos Habilitantes sin ingresar. */}
      <CtpGuiasBandeja key={bandejaKey} onIngresar={(n) => { setFormGtf(n); setShowForm(true); }} />

      {error && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-[var(--data-error-700)]">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <strong>Error:</strong> {error}
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto shrink-0 text-xs font-bold underline opacity-70 hover:opacity-100"
          >
            Cerrar
          </button>
        </div>
      )}

      <BulkActionsBar
        selectedIds={selectedPending}
        totalCount={pendingIds.length}
        onSelectAll={() => setSelectedIds(pendingIds)}
        onClearSelection={() => setSelectedIds([])}
        actions={[
          {
            id: "validate",
            label: "Validar seleccionados",
            icon: ThumbsUp,
            onClick: async (ids) => {
              setBusy("bulk");
              await validateMany(ids);
              setSelectedIds([]);
              setBusy(null);
            },
          },
        ]}
      />

      <CtpIngresosTable
        entries={entries}
        loading={loading}
        period={period}
        filtered={Boolean(statusFilter || search)}
        pendingIds={pendingIds}
        selectedIds={selectedIds}
        selectedPending={selectedPending}
        setSelectedIds={setSelectedIds}
        busy={busy}
        rejectingId={rejectingId}
        rejectReason={rejectReason}
        setRejectReason={setRejectReason}
        onStartReject={(id) => {
          setRejectingId(id);
          setRejectReason("");
        }}
        onCancelReject={() => {
          setRejectingId(null);
          setRejectReason("");
        }}
        onConfirmReject={reject}
        onValidate={validate}
        onDetail={setDetail}
        onChain={setChainEntry}
      />

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--text-tertiary)]">
            Mostrando <strong className="text-[var(--text-secondary)]">{rangeFrom}–{rangeTo}</strong> de{" "}
            <strong className="text-[var(--text-secondary)]">{total}</strong> registros
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page === 0 || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="inline-flex h-10 items-center gap-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>
            <span className="text-sm font-bold text-[var(--text-secondary)]">
              {page + 1} / {lastPage + 1}
            </span>
            <button
              type="button"
              disabled={page >= lastPage || loading}
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              className="inline-flex h-10 items-center gap-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <WoodEntryForm
          initialGtfNumber={formGtf ?? undefined}
          onClose={() => { setShowForm(false); setFormGtf(null); }}
          onSaved={(o) => {
            setShowForm(false);
            setFormGtf(null);
            setBandejaKey((k) => k + 1); // la guía ingresada sale de la bandeja
            void reload();
            // Sin señal el ingreso NO está en el libro: decirlo, no dar por guardado.
            if (o?.offline) {
              pushToast({
                tono: "warning",
                msg: "Sin señal: quedó anotado en el patio",
                detail: "El ingreso todavía NO está en el libro. Sube solo cuando vuelva la conexión.",
              });
            }
          }}
        />
      )}

      {detail && <CtpEntryDetailModal entry={detail} onClose={() => setDetail(null)} />}
      {chainEntry && <CtpIngresoCadenaModal entry={chainEntry} onClose={() => setChainEntry(null)} />}
      <ActionToasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

/** Chip de filtro por estado: punto de color + etiqueta + count. Reusa el tono
 *  del estado (STATUS_META) para leerse igual que los badges de la tabla. */
function StatusChip({
  label,
  count,
  active,
  tone,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  tone: "accent" | "success" | "warning" | "danger" | "info" | "muted";
  onClick: () => void;
}) {
  const activeCls =
    tone === "accent"
      ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
      : TONE_CHIP[tone].active;
  const dotCls = tone === "accent" ? "bg-[var(--accent)]" : TONE_CHIP[tone].dot;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-9 items-center gap-2 rounded-full border-2 px-3.5 text-sm font-bold transition ${
        active
          ? activeCls
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${dotCls}`} aria-hidden="true" />
      {label}
      {count != null && (
        <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-black/5 dark:bg-white/10" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

