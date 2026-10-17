"use client";

/**
 * OrdersDetailPanel — la ventana con el detalle de un pedido (se abre desde el
 * Tablero, la Lista y Archivados; vive en `?pedido=<id>`).
 *
 * De arriba a abajo, por lo que se hace con él:
 *   1. Cabecera: cliente · estado · número · hace cuánto · medio de pago · total
 *   2. Siguiente paso: el botón que lo avanza (Confirmar Yape, En camino…)
 *   3. Productos (y el desglose sólo si hubo descuento o cupón)
 *   4. Contacto y entrega · 5. Despacho · 6. Pago
 *   7. Notas internas y línea de tiempo, plegadas
 *   8. Pie: rechazar y los papeles del pedido
 *
 * 10-10: partido de 757 líneas en `detalle/` y sin cifras repetidas (el total
 * salía dos veces y el medio de pago también). Texto de 14 px y botones de
 * 48 px (antes rótulos de 10 px y el cerrar de 32 px).
 *
 * 17-10: notas y línea de tiempo leen el historial guardado
 * (`useHistorialPedidos`); se relee al cambiar de estado y al guardar una nota.
 */
import { useState } from "react";
import AdminModal from "@/components/admin/shared/AdminModal";
import type { DbOrder } from "@/lib/jsondb";
import { DespachoSection } from "./DespachoSection";
import ManualDeliveryModal from "./ManualDeliveryModal";
import { DetalleCabecera, DetallePasoSiguiente } from "./detalle/DetalleCabecera";
import { DetalleContacto, DetallePago } from "./detalle/DetalleContactoYPago";
import { DetalleLineaDeTiempo, DetalleNotas } from "./detalle/DetalleNotasYTiempo";
import { DetallePie } from "./detalle/DetallePie";
import { DetalleProductos } from "./detalle/DetalleProductos";
import { useHistorialPedidos } from "./hooks/useHistorialPedidos";

interface OrdersDetailPanelProps {
  order: DbOrder;
  adminNote: string;
  savingNote: boolean;
  customDriver: string;
  savingDriver: boolean;
  driverColor: (name: string) => string;
  onClose: () => void;
  onAdminNoteChange: (v: string) => void;
  /** true si se guardó (entonces se relee el historial). */
  onSaveAdminNote: (orderId: string) => Promise<boolean>;
  onVerifyYape: (id: string) => void;
  onRejectYape: (id: string) => void;
  onMarkDeudaPaid: (id: string) => void;
  onShowRejectModal: (id: string) => void;
  onCustomDriverChange: (v: string) => void;
  onSaveCustomDriver: (orderId: string) => void;
  onPatchOrder: (id: string, patch: Partial<DbOrder>) => void;
}

export function OrdersDetailPanel({
  order,
  adminNote,
  savingNote,
  customDriver,
  savingDriver,
  driverColor,
  onClose,
  onAdminNoteChange,
  onSaveAdminNote,
  onVerifyYape,
  onRejectYape,
  onMarkDeudaPaid,
  onShowRejectModal,
  onCustomDriverChange,
  onSaveCustomDriver,
  onPatchOrder,
}: OrdersDetailPanelProps) {
  const ids = [order.id];
  const h = useHistorialPedidos(ids, `${order.status}|${order.updatedAt}`);
  const eventos = h.historial[order.id] ?? [];
  const notas = eventos.filter((e) => e.tipo === "nota");
  const cambios = eventos.filter((e) => e.tipo === "estado");
  const guardarNota = (orderId: string) => {
    void onSaveAdminNote(orderId).then((ok) => {
      if (ok) h.recargar();
    });
  };
  // FIX 2026-05-07: «Entregado sin reparto» pide método y nota antes de marcar
  // entregado. Persiste en OrderStatusHistory.note para auditoría.
  const [manualOpen, setManualOpen] = useState(false);
  const handleManualConfirm = (deliveryReason: string) => {
    setManualOpen(false);
    onPatchOrder(order.id, {
      status: "entregado",
      // deliveryReason no es columna de DbOrder; el server lo extrae y persiste
      // en OrderStatusHistory.note. El cast preserva el tipo abierto.
      ...({ deliveryReason } as unknown as Partial<DbOrder>),
    });
  };

  // Foco, Escape y clic afuera los pone el AdminModal; con «Entregado sin
  // reparto» encima, Escape cierra sólo esa (Radix apila las dos).

  return (
    <>
      <AdminModal
        open
        onClose={onClose}
        hideCloseButton
        size="lg"
        claveVentana="pedido-detalle"
        footerBare
        footer={<DetallePie order={order} onRechazar={onShowRejectModal} />}
      >
        <div className="sticky top-0 z-10">
          <DetalleCabecera order={order} onClose={onClose} />
          <DetallePasoSiguiente
            order={order}
            onVerifyYape={onVerifyYape}
            onRejectYape={onRejectYape}
            onPatchOrder={onPatchOrder}
            onEntregaManual={() => setManualOpen(true)}
          />
        </div>

        <div className="space-y-4 bg-[var(--surface-canvas)] px-5 py-4 sm:px-6">
          <DetalleProductos order={order} />
          <DetalleContacto order={order} />
          <DespachoSection
            order={order}
            customDriver={customDriver}
            savingDriver={savingDriver}
            driverColor={driverColor}
            onCustomDriverChange={onCustomDriverChange}
            onSaveCustomDriver={onSaveCustomDriver}
            onPatchOrder={onPatchOrder}
          />
          <DetallePago order={order} onMarkDeudaPaid={onMarkDeudaPaid} />
          <DetalleNotas
            orderId={order.id}
            notas={notas}
            errorAlLeer={h.error}
            nota={adminNote}
            guardando={savingNote}
            onNota={onAdminNoteChange}
            onGuardar={guardarNota}
          />
          <DetalleLineaDeTiempo order={order} cambios={cambios} cargando={h.cargando} />
        </div>
      </AdminModal>
      <ManualDeliveryModal
        open={manualOpen}
        customerName={order.customer.name}
        onConfirm={handleManualConfirm}
        onCancel={() => setManualOpen(false)}
      />
    </>
  );
}
