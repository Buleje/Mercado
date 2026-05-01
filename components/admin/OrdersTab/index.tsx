"use client";

import { PageTitle } from "@buleje/design-system";
import { useMemo, useState } from "react";
import { AlertTriangle, FileText, SlidersHorizontal, Bike, Printer, DollarSign } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { useOrdersData } from "./hooks/useOrdersData";
import { useOrdersFilters } from "./hooks/useOrdersFilters";
import { useDeliveryDriver } from "./hooks/useDeliveryDriver";
import { useOrderBulkActions } from "./hooks/useOrderBulkActions";
import { useOrderActions } from "./hooks/useOrderActions";
import { OrdersKanban } from "./OrdersKanban";
import { OrdersFilters } from "./OrdersFilters";
import { OrdersBulkActions } from "./OrdersBulkActions";
import { OrdersDetailPanel } from "./OrdersDetailPanel";
import { OrdersArchive } from "./OrdersArchive";
import { OrdersPrintPreview } from "./OrdersPrintPreview";
import { DeleteConfirmModal, RejectModal } from "./OrdersModals";
import { STATUS_LABELS } from "./types";
import type { DbOrder } from "@/lib/jsondb";

export default function OrdersTab() {
  const {
    orders,
    loading,
    loadError,
    storeLat,
    storeLon,
    storeName,
    detailOrder,
    load,
    setOrders,
    setLoadError,
    setDetailOrder,
  } = useOrdersData();

  const { filters, dispatch: filtersDispatch, activeFiltersCount } = useOrdersFilters();

  const {
    updateStatus,
    patchOrder,
    verifyYape,
    rejectYape,
    markDeudaPaid,
    adminNote,
    setAdminNote,
    savingNote,
    saveAdminNote,
    showRejectModal,
    setShowRejectModal,
    rejectReason,
    setRejectReason,
    executeReject,
    confirmDeleteId,
    setConfirmDeleteId,
    confirmDelete,
  } = useOrderActions({ orders, setOrders, setDetailOrder, load });

  const {
    customDriver,
    setCustomDriver,
    savingDriver,
    filterByDelivery,
    setFilterByDelivery,
    selectedDriverFilter,
    setSelectedDriverFilter,
    saveDeliveryDriver,
    driverColor,
  } = useDeliveryDriver({ patchOrder });

  const {
    selectedOrderIds,
    bulkStatusTarget,
    setBulkStatusTarget,
    bulkUpdating,
    toggleOrderSelect,
    clearOrderSelection,
    executeBulkStatus,
  } = useOrderBulkActions({ onComplete: load });

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  useScrollLock(!!detailOrder || showArchive || !!confirmDeleteId || showAdvancedFilters || showPrintPreview);

  // Active orders filtering
  let activeOrders = orders.filter(o => o.status !== "entregado" && o.status !== "cancelado");

  if (filters.statuses.size > 0) {
    activeOrders = activeOrders.filter(o => filters.statuses.has(o.status));
  }
  if (filters.paymentMethod) {
    activeOrders = activeOrders.filter(o => o.paymentMethod === filters.paymentMethod);
  }
  if (filters.dateFrom) {
    activeOrders = activeOrders.filter(o => o.createdAt.slice(0, 10) >= filters.dateFrom);
  }
  if (filters.dateTo) {
    activeOrders = activeOrders.filter(o => o.createdAt.slice(0, 10) <= filters.dateTo);
  }
  if (filters.amountMin) {
    activeOrders = activeOrders.filter(o => o.total >= parseFloat(filters.amountMin));
  }
  if (filters.amountMax) {
    activeOrders = activeOrders.filter(o => o.total <= parseFloat(filters.amountMax));
  }
  if (filters.customerSearch) {
    const q = filters.customerSearch.toLowerCase();
    activeOrders = activeOrders.filter(o =>
      o.customer.name.toLowerCase().includes(q) ||
      (o.customer.phone ?? "").includes(q)
    );
  }
  if (filters.hasDebt) {
    activeOrders = activeOrders.filter(o => o.deuda === true);
  }
  if (filters.hasAdminNotes) {
    activeOrders = activeOrders.filter(o => (o as DbOrder & { adminNotes?: string }).adminNotes);
  }
  if (filterByDelivery && selectedDriverFilter) {
    activeOrders = activeOrders.filter(o => {
      const driver = (o as DbOrder & { deliveryDriver?: string }).deliveryDriver;
      return driver === selectedDriverFilter;
    });
  }

  const archivedOrders = orders.filter(o => o.status === "entregado" || o.status === "cancelado");
  const total = activeOrders.reduce((s, o) => s + o.total, 0);

  // Stats agregados
  const pendingOrders = activeOrders.filter(o => o.status === "pendiente").length;
  const inDeliveryOrders = activeOrders.filter(o => o.status === "en_camino" || o.status === "confirmado").length;
  const todayDelivered = orders.filter(o => {
    if (o.status !== "entregado") return false;
    const today = new Date().toISOString().slice(0, 10);
    return o.createdAt.slice(0, 10) === today;
  }).length;

  // Sparkline 7d — agrupar por día (entregados últimos 7 días)
  const deliveredSparkline = useMemo(() => {
    const buckets = new Array(7).fill(0);
    // eslint-disable-next-line react-hooks/purity -- Date.now() es intencional para calcular ventana de 7 días
    const now = Date.now();
    for (const o of orders) {
      if (o.status !== "entregado") continue;
      const ageDays = Math.floor((now - new Date(o.createdAt).getTime()) / 86_400_000);
      if (ageDays >= 0 && ageDays < 7) buckets[6 - ageDays] += 1;
    }
    return buckets;
  }, [orders]);

  return (
    <div className="space-y-5 sm:space-y-7">
      {/* Header editorial Buleje — eyebrow + título display italic + acciones a la derecha */}
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 pb-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
            Operaciones · Hoy
          </p>
          <PageTitle className="font-display italic text-4xl sm:text-5xl font-black leading-[1.05] tracking-[var(--ls-tight)] text-[var(--text-primary)]">
            Pedidos del día
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-2xl">
            {activeOrders.length === 0
              ? "Tranqui — sin pedidos activos. Cuando llegue uno aparece acá en tiempo real."
              : `${activeOrders.length} ${activeOrders.length === 1 ? "pedido" : "pedidos"} en marcha · ${inDeliveryOrders} en preparación o ruta · S/${total.toFixed(2)} por cobrar.`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => setFilterByDelivery((prev) => !prev)}
            className={cn(
              "inline-flex items-center gap-1.5 h-11 px-4 rounded-xl text-sm font-bold transition-colors border-2",
              filterByDelivery
                ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] border-[var(--text-primary)]"
                : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
            )}
          >
            <Bike className="h-4 w-4" /> Por motorizado
          </button>
          <button
            type="button"
            onClick={() => setShowAdvancedFilters(true)}
            className="relative inline-flex items-center gap-1.5 h-11 px-4 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            <SlidersHorizontal className="h-4 w-4" /> Filtros
            {activeFiltersCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-xs font-bold bg-[var(--accent)] text-white">
                {activeFiltersCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </button>
          <button
            type="button"
            onClick={() => setShowArchive(true)}
            className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            <FileText className="h-4 w-4" /> Archivados
            {archivedOrders.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-6 h-5 px-1.5 rounded-md text-xs font-black bg-[var(--surface-sunken)] text-[var(--text-primary)] tabular-nums">
                {archivedOrders.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* KPIs editoriales — número grande italic + sparkline en el último */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Activos", value: activeOrders.length, intent: "neutral" as const, sub: `S/${total.toFixed(0)}` },
          { label: "Por confirmar", value: pendingOrders, intent: pendingOrders > 0 ? "warning" : "neutral", sub: pendingOrders > 0 ? "Acción urgente" : "Todo al día" },
          { label: "En preparación · ruta", value: inDeliveryOrders, intent: "neutral" as const, sub: inDeliveryOrders > 0 ? "Cocina + motorizados" : "Sin pendientes" },
          { label: "Entregados hoy", value: todayDelivered, intent: "neutral" as const, sub: "7 días", sparkline: deliveredSparkline },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5"
          >
            <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              {kpi.label}
            </p>
            <div className="mt-2 flex items-end justify-between gap-2">
              <p
                className={cn(
                  "font-display italic text-4xl sm:text-5xl font-black leading-none tabular-nums tracking-[var(--ls-tight)]",
                  kpi.intent === "warning" ? "text-[var(--data-warning)]" : "text-[var(--text-primary)]",
                )}
              >
                {kpi.value}
              </p>
              {kpi.sparkline && kpi.sparkline.length > 1 && (
                <KpiSparkline data={kpi.sparkline} />
              )}
            </div>
            <p className="text-xs font-semibold text-[var(--text-tertiary)] mt-2">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Delivery driver filter */}
      {filterByDelivery && (
        <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 rounded-xl p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm font-semibold text-[var(--data-success)] dark:text-[var(--data-success)]">Filtrar por delivery:</p>
            <select
              value={selectedDriverFilter}
              onChange={e => setSelectedDriverFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 text-sm font-semibold text-[var(--data-success)] dark:text-[var(--data-success)] bg-white dark:bg-card outline-none focus:border-primary"
            >
              <option value="">Todos los deliverys</option>
              {Array.from(new Set(
                orders
                  .map(o => (o as DbOrder & { deliveryDriver?: string }).deliveryDriver)
                  .filter(Boolean)
              )).sort().map(driver => (
                <option key={driver} value={driver}>{driver}</option>
              ))}
            </select>
            {selectedDriverFilter && (
              <button
                onClick={() => setSelectedDriverFilter("")}
                className="text-xs font-semibold text-[var(--data-success)] hover:text-[var(--data-success)] underline"
              >
                Limpiar
              </button>
            )}
          </div>
          {selectedDriverFilter && (
            <p className="text-xs text-[var(--data-success)] dark:text-[var(--data-success)] mt-2">
              Mostrando {activeOrders.length} pedido{activeOrders.length !== 1 ? "s" : ""} de {selectedDriverFilter}
            </p>
          )}
        </div>
      )}

      {/* Error banner */}
      {loadError && (
        <div className="mb-3 flex items-center gap-2 bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error)] dark:border-[var(--data-error)] rounded-xl px-4 py-3 text-sm text-[var(--data-error)] dark:text-[var(--data-error)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{loadError}</span>
          <button
            onClick={() => { setLoadError(null); void load(); }}
            className="text-xs font-bold text-[var(--data-error)] hover:text-[var(--data-error)] underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Quick filter chips por status — atajo visual sin abrir filtros avanzados */}
      <div role="group" aria-label="Filtros rapidos por estado" className="flex items-center gap-2 flex-wrap">
        {([
          { id: "all", label: "Todos", count: activeOrders.length },
          { id: "pendiente", label: "Pendientes", count: orders.filter(o => o.status === "pendiente").length },
          { id: "confirmado", label: "Confirmados", count: orders.filter(o => o.status === "confirmado").length },
          { id: "en_camino", label: "En camino", count: orders.filter(o => o.status === "en_camino").length },
        ] as const).map((chip) => {
          const active =
            chip.id === "all"
              ? filters.statuses.size === 0
              : filters.statuses.size === 1 && filters.statuses.has(chip.id);
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => {
                if (chip.id === "all") {
                  filtersDispatch({ type: "SET_STATUSES", statuses: new Set() });
                } else {
                  filtersDispatch({ type: "SET_STATUSES", statuses: new Set([chip.id]) });
                }
              }}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-sm font-bold transition-colors border",
                active
                  ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] border-[var(--text-primary)]"
                  : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)]",
              )}
            >
              {chip.label}
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-xs font-black tabular-nums",
                  active
                    ? "bg-[var(--surface-canvas)]/20 text-[var(--surface-canvas)]"
                    : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                )}
              >
                {chip.count}
              </span>
            </button>
          );
        })}

        {/* Sub-filtros adicionales: con deuda + Yape pendiente (visible si > 0) */}
        {orders.some(o => o.deuda === true) && (
          <button
            type="button"
            onClick={() => filtersDispatch({ type: "SET_HAS_DEBT", value: !filters.hasDebt })}
            aria-pressed={filters.hasDebt}
            className={cn(
              "inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-sm font-bold transition-colors border",
              filters.hasDebt
                ? "bg-[var(--data-warning)]/15 text-[var(--data-warning)] border-[var(--data-warning)]/40"
                : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--data-warning)] hover:text-[var(--data-warning)]",
            )}
          >
            <DollarSign className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            Con deuda
          </button>
        )}
      </div>

      {/* Orders kanban — 3 columnas operativas */}
      <OrdersKanban
        activeOrders={activeOrders}
        loading={loading}
        storeLat={storeLat}
        storeLon={storeLon}
        selectedOrderIds={selectedOrderIds}
        driverColor={driverColor}
        onSelectOrder={setDetailOrder}
        onToggleSelect={toggleOrderSelect}
        onUpdateStatus={updateStatus}
        onVerifyYape={verifyYape}
        onRejectYape={rejectYape}
        onMarkDeudaPaid={markDeudaPaid}
        onDeleteOrder={setConfirmDeleteId}
      />

      {/* Print-only summary */}
      <div className="hidden print:block print-orders-summary">
        <PageTitle className="text-lg font-bold mb-1">Resumen de pedidos activos</PageTitle>
        <p className="text-xs text-[var(--text-secondary)] mb-4">
          {new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })} · {activeOrders.length} pedidos · S/{total.toFixed(2)} total
        </p>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-900">
              <th className="text-left py-1 pr-2">ID</th>
              <th className="text-left py-1 pr-2">Cliente</th>
              <th className="text-left py-1 pr-2">Teléfono</th>
              <th className="text-left py-1 pr-2">Estado</th>
              <th className="text-left py-1 pr-2">Productos</th>
              <th className="text-right py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {activeOrders.map(o => (
              <tr key={o.id} className="border-b border-[var(--rule-base)]">
                <td className="py-1.5 pr-2 font-mono">{o.id.slice(-6)}</td>
                <td className="py-1.5 pr-2">{o.customer.name}</td>
                <td className="py-1.5 pr-2">{o.customer.phone || "—"}</td>
                <td className="py-1.5 pr-2">{STATUS_LABELS[o.status]}</td>
                <td className="py-1.5 pr-2">{o.items.map(i => `${i.quantity}× ${i.name}`).join(", ")}</td>
                <td className="py-1.5 text-right font-semibold">S/{o.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showAdvancedFilters && (
        <OrdersFilters
          filters={filters}
          dispatch={filtersDispatch}
          onClose={() => setShowAdvancedFilters(false)}
        />
      )}

      {detailOrder && (
        <OrdersDetailPanel
          order={detailOrder}
          adminNote={adminNote}
          savingNote={savingNote}
          customDriver={customDriver}
          savingDriver={savingDriver}
          driverColor={driverColor}
          onClose={() => setDetailOrder(null)}
          onAdminNoteChange={setAdminNote}
          onSaveAdminNote={saveAdminNote}
          onVerifyYape={verifyYape}
          onRejectYape={rejectYape}
          onMarkDeudaPaid={markDeudaPaid}
          onShowRejectModal={id => { setShowRejectModal(id); setRejectReason(""); }}
          onCustomDriverChange={setCustomDriver}
          onSaveCustomDriver={saveDeliveryDriver}
          onPatchOrder={patchOrder}
        />
      )}

      {showArchive && (
        <OrdersArchive
          archivedOrders={archivedOrders}
          onSelectOrder={order => { setDetailOrder(order); setShowArchive(false); }}
          onDeleteOrder={setConfirmDeleteId}
          onClose={() => setShowArchive(false)}
        />
      )}

      {showPrintPreview && (
        <OrdersPrintPreview
          orders={orders}
          selectedOrderIds={selectedOrderIds}
          storeName={storeName}
          driverColor={driverColor}
          onClose={() => setShowPrintPreview(false)}
        />
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <DeleteConfirmModal
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {/* Rejection modal */}
      {showRejectModal && (
        <RejectModal
          rejectReason={rejectReason}
          onReasonChange={setRejectReason}
          onConfirm={executeReject}
          onCancel={() => setShowRejectModal(null)}
        />
      )}

      {/* Bulk actions bar */}
      <OrdersBulkActions
        selectedCount={selectedOrderIds.size}
        bulkStatusTarget={bulkStatusTarget}
        bulkUpdating={bulkUpdating}
        onBulkStatusChange={setBulkStatusTarget}
        onExecuteBulkStatus={executeBulkStatus}
        onClearSelection={clearOrderSelection}
        onShowPrint={() => setShowPrintPreview(true)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KpiSparkline — micro chart 7 días para el KPI "Entregados hoy"
// ─────────────────────────────────────────────────────────────────────────────

function KpiSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 56;
  const h = 24;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - 2 - ((v - min) / range) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const trendUp = last >= prev;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="overflow-visible opacity-80 shrink-0"
      aria-hidden
    >
      <polyline
        points={pts}
        fill="none"
        stroke={trendUp ? "var(--data-success)" : "var(--data-error)"}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
