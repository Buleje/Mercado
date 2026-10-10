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
 */
import { useEffect, useRef, useState } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import type { DbOrder } from "@/lib/jsondb";
import { DespachoSection } from "./DespachoSection";
import ManualDeliveryModal from "./ManualDeliveryModal";
import { DetalleCabecera, DetallePasoSiguiente } from "./detalle/DetalleCabecera";
import { DetalleContacto, DetallePago } from "./detalle/DetalleContactoYPago";
import { DetalleLineaDeTiempo, DetalleNotas } from "./detalle/DetalleNotasYTiempo";
import { DetallePie } from "./detalle/DetallePie";
import { DetalleProductos } from "./detalle/DetalleProductos";

interface OrdersDetailPanelProps {
  order: DbOrder;
  adminNote: string;
  savingNote: boolean;
  customDriver: string;
  savingDriver: boolean;
  driverColor: (name: string) => string;
  onClose: () => void;
  onAdminNoteChange: (v: string) => void;
  onSaveAdminNote: (orderId: string) => void;
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
  /* Sin esto Tab se va a la pantalla de abajo y Escape no cierra. */
  const cajaRef = useRef<HTMLDivElement>(null);
  /* Escape ya lo maneja el atajo propio de esta pantalla: el hook pone
       el foco, la trampa de Tab y el scroll, no una segunda salida. */
  useModalAccesible(cajaRef, { onCerrar: onClose, cerrarConEscape: false });
  const adminNotes = (order as DbOrder & { adminNotes?: string }).adminNotes;
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

  // a11y/UX (Brandon 2026-06-04): foco entra al panel al abrir + Escape cierra.
  // No cierra si el sub-modal de entrega manual está encima.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.focus();
  }, []);
  const ventana = useVentanaDeModal(true, {
    ref: panelRef,
    aplicarTranslate: true,
    claveMemoria: "pedido-detalle",
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !manualOpen) {
        // Con el modal abierto, Escape cierra SOLO el modal: no dispara los
        // atajos globales del admin ni el tour (escuchan en window, después).
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, manualOpen]);

  return (
    <div
      ref={cajaRef}
      tabIndex={-1}
      className="fixed inset-0 z-modal flex items-start sm:items-center justify-center p-3 sm:p-6 bg-black/55 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-[var(--dur-fast)]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !ventana.fijado) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {/* El diálogo es el PANEL, no el velo: es lo que se mueve como ventana. */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle del pedido de ${order.customer.name}`}
        className="relative w-full max-w-3xl bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-3xl shadow-[var(--shadow-xl)] flex flex-col max-h-[calc(100vh-3rem)] overflow-hidden focus:outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DetalleCabecera order={order} ventana={ventana} onClose={onClose} />
        <DetallePasoSiguiente
          order={order}
          onVerifyYape={onVerifyYape}
          onRejectYape={onRejectYape}
          onPatchOrder={onPatchOrder}
          onEntregaManual={() => setManualOpen(true)}
        />

        <div className="flex-1 space-y-4 overflow-y-auto bg-[var(--surface-canvas)] px-5 py-4">
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
            notasGuardadas={adminNotes}
            nota={adminNote}
            guardando={savingNote}
            onNota={onAdminNoteChange}
            onGuardar={onSaveAdminNote}
          />
          <DetalleLineaDeTiempo order={order} />
        </div>

        <DetallePie order={order} onRechazar={onShowRejectModal} />
        <TiradorDeVentana ventana={ventana} />
      </div>
      <ManualDeliveryModal
        open={manualOpen}
        customerName={order.customer.name}
        onConfirm={handleManualConfirm}
        onCancel={() => setManualOpen(false)}
      />
    </div>
  );
}
