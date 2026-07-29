"use client";

/**
 * CtpIngresosView — pestaña Ingresos del Libro CTP (ADR-124): la materia prima
 * que entra a planta, su validación y su trazabilidad.
 *
 * Los KPIs vienen de `?stats=1` (agregado en DB sobre todo el período) y no de
 * sumar la tabla: la tabla está paginada y sumarla diría "total" de una página.
 *
 * 2026-07-29 v2 — la vista orquesta y no dibuja: KPIs (CtpIngresosKpis) y
 * filtros (CtpIngresosFiltros) salieron a sus propios archivos. Suma filtros
 * por faceta, orden por columna, rechazo en lote, duplicar un ingreso y
 * descarga de lo filtrado.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ThumbsDown, ThumbsUp } from "@buleje/design-system/icons";
import BulkActionsBar from "@/components/admin/shared/BulkActionsBar";
import { useDebounce } from "@/hooks/use-debounce";
import { useGuardarPrefs, usePrefsIniciales } from "@/hooks/use-ctp-ingresos-prefs";
import {
  CTP_EXPORT_MAX,
  CTP_PAGE_SIZE,
  useCtpIngresos,
  type CtpSort,
  type CtpSortField,
} from "@/hooks/use-ctp-ingresos";
import { ingresosACsv, nombreArchivoIngresos } from "@/lib/forestal/ctp-ingresos-csv";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import WoodEntryForm, { type WoodEntryPreset } from "./WoodEntryForm";
import SpeciesAggregateChart from "./SpeciesAggregateChart";
import CtpEntryDetailModal from "./CtpEntryDetailModal";
import CtpIngresoCadenaModal from "./CtpIngresoCadenaModal";
import CtpIngresoEditModal from "./CtpIngresoEditModal";
import { useActionToasts, ActionToasts } from "./cubicador-toasts";
import CtpIngresosTable from "./CtpIngresosTable";
import CtpIngresosKpis from "./CtpIngresosKpis";
import CtpIngresosFiltros, { type CtpFacetasActivas } from "./CtpIngresosFiltros";
import CtpGuiasBandeja from "./CtpGuiasBandeja";
import CtpIngresosPaginacion from "./CtpIngresosPaginacion";
import {
  STATUS_META,
  originLabel,
  productLabel,
  type CtpFiltroRapido,
  type WoodEntry,
} from "./ctp-shared";

export default function CtpIngresosView({
  period,
  openGtf,
  onOpenConsumed,
  filtroRapido,
}: {
  period: CtpPeriod;
  /** Puente inverso: GTF que el shell mandó a ingresar (abre el form pre-llenado). */
  openGtf?: string | null;
  onOpenConsumed?: () => void;
  /** Filtro pedido desde otra pestaña (tira de pendientes / Cumplimiento). */
  filtroRapido?: CtpFiltroRapido | null;
}) {
  // Cómo dejó la pestaña la última vez (orden + filtros; la búsqueda no).
  const prefs = usePrefsIniciales();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 350);
  const [statusFilter, setStatusFilter] = useState<string>(prefs.statusFilter);
  const [facetas, setFacetas] = useState<CtpFacetasActivas>(prefs.facetas);
  const [sort, setSort] = useState<CtpSort>(prefs.sort);
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<WoodEntry | null>(null);
  const [chainEntry, setChainEntry] = useState<WoodEntry | null>(null);
  const [editEntry, setEditEntry] = useState<WoodEntry | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { toasts, push: pushToast, dismiss: dismissToast } = useActionToasts();
  const [showDashboard, setShowDashboard] = useState(false);
  // Bandeja monte→planta: guía elegida para pre-cargar el form + key para refrescarla tras guardar.
  const [formGtf, setFormGtf] = useState<string | null>(null);
  const [formPreset, setFormPreset] = useState<WoodEntryPreset | undefined>(undefined);
  const [bandejaKey, setBandejaKey] = useState(0);
  // Rechazo en lote: el motivo es obligatorio, así que se pide una vez para todos.
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [bulkReason, setBulkReason] = useState("");
  const [descargando, setDescargando] = useState(false);

  const filtros = useMemo(
    () => ({ status: statusFilter, search, ...facetas }),
    [statusFilter, search, facetas],
  );

  useGuardarPrefs(useMemo(() => ({ statusFilter, facetas, sort }), [statusFilter, facetas, sort]));

  const {
    entries,
    stats,
    total,
    loading,
    error,
    setError,
    reload,
    runAction,
    validateMany,
    rejectMany,
    fetchAllFiltered,
  } = useCtpIngresos({ period, filtros, sort, page });

  // Un filtro nuevo describe otro conjunto: la página 4 del anterior no existe.
  useEffect(() => {
    setPage(0);
    setSelectedIds([]);
  }, [search, statusFilter, facetas, period, sort]);

  // Llegó desde un aviso ("2 fuera de plazo", "1 CITES sin permiso"): la lista
  // se abre mostrando ESOS casos. El filtro pedido reemplaza al que hubiera —
  // dos filtros superpuestos darían un vacío inexplicable.
  useEffect(() => {
    if (!filtroRapido) return;
    setSearchInput("");
    if (filtroRapido.tipo === "pendiente") {
      setStatusFilter("pendiente");
      setFacetas({});
    } else if (filtroRapido.tipo === "fuera-de-plazo") {
      setStatusFilter("");
      setFacetas({ late: true });
    } else {
      setStatusFilter("");
      setFacetas({ cites: true });
    }
  }, [filtroRapido]);

  // Puente inverso desde Títulos Habilitantes: abre el form con la guía elegida.
  useEffect(() => {
    if (!openGtf) return;
    setFormGtf(openGtf);
    setFormPreset(undefined);
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

  // Atajos del teclado para la carga en tanda: el almacenero valida 20 guías
  // seguidas y soltar el mouse para cada una cuesta más que la validación.
  // Se apagan mientras se escribe (input/textarea/select o contenteditable) y
  // con cualquier modificador — Ctrl+N del navegador no se toca.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const t = ev.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      // Con un modal abierto manda el modal (Escape lo cierra, no la vista).
      if (showForm || detail || chainEntry || editEntry) return;

      if (ev.key === "n" || ev.key === "N") {
        ev.preventDefault();
        setFormGtf(null);
        setFormPreset(undefined);
        setShowForm(true);
      } else if (ev.key === "/") {
        ev.preventDefault();
        document.getElementById("ctp-ing-search")?.focus();
      } else if (ev.key === "r" || ev.key === "R") {
        ev.preventDefault();
        void reload();
      } else if (ev.key === "v" || ev.key === "V") {
        // Validar lo seleccionado: sólo si hay selección, y sin confirmación
        // extra — validar es reversible (se anula con motivo).
        if (selectedPending.length === 0) return;
        ev.preventDefault();
        setBusy("bulk");
        void validateMany(selectedPending).then(() => {
          setSelectedIds([]);
          setBusy(null);
        });
      } else if (ev.key === "Escape") {
        setSelectedIds([]);
        setBulkRejecting(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showForm, detail, chainEntry, editEntry, selectedPending, reload, validateMany]);


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

  /** Duplicar: abre el form con lo que se repite; GTF y volumen quedan vacíos. */
  const duplicar = useCallback((e: WoodEntry) => {
    setFormGtf(null);
    setFormPreset({
      providerName: e.providerName,
      providerDocument: e.providerDocument,
      providerDocumentType: e.providerDocumentType,
      originType: e.originType,
      originCode: e.originCode,
      originRegion: e.originRegion,
      originDistrict: e.originDistrict,
      speciesCommonName: e.speciesCommonName,
      productType: e.productType,
    });
    setShowForm(true);
  }, []);

  /** Ordenar: mismo campo alterna dirección; campo nuevo arranca descendente
   *  (lo más nuevo / lo más grande primero es lo que se busca el 90% de veces). */
  const ordenar = useCallback((field: CtpSortField) => {
    setSort((prev) => (prev.by === field ? { by: field, dir: prev.dir === "asc" ? "desc" : "asc" } : { by: field, dir: "desc" }));
  }, []);

  async function descargar() {
    setDescargando(true);
    try {
      const { entries: todos, truncated } = await fetchAllFiltered();
      const csv = ingresosACsv(todos, {
        origenLabel: originLabel,
        productoLabel: productLabel,
        estadoLabel: (s) => STATUS_META[s as keyof typeof STATUS_META]?.label ?? s,
      });
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreArchivoIngresos(period.label, statusFilter || facetas.provider || facetas.species);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      pushToast({
        tono: truncated ? "warning" : "success",
        msg: truncated ? `Descargados los primeros ${CTP_EXPORT_MAX}` : `${todos.length} ingresos descargados`,
        detail: truncated
          ? `El filtro tiene más de ${CTP_EXPORT_MAX} registros. Acotá el período para bajar el resto.`
          : "Se abre en Excel con las columnas ya separadas.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDescargando(false);
    }
  }

  const hayFiltro = Boolean(statusFilter || search || facetas.species || facetas.provider || facetas.product || facetas.cites !== undefined || facetas.late);

  return (
    <div className="space-y-4">
      <CtpIngresosKpis
        stats={stats}
        statusFilter={statusFilter}
        citesOn={facetas.cites === true}
        lateOn={facetas.late === true}
        onStatus={setStatusFilter}
        onCites={() => setFacetas((f) => ({ ...f, cites: f.cites === true ? undefined : true }))}
        onLate={() => setFacetas((f) => ({ ...f, late: f.late ? undefined : true }))}
        onVolumen={() => setShowDashboard((v) => !v)}
        dashboardOn={showDashboard}
      />

      {showDashboard && <SpeciesAggregateChart period={period} />}

      <CtpIngresosFiltros
        searchInput={searchInput}
        onSearch={setSearchInput}
        statusFilter={statusFilter}
        onStatus={setStatusFilter}
        facetas={facetas}
        onFacetas={setFacetas}
        stats={stats}
        loading={loading}
        dashboardOn={showDashboard}
        onDashboard={() => setShowDashboard((v) => !v)}
        onReload={() => void reload()}
        onNuevo={() => { setFormGtf(null); setFormPreset(undefined); setShowForm(true); }}
        onDescargar={() => void descargar()}
        descargando={descargando}
        totalFiltrado={total}
      />

      {/* Puente monte→planta: guías emitidas en Títulos Habilitantes sin ingresar. */}
      <CtpGuiasBandeja key={bandejaKey} onIngresar={(n) => { setFormPreset(undefined); setFormGtf(n); setShowForm(true); }} />

      {error && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
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
        onClearSelection={() => { setSelectedIds([]); setBulkRejecting(false); }}
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
          {
            id: "reject",
            label: "Rechazar seleccionados",
            icon: ThumbsDown,
            variant: "danger",
            // No dispara nada todavía: rechazar exige motivo, y un lote sin
            // motivo es un rechazo que después nadie puede explicar.
            onClick: () => { setBulkRejecting(true); setBulkReason(""); },
          },
        ]}
      />

      {bulkRejecting && selectedPending.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] p-3 dark:bg-[var(--data-error-500)]/12">
          <label htmlFor="ctp-bulk-reason" className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            Motivo del rechazo de {selectedPending.length}:
          </label>
          <input
            id="ctp-bulk-reason"
            type="text"
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
            placeholder="Ej: volumen no coincide con la guía (mín. 3 caracteres)"
            className="h-10 min-w-0 flex-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-error-500)]"
            autoFocus
          />
          <button
            type="button"
            disabled={bulkReason.trim().length < 3 || busy === "bulk"}
            onClick={async () => {
              setBusy("bulk");
              await rejectMany(selectedPending, bulkReason.trim());
              setSelectedIds([]);
              setBulkRejecting(false);
              setBulkReason("");
              setBusy(null);
            }}
            className="inline-flex h-10 items-center rounded-xl bg-[var(--data-error-600)] px-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            Confirmar rechazo
          </button>
          <button
            type="button"
            onClick={() => setBulkRejecting(false)}
            className="inline-flex h-10 items-center rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)]"
          >
            Cancelar
          </button>
        </div>
      )}

      <CtpIngresosTable
        entries={entries}
        loading={loading}
        period={period}
        filtered={hayFiltro}
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
        onDuplicate={duplicar}
        onEdit={setEditEntry}
        sort={sort}
        onSort={ordenar}
      />

      <CtpIngresosPaginacion
        total={total}
        page={page}
        pageSize={CTP_PAGE_SIZE}
        loading={loading}
        onPage={setPage}
      />

      {showForm && (
        <WoodEntryForm
          initialGtfNumber={formGtf ?? undefined}
          preset={formPreset}
          onClose={() => { setShowForm(false); setFormGtf(null); setFormPreset(undefined); }}
          onSaved={(o) => {
            setShowForm(false);
            setFormGtf(null);
            setFormPreset(undefined);
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
      {editEntry && (
        <CtpIngresoEditModal
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onSaved={() => {
            setEditEntry(null);
            void reload();
            pushToast({ tono: "success", msg: "Ingreso corregido", detail: "El cambio quedó registrado en el historial del ingreso." });
          }}
        />
      )}
      <ActionToasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
