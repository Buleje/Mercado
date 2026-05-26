"use client";

import { PageTitle } from "@buleje/design-system";
import { useState } from "react";
import { AlertTriangle, FileText, SlidersHorizontal, Bike, Printer, Package, DollarSign } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { ModuleActionMenu } from "@/components/admin/shared/ModuleActionMenu";
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
  if (filters.source) {
    activeOrders = activeOrders.filter(o => {
      // source ausente o "direct" ambos representan "Tienda Personal"
      const src = (o as DbOrder & { source?: string }).source ?? "direct";
      return src === filters.source;
    });
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
  const inDeliveryOrders = activeOrders.filter(o => o.status === "en_camino" || o.status === "confirmado" || o.status === "preparando").length;
  const todayDelivered = orders.filter(o => {
    if (o.status !== "entregado") return false;
    const today = new Date().toISOString().slice(0, 10);
    return o.createdAt.slice(0, 10) === today;
  }).length;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header — patrón estándar AdminModuleHeader (igual que EInvoice/Inventario/Compras).
          Eyebrow Kicker + PageTitle font-display + descripción + slot acciones. */}
      <AdminModuleHeader
        eyebrow="Operaciones · Hoy"
        title="Pedidos del día"
        description={
          activeOrders.length === 0
            ? "Sin pedidos activos. Aparecerán acá en tiempo real."
            : `${activeOrders.length} ${activeOrders.length === 1 ? "pedido" : "pedidos"} en marcha.${inDeliveryOrders > 0 ? ` ${inDeliveryOrders} en preparación o delivery.` : ""}${todayDelivered > 0 ? ` ${todayDelivered} entregado${todayDelivered === 1 ? "" : "s"} hoy.` : ""}`
        }
        icon={Package}
      >
        {/* #2 (2026-05-26): Filtros queda como acción primaria visible; las
            secundarias (Por motorizado, Imprimir, Archivados) se agrupan en un
            menú "Más" para descargar el header de 4 botones a 2. */}
        <button
          type="button"
          onClick={() => setShowAdvancedFilters(true)}
          className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-accent transition-colors"
        >
          <SlidersHorizontal className="h-4 w-4" /> Filtros
          {activeFiltersCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-xs font-bold bg-primary text-white">
              {activeFiltersCount}
            </span>
          )}
        </button>
        <ModuleActionMenu
          label="Más"
          items={[
            {
              label: filterByDelivery ? "Quitar filtro por motorizado" : "Filtrar por motorizado",
              icon: Bike,
              onClick: () => setFilterByDelivery((prev) => !prev),
            },
            {
              label: "Imprimir",
              icon: Printer,
              onClick: () => window.print(),
            },
            {
              label: "Archivados",
              icon: FileText,
              onClick: () => setShowArchive(true),
              description: archivedOrders.length > 0 ? `${archivedOrders.length} archivado${archivedOrders.length === 1 ? "" : "s"}` : undefined,
              dividerBefore: true,
            },
          ]}
        />
      </AdminModuleHeader>

      {/* #1 (2026-05-26): stat cards removidas — los conteos por estado ya viven
          en los chips de filtro (interactivos) y en los headers de columna del
          kanban. Triple redundancia eliminada; "Entregados hoy" se movió al
          subtítulo del header. */}

      {/* Delivery driver filter */}
      {filterByDelivery && (
        <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm font-semibold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">Filtrar por delivery:</p>
            <select
              value={selectedDriverFilter}
              onChange={e => setSelectedDriverFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 text-sm font-semibold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] bg-[var(--surface-raised)] outline-none focus:border-primary"
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
                className="text-xs font-semibold text-[var(--data-success-500)] hover:text-[var(--data-success-500)] underline"
              >
                Limpiar
              </button>
            )}
          </div>
          {selectedDriverFilter && (
            <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mt-2">
              Mostrando {activeOrders.length} pedido{activeOrders.length !== 1 ? "s" : ""} de {selectedDriverFilter}
            </p>
          )}
        </div>
      )}

      {/* Error banner */}
      {loadError && (
        <div className="mb-3 flex items-center gap-2 bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] rounded-xl px-4 py-3 text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{loadError}</span>
          <button
            onClick={() => { setLoadError(null); void load(); }}
            className="text-xs font-bold text-[var(--data-error-500)] hover:text-[var(--data-error-500)] underline"
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
          { id: "preparando", label: "Preparando", count: orders.filter(o => o.status === "preparando").length },
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
                  "inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-xs font-extrabold tabular-nums",
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
                ? "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)] border-[var(--data-warning-500)]/40"
                : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--data-warning-500)] hover:text-[var(--data-warning-500)]",
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
        onManualDelivery={(id, reason) =>
          patchOrder(id, {
            status: "entregado",
            // deliveryReason no es columna de Order — el server PATCH lo
            // extrae y persiste en OrderStatusHistory.note (audit log).
            ...({ deliveryReason: reason } as unknown as Partial<DbOrder>),
          })
        }
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
                <td className="py-1.5 text-right font-semibold">S/{Number(o.total).toFixed(2)}</td>
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

