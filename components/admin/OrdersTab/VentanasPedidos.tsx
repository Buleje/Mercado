"use client";

/**
 * Las ventanas de Pedidos y reparto: el formulario de filtros, el detalle de
 * un pedido (se abre desde Tablero, Lista y Archivados), la vista previa de
 * impresión de los elegidos, borrar y rechazar. Salieron de `index.tsx`
 * (10-10) sin cambiar nada de lo que hacen. 17-10: la revisión y el informe
 * del cambio en lote (P09).
 */
import type { Pedidos } from "./hooks/usePedidos";
import { repartidoresConPedidos } from "./filtrar-pedidos";
import { OrdersDetailPanel } from "./OrdersDetailPanel";
import { OrdersFilters } from "./OrdersFilters";
import { LotePedidosModal } from "./LotePedidosModal";
import { DeleteConfirmModal, RejectModal } from "./OrdersModals";
import { OrdersPrintPreview } from "./OrdersPrintPreview";

export function VentanasPedidos({ p }: { p: Pedidos }) {
  const { datos, acciones: a, reparto: r } = p;
  return (
    <>
      {p.filtrosAbiertos && (
        <OrdersFilters
          filters={p.filters}
          dispatch={p.dispatch}
          repartidores={repartidoresConPedidos(datos.orders).map((x) => x.value)}
          repartidor={r.selectedDriverFilter}
          onRepartidor={r.setSelectedDriverFilter}
          onClose={() => p.setFiltrosAbiertos(false)}
        />
      )}

      {datos.detailOrder && (
        <OrdersDetailPanel
          order={datos.detailOrder}
          adminNote={a.adminNote}
          savingNote={a.savingNote}
          customDriver={r.customDriver}
          savingDriver={r.savingDriver}
          driverColor={r.driverColor}
          onClose={() => datos.setDetailOrder(null)}
          onAdminNoteChange={a.setAdminNote}
          onSaveAdminNote={a.saveAdminNote}
          onVerifyYape={a.verifyYape}
          onRejectYape={a.rejectYape}
          onMarkDeudaPaid={a.markDeudaPaid}
          onShowRejectModal={(id) => {
            a.setShowRejectModal(id);
            a.setRejectReason("");
          }}
          onCustomDriverChange={r.setCustomDriver}
          onSaveCustomDriver={r.saveDeliveryDriver}
          onPatchOrder={a.patchOrder}
        />
      )}

      {p.impresionAbierta && (
        <OrdersPrintPreview
          orders={datos.orders}
          selectedOrderIds={new Set(p.elegidosVisibles)}
          storeName={datos.storeName}
          driverColor={r.driverColor}
          onClose={() => p.setImpresionAbierta(false)}
        />
      )}

      {p.bulk.lote && (
        <LotePedidosModal
          lote={p.bulk.lote}
          onConfirmar={p.bulk.confirmarLote}
          onReintentar={p.bulk.reintentarLote}
          onClose={p.bulk.cerrarLote}
        />
      )}

      {a.confirmDeleteId && (
        <DeleteConfirmModal
          onConfirm={a.confirmDelete}
          onCancel={() => a.setConfirmDeleteId(null)}
        />
      )}

      {a.showRejectModal && (
        <RejectModal
          rejectReason={a.rejectReason}
          onReasonChange={a.setRejectReason}
          onConfirm={a.executeReject}
          onCancel={() => a.setShowRejectModal(null)}
        />
      )}
    </>
  );
}
