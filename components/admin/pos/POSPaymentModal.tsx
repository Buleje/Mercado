"use client";

import { useState, useEffect } from "react";
import AdminModal from "@/components/admin/shared/AdminModal";
import type { POSPaymentModalProps } from "@/components/admin/pos/pago/pago-shared";
import { usePagoModal } from "@/components/admin/pos/pago/usePagoModal";
import { useAtajosDelCobro } from "@/components/admin/pos/pago/useAtajosDelCobro";
import PagoListaClientes from "@/components/admin/pos/pago/PagoListaClientes";
import PagoCabecera from "@/components/admin/pos/pago/PagoCabecera";
import PagoTotal from "@/components/admin/pos/pago/PagoTotal";
import PagoDescuento from "@/components/admin/pos/pago/PagoDescuento";
import PagoLineas from "@/components/admin/pos/pago/PagoLineas";
import PagoCliente from "@/components/admin/pos/pago/PagoCliente";
import PagoComprobante from "@/components/admin/pos/pago/PagoComprobante";
import PagoPie from "@/components/admin/pos/pago/PagoPie";
import PagoQRGrande from "@/components/admin/pos/pago/PagoQRGrande";

// Los tipos viven en pago/pago-shared; se re-exportan aquí porque el resto del POS los importa de este archivo.
export type { PaymentLine, PaymentLineMethod, ComprobanteTipo, PaymentResult } from "@/components/admin/pos/pago/pago-shared";

/**
 * Modal de cobro del POS. El estado vive en pago/usePagoModal (sin cambios);
 * acá sólo se reparte en dos zonas (17-10):
 *
 * - **Cómo paga** (izquierda, ≈60 %): método en una fila, lo recibido y el
 *   vuelto grande, siempre a la vista.
 * - **La venta** (derecha, ≈40 %): el total UNA vez, descuento, cliente y
 *   comprobante.
 *
 * El pie va por la prop `footer` de AdminModal, FUERA del scroll: en celular
 * «Cobrar» queda fijo abajo. En celular el total queda pegado bajo la cabecera.
 */
export default function POSPaymentModal(props: POSPaymentModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const p = usePagoModal(props);
  useAtajosDelCobro(p);
  const { onCancel, processing, setCustomerPhone, setCustomerName, showCustomerList, setShowCustomerList } = p;

  if (!mounted) return null;

  return (
    <AdminModal
      open
      onClose={() => {
        if (!processing) onCancel();
      }}
      variant="pos"
      hideCloseButton
      footer={<PagoPie p={p} />}
      footerBare
    >
      {/* Alto estable en escritorio: tipear lo recibido o cambiar de método no hace saltar la ventana. */}
      <div className="relative flex min-h-full flex-col bg-[var(--surface-raised)] md:min-h-[min(36rem,calc(92vh-5.5rem))]">
        <PagoCabecera p={p} />

        <div className="grid flex-1 grid-cols-1 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:grid-rows-[auto_1fr]">
          <PagoTotal
            p={p}
            articulos={props.cartItems}
            className="border-[var(--rule-soft)] bg-[var(--surface-raised)] max-md:sticky max-md:top-14 max-md:z-10 max-md:border-b md:col-start-2 md:row-start-1 md:border-l md:bg-[var(--surface-sunken)]"
          />

          <section aria-label="Cómo paga" className="min-w-0 px-4 py-4 sm:px-5 md:col-start-1 md:row-span-2 md:row-start-1">
            <PagoLineas p={p} />
          </section>

          <section
            aria-label="La venta"
            className="min-w-0 space-y-4 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-4 sm:px-5 md:col-start-2 md:row-start-2 md:border-l md:border-t-0"
          >
            <PagoDescuento p={p} />
            <PagoCliente p={p} />
            <PagoComprobante p={p} />
          </section>
        </div>

        {/* Después de la grilla: misma capa que el total pegado, pinta encima. */}
        {showCustomerList && (
          <PagoListaClientes
            onSelect={(phone, name) => {
              setCustomerPhone(phone);
              setCustomerName(name);
            }}
            onClose={() => setShowCustomerList(false)}
          />
        )}

        <PagoQRGrande p={p} />
      </div>
    </AdminModal>
  );
}
