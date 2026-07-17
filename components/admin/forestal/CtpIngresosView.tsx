"use client";

/**
 * CtpIngresosView — pestaña Ingresos del Libro CTP (ADR-124): la materia prima
 * que entra a planta, su validación y su trazabilidad.
 *
 * Los KPIs vienen de `?stats=1` (agregado en DB sobre todo el período) y no de
 * sumar la tabla: la tabla está paginada y sumarla diría "total" de una página.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Plus,
  RefreshCw,
  Search,
  ThumbsUp,
  TreePine,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import BulkActionsBar from "@/components/admin/shared/BulkActionsBar";
import { useDebounce } from "@/hooks/use-debounce";
import { CTP_PAGE_SIZE, useCtpIngresos } from "@/hooks/use-ctp-ingresos";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import WoodEntryForm from "./WoodEntryForm";
import SpeciesAggregateChart from "./SpeciesAggregateChart";
import CtpEntryDetailModal from "./CtpEntryDetailModal";
import CtpIngresosTable from "./CtpIngresosTable";
import { STATUS_META, type WoodEntry, type WoodEntryStatus } from "./ctp-shared";

const STATUS_ORDER: WoodEntryStatus[] = [
  "pendiente",
  "validado",
  "procesado",
  "rechazado",
  "anulado",
];

export default function CtpIngresosView({ period }: { period: CtpPeriod }) {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 350);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<WoodEntry | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  const { entries, stats, total, loading, error, setError, reload, runAction, validateMany } =
    useCtpIngresos({ period, status: statusFilter, search, page });

  // Un filtro nuevo describe otro conjunto: la página 4 del anterior no existe.
  useEffect(() => {
    setPage(0);
    setSelectedIds([]);
  }, [search, statusFilter, period]);

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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Ingresos del período"
          value={stats ? stats.totalCount.toLocaleString("es-PE") : "—"}
          subValue={stats ? `${stats.totalPieces.toLocaleString("es-PE")} piezas` : undefined}
          icon={Boxes}
          emphasis="neutral"
        />
        <StatCard
          label="Volumen del período"
          value={stats ? `${Number(stats.totalVolumeM3).toFixed(2)} m³` : "—"}
          subValue={stats ? `${stats.speciesCount} especies` : undefined}
          icon={TreePine}
          emphasis="success"
        />
        <StatCard
          label="Pendientes validar"
          value={stats ? String(stats.byStatus.pendiente) : "—"}
          subValue={stats?.byStatus.pendiente ? "Requieren acción" : "Todo al día"}
          icon={Clock}
          emphasis={stats?.byStatus.pendiente ? "warning" : "neutral"}
        />
        <StatCard
          label="Especies CITES"
          value={stats ? String(stats.citesCount) : "—"}
          subValue={stats ? `${Number(stats.citesVolumeM3).toFixed(2)} m³ protegidos` : undefined}
          icon={AlertCircle}
          emphasis={stats?.citesCount ? "error" : "neutral"}
        />
      </div>

      {showDashboard && <SpeciesAggregateChart period={period} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
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
        <div className="flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
          <Filter className="h-4 w-4 text-[var(--text-tertiary)]" />
          <label htmlFor="ctp-ing-status" className="sr-only">
            Filtrar por estado
          </label>
          <select
            id="ctp-ing-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent text-base font-medium text-[var(--text-primary)] outline-none"
          >
            <option value="">Todos los estados{stats ? ` (${stats.totalCount})` : ""}</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
                {stats ? ` (${stats.byStatus[s]})` : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setShowDashboard((v) => !v)}
          className={`inline-flex h-12 items-center gap-2 rounded-2xl border-2 px-4 text-sm font-bold transition ${
            showDashboard
              ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-white"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          {showDashboard ? "Cerrar dashboard" : "Dashboard"}
        </button>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Recargar
        </button>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--brand-ink)] px-5 text-base font-bold text-white shadow-sm hover:opacity-90"
        >
          <Plus className="h-5 w-5" />
          Nuevo ingreso
        </button>
      </div>

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
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void reload();
          }}
        />
      )}

      {detail && <CtpEntryDetailModal entry={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

