"use client";

import { PageTitle, SectionTitle } from "@buleje/design-system";
import { useState } from "react";
import { AlertTriangle, FileText, SlidersHorizontal, Bike, Printer } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { useOrdersData } from "./hooks/useOrdersData";
import { useOrdersFilters } from "./hooks/useOrdersFilters";
import { useDeliveryDriver } from "./hooks/useDeliveryDriver";
import { useOrderBulkActions } from "./hooks/useOrderBulkActions";
import { useOrderActions } from "./hooks/useOrderActions";
import { OrdersList } from "./OrdersList";
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
    deliveryDriver,
    setDeliveryDriver,
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
  const [ordPage, setOrdPage] = useState(1);

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

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground">Pedidos</SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted">
            {activeOrders.length} activos · S/{total.toFixed(2)} total
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterByDelivery(prev => !prev)}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
              filterByDelivery
                ? "text-white bg-primary"
                : "text-[var(--text-secondary)] dark:text-muted bg-gray-100 dark:bg-accent hover:bg-gray-200"
            )}
          >
            <Bike className="h-4 w-4" />
            Por delivery
          </button>
          <button
            onClick={() => setShowAdvancedFilters(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text-secondary)] dark:text-muted bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors relative"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros avanzados
            {activeFiltersCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white text-xs font-bold rounded-full flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text-secondary)] dark:text-muted bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
          <button
            onClick={() => setShowArchive(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text-secondary)] dark:text-muted bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors"
          >
            <FileText className="h-4 w-4" />
            Cancelados y Entregados
            {archivedOrders.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-gray-300 text-[var(--text-primary)] dark:text-foreground text-xs font-bold">
                {archivedOrders.length}
              </span>
            )}
          </button>
        </div>
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

      {/* Orders list */}
      <OrdersList
        activeOrders={activeOrders}
        loading={loading}
        storeLat={storeLat}
        storeLon={storeLon}
        selectedOrderIds={selectedOrderIds}
        ordPage={ordPage}
        driverColor={driverColor}
        onSelectOrder={setDetailOrder}
        onToggleSelect={toggleOrderSelect}
        onUpdateStatus={updateStatus}
        onVerifyYape={verifyYape}
        onRejectYape={rejectYape}
        onMarkDeudaPaid={markDeudaPaid}
        onDeleteOrder={setConfirmDeleteId}
        onPageChange={setOrdPage}
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
          deliveryDriver={deliveryDriver}
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
          onDeliveryDriverChange={setDeliveryDriver}
          onCustomDriverChange={setCustomDriver}
          onSaveDeliveryDriver={saveDeliveryDriver}
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
