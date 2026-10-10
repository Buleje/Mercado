"use client";

/**
 * Pedidos y reparto (`?tab=pedidos`) — plan «panel unificado», 2026-10-09.
 *
 * Cuatro vistas en `?vista=` (link propio, «atrás» del navegador, destino de
 * avisos y del buscador):
 *   tablero     ← el kanban de siempre
 *   lista       ← los mismos pedidos en una tabla
 *   reparto     ← Delivery entero (DeliveryPartnersModule anidado; Brandon
 *                 eligió Delivery DENTRO de Pedidos el 09-10)
 *   archivados  ← antes un modal del menú «Más»
 *
 * Los filtros viven en UNA barra pegada al tablero o a la lista
 * (`BarraPedidos`); qué pedidos pasan lo decide `filtrar-pedidos.ts`, así el
 * tablero y la lista nunca dicen cosas distintas. Reparto se ve si su ORIGEN
 * (delivery-partners) pasa el plan, la plantilla, el rubro y el rol (R2).
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import { AlertTriangle, Archive, Kanban, List, Package, Printer, Truck } from "@buleje/design-system/icons";
import type { AdminTab } from "@/components/admin/shared/AdminTabBar";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { ModuleActionMenu } from "@/components/admin/shared/ModuleActionMenu";
import { EmptyState } from "@/components/admin/EmptyState";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import { useContextoPermiso, useVistasPermitidas } from "@/hooks/use-vistas-permitidas";
import { limaDateKey } from "@/lib/utils";
import type { DbOrder } from "@/lib/jsondb";
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
import { BarraPedidos } from "./BarraPedidos";
import { ListaPedidos } from "./ListaPedidos";
import { ResumenImpresion } from "./ResumenImpresion";
import { pedidosArchivados, pedidosEnMarcha, repartidoresConPedidos } from "./filtrar-pedidos";

// Delivery entero, montado como vista (R5: mover = montar). Trae el mapa
// Leaflet, que usa `window`.
const Reparto = dynamic(() => import("@/components/admin/unified/DeliveryPartnersModule"), {
  ssr: false,
  loading: () => <LoadingSpinner className="mx-auto my-16" />,
});

const MODULE_ID = "pedidos";

const VISTAS: AdminTab[] = [
  { id: "tablero", label: "Tablero", icon: Kanban },
  { id: "lista", label: "Lista", icon: List },
  { id: "reparto", label: "Reparto", icon: Truck },
  { id: "archivados", label: "Archivados", icon: Archive },
];
type Vista = "tablero" | "lista" | "reparto" | "archivados";
const IDS_VISTAS: readonly Vista[] = ["tablero", "lista", "reparto", "archivados"];

export default function OrdersTab({ initialTab }: { initialTab?: string } = {}) {
  const { vista, irA } = useVistaModulo<Vista>(MODULE_ID, IDS_VISTAS, "tablero", initialTab);
  const vistas = useVistasPermitidas(MODULE_ID, VISTAS);
  const contextoPermiso = useContextoPermiso();

  const { orders, loading, loadError, storeLat, storeLon, storeName, detailOrder, load, setOrders, setLoadError, setDetailOrder } =
    useOrdersData();
  const { filters, dispatch: filtersDispatch } = useOrdersFilters();

  const {
    updateStatus, patchOrder, verifyYape, rejectYape, markDeudaPaid,
    adminNote, setAdminNote, savingNote, saveAdminNote,
    showRejectModal, setShowRejectModal, rejectReason, setRejectReason, executeReject,
    confirmDeleteId, setConfirmDeleteId, confirmDelete,
  } = useOrderActions({ orders, setOrders, setDetailOrder, load });

  const { customDriver, setCustomDriver, savingDriver, selectedDriverFilter, setSelectedDriverFilter, saveDeliveryDriver, driverColor } =
    useDeliveryDriver({ patchOrder });

  const { selectedOrderIds, bulkStatusTarget, setBulkStatusTarget, bulkUpdating, toggleOrderSelect, clearOrderSelection, executeBulkStatus } =
    useOrderBulkActions({ onComplete: load });

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  useScrollLock(!!detailOrder || !!confirmDeleteId || showAdvancedFilters || showPrintPreview);

  const activeOrders = pedidosEnMarcha(orders, filters, selectedDriverFilter);
  const archivedOrders = pedidosArchivados(orders);
  const enMarcha = orders.length - archivedOrders.length;
  // El día del negocio es el de Lima: con `toISOString()` el corte caía a las
  // 19:00 hora peruana y lo vendido de noche contaba como «mañana».
  const entregadosHoy = orders.filter((o) => o.status === "entregado" && limaDateKey(o.createdAt) === limaDateKey()).length;
  const resumen = `${enMarcha} en marcha${entregadosHoy > 0 ? ` · ${entregadosHoy} ${entregadosHoy === 1 ? "entregado" : "entregados"} hoy` : ""}`;

  const repartoVisible = vistas.some((v) => v.id === "reparto");
  const tabs = vistas.map((v) => (v.id === "tablero" && enMarcha > 0 ? { ...v, badge: enMarcha } : v));

  return (
    <AdminTabBar
      heading={{
        title: "Pedidos y reparto",
        description:
          "Los pedidos en marcha en tablero o en lista, con sus filtros pegados; el reparto (repartidores en vivo, asignaciones, pagos y ranking) y los entregados y cancelados en Archivados.",
        icon: Package,
        actions: (
          <ModuleActionMenu
            label="Más acciones de pedidos"
            iconOnly
            className="h-12 w-12"
            items={[{ label: "Imprimir", icon: Printer, onClick: () => window.print(), description: "Los pedidos en marcha que se ven" }]}
          />
        ),
      }}
      tabs={tabs}
      activeTab={vista}
      onTabChange={irA}
      moduleId={MODULE_ID}
    >
      <div className="space-y-3 sm:space-y-4">
        {(vista === "tablero" || vista === "lista") && (
          <>
            {loadError && (
              <div role="alert" className="flex items-center gap-2 rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/10">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                <span className="flex-1">{loadError}</span>
                <button
                  type="button"
                  onClick={() => { setLoadError(null); void load(); }}
                  className="h-12 px-2 text-sm font-bold underline"
                >
                  Reintentar
                </button>
              </div>
            )}

            <BarraPedidos
              orders={orders}
              filters={filters}
              dispatch={filtersDispatch}
              repartidor={selectedDriverFilter}
              onRepartidor={setSelectedDriverFilter}
              onAbrirFiltros={() => setShowAdvancedFilters(true)}
              resumen={resumen}
            />

            {vista === "tablero" ? (
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
            ) : (
              <ListaPedidos pedidos={activeOrders} loading={loading} onSelectOrder={setDetailOrder} />
            )}

            <ResumenImpresion pedidos={activeOrders} />
          </>
        )}

        {vista === "archivados" && (
          <OrdersArchive archivedOrders={archivedOrders} onSelectOrder={setDetailOrder} onDeleteOrder={setConfirmDeleteId} />
        )}

        {vista === "reparto" &&
          (repartoVisible ? (
            <Reparto anidado />
          ) : contextoPermiso === null ? (
            <LoadingSpinner className="mx-auto my-16" />
          ) : (
            <EmptyState
              icon={<Truck className="h-10 w-10 text-[var(--text-tertiary)]" />}
              title="El reparto no está en tu plan o en tu rol"
              actions={[]}
            />
          ))}
      </div>

      {showAdvancedFilters && (
        <OrdersFilters
          filters={filters}
          dispatch={filtersDispatch}
          repartidores={repartidoresConPedidos(orders).map((r) => r.value)}
          repartidor={selectedDriverFilter}
          onRepartidor={setSelectedDriverFilter}
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
          onShowRejectModal={(id) => { setShowRejectModal(id); setRejectReason(""); }}
          onCustomDriverChange={setCustomDriver}
          onSaveCustomDriver={saveDeliveryDriver}
          onPatchOrder={patchOrder}
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

      {confirmDeleteId && <DeleteConfirmModal onConfirm={confirmDelete} onCancel={() => setConfirmDeleteId(null)} />}

      {showRejectModal && (
        <RejectModal
          rejectReason={rejectReason}
          onReasonChange={setRejectReason}
          onConfirm={executeReject}
          onCancel={() => setShowRejectModal(null)}
        />
      )}

      {/* La selección sale de las tarjetas del tablero. */}
      {vista === "tablero" && (
        <OrdersBulkActions
          selectedCount={selectedOrderIds.size}
          bulkStatusTarget={bulkStatusTarget}
          bulkUpdating={bulkUpdating}
          onBulkStatusChange={setBulkStatusTarget}
          onExecuteBulkStatus={executeBulkStatus}
          onClearSelection={clearOrderSelection}
          onShowPrint={() => setShowPrintPreview(true)}
        />
      )}
    </AdminTabBar>
  );
}
