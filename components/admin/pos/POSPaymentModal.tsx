"use client";

import { useState, useEffect } from "react";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Banknote } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import { fmt, type POSPaymentModalProps } from "@/components/admin/pos/pago/pago-shared";
import { usePagoModal } from "@/components/admin/pos/pago/usePagoModal";
import PagoListaClientes from "@/components/admin/pos/pago/PagoListaClientes";
import PagoCabecera from "@/components/admin/pos/pago/PagoCabecera";
import PagoDescuento from "@/components/admin/pos/pago/PagoDescuento";
import PagoLineas from "@/components/admin/pos/pago/PagoLineas";
import PagoVuelto from "@/components/admin/pos/pago/PagoVuelto";
import PagoCliente from "@/components/admin/pos/pago/PagoCliente";
import PagoComprobante from "@/components/admin/pos/pago/PagoComprobante";
import PagoPie from "@/components/admin/pos/pago/PagoPie";
import PagoQRGrande from "@/components/admin/pos/pago/PagoQRGrande";

// Los tipos viven en pago/pago-shared; se re-exportan aquí porque el resto del POS los importa de este archivo.
export type { PaymentLine, PaymentLineMethod, ComprobanteTipo, PaymentResult } from "@/components/admin/pos/pago/pago-shared";

/**
 * Modal de cobro del POS. Partido el 09-10 (1.422 líneas → este orquestador): el estado vive en
 * pago/usePagoModal y cada bloque en pago/Pago*.tsx.
 */
export default function POSPaymentModal(props: POSPaymentModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const p = usePagoModal(props);
  const { onCancel, processing, setCustomerPhone, setCustomerName, showCustomerList, setShowCustomerList, pendiente, vuelto } = p;

  if (!mounted) return null;

  return (
    <AdminModal
      open
      onClose={() => { if (!processing) onCancel(); }}
      variant="pos"
      hideCloseButton
    >
      <div className="relative flex flex-col h-full bg-linear-to-br from-[var(--surface-sunken)] to-[var(--surface-raised)] dark:from-[var(--surface-sunken)] dark:to-[var(--surface-raised)]">
        {/* Customer list overlay */}
        {showCustomerList && (
          <PagoListaClientes
            onSelect={(phone, name) => {
              setCustomerPhone(phone);
              setCustomerName(name);
            }}
            onClose={() => setShowCustomerList(false)}
          />
        )}

        {/*
          Brandon 2026-05-17 — Header hero neutro del proyecto Buleje
          (independiente del brand naranja del tenant mi-pollo).
          Fondo surface elegante + primary teal para el acento + glow
          radial sutil del primary. Total display gigante intacto.
        */}
        <PagoCabecera p={p} />


        {/*
          v3 body: cada columna es un CARD elegante (rounded-2xl + shadow)
          con header de sección (icono circular + título). Cards separados
          por gap-4. Padding interno generoso.

          Col 1 (lg:5) — 💳 Pago
          Col 2 (lg:3) — 👤 Cliente
          Col 3 (lg:4) — 🧾 Comprobante
        */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 sm:px-5 py-4 grid grid-cols-1 lg:grid-cols-12 gap-4">

            {/* COL 1 — Card Pago */}
            <div className="lg:col-span-5 min-w-0 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--rule-soft)] flex items-center gap-2.5">
                <span className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  <Banknote className="h-4 w-4" />
                </span>
                <Kicker as="h3" className="libro-kicker">Pago</Kicker>
              </div>
              <div className="px-4 py-3 space-y-3 min-w-0">

          <PagoDescuento p={p} />

          <PagoLineas p={p} />

          <PagoVuelto vuelto={vuelto} />

          {/* Pendiente warning */}
          {pendiente > 0.01 && (
            <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30 rounded-lg p-3 text-center">
              <span className="text-sm font-bold text-[var(--data-warning-ink)]">
                Falta: {fmt(pendiente)}
              </span>
            </div>
          )}

              </div>{/* fin contenido card Pago */}
            </div>{/* fin Card Pago */}

            <PagoCliente p={p} />

            <PagoComprobante p={p} />
          </div>{/* fin grid 12 cols */}
        </div>{/* fin body scroll */}

        {/*
          Footer premium: shadow superior + gradient sutil + CTA con
          glow accent. Botón Confirmar imponente con icon grande +
          monto destacado.
        */}
        <PagoPie p={p} />

        <PagoQRGrande p={p} />
      </div>
    </AdminModal>
  );
}
