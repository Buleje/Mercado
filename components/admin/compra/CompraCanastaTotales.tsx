"use client";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";

import { useMemo, useState } from "react";
import { Bookmark as BookmarkIcon, ClipboardList, FileDown, Loader2, MessageCircle, Users } from "@buleje/design-system/icons";
import { Check as CheckIcon } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { TIPOS_COMPROBANTE, type TipoComprobante } from "@/lib/compras/estados-oc";
import type { PaymentMethod } from "@/lib/types/purchases";
import CompraPlantillas from "./CompraPlantillas";
import { faltaParaOrden, type ConfirmarCompra } from "./use-confirmar-compra";
import type { CompraCarrito } from "./use-compra-carrito";
import type { PlantillasCompra } from "./use-plantillas-compra";

interface Props {
  carrito: CompraCarrito;
  orden: ConfirmarCompra;
  plantillas: PlantillasCompra;
  onPdf: () => void;
  onVenderACliente: () => void;
}

/** Totales, forma de pago, comprobante, notas, plantillas y acciones de la canasta. */
export default function CompraCanastaTotales({ carrito, orden, plantillas, onPdf, onVenderACliente }: Props) {
  const {
    cart, discount, setDiscount, subtotal, discountAmount, igvAmount, total, paymentMethod, setPaymentMethod,
    deliveryDate, setDeliveryDate, notes, setNotes, lastOC, invoiceType, setInvoiceType, invoiceNumber, setInvoiceNumber,
  } = carrito;
  const { processing, planBlockedMsg, confirmarOC, generateWhatsApp, handleSaveDraft } = orden;
  const [showIGV, setShowIGV] = useState(false);
  // Fecha mínima para deliveryDate (evitar recalcular en cada render)
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const falta = faltaParaOrden(carrito);
  const acciones: MenuAccion[] = [
    { id: "whatsapp", label: "Enviar por WhatsApp", hint: "El pedido al proveedor, con el total", icon: MessageCircle, onSelect: generateWhatsApp },
    { id: "pdf", label: "Ver PDF de la orden", icon: FileDown, onSelect: onPdf },
    { id: "borrador", label: "Guardar borrador", icon: BookmarkIcon, onSelect: handleSaveDraft },
    { id: "vender", label: "Vender a un cliente", hint: "Otro flujo: pedido de VENTA con estos productos", icon: Users, onSelect: onVenderACliente },
  ];
  // Canasta vacía: sólo las plantillas. Es justo cuando sirven (antes sólo se
  // veían con productos ya en la canasta, y no había cómo empezar desde una).
  if (cart.length === 0) {
    return (
      <div className="px-4 pb-4">
        <CompraPlantillas plantillas={plantillas} hayItems={false} processing={processing} />
      </div>
    );
  }
  return (
    <div className="p-4 space-y-3 border-t border-[var(--rule-soft)]">
      {/* Descuento */}
      <div className="flex items-center gap-2">
        <label
          htmlFor="poc-discount"
          className="text-xs text-[var(--text-secondary)] shrink-0"
        >
          Descuento %
        </label>
        <input
          id="poc-discount"
          type="number"
          min="0"
          max="100"
          value={discount}
          onChange={(e) =>
            setDiscount(
              Math.min(100, Math.max(0, Number(e.target.value))),
            )
          }
          className="flex-1 px-2 py-1 border border-[var(--rule-base)] rounded-xl text-sm text-right bg-[var(--surface-raised)] text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </div>

      {/* Totales */}
      <div className="space-y-1 text-xs">
        <div className="flex justify-between text-[var(--text-secondary)]">
          <span>Subtotal</span>
          <span className="font-mono">{formatCurrency(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-[var(--data-error-500)]">
            <span>Descuento {discount}%</span>
            <span className="font-mono">
              -{formatCurrency(discountAmount)}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1 text-[var(--text-tertiary)]">
          <button
            type="button"
            onClick={() => setShowIGV((v) => !v)}
            aria-pressed={showIGV}
            className="text-xs underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded"
          >
            IGV 18% incluido
          </button>
          {showIGV && (
            <span className="font-mono ml-auto">
              {formatCurrency(igvAmount)}
            </span>
          )}
        </div>
        <div className="flex justify-between font-bold text-base text-[var(--text-primary)] pt-1 border-t border-[var(--rule-soft)]">
          <span>TOTAL</span>
          <span className="font-mono text-primary">
            {formatCurrency(total)}
          </span>
        </div>
      </div>

      {/* Método de pago */}
      <select
        value={paymentMethod}
        onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
        aria-label="Método de pago"
        className="w-full px-3 py-1.5 border border-[var(--rule-base)] rounded-xl text-sm bg-[var(--surface-raised)] text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <option value="contado">Contado</option>
        <option value="credito_7">Crédito 7 días</option>
        <option value="credito_15">Crédito 15 días</option>
        <option value="credito_30">Crédito 30 días</option>
        <option value="transferencia">Transferencia</option>
      </select>

      {/* Comprobante del proveedor: sin número no hay forma de encontrar la
          compra cuando el contador la pide (0 de 71 órdenes lo tenían). */}
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <select
          value={invoiceType}
          onChange={(e) => setInvoiceType(e.target.value as TipoComprobante)}
          aria-label="Comprobante del proveedor"
          className="px-2 py-1.5 border border-[var(--rule-base)] rounded-xl text-sm bg-[var(--surface-raised)] text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {TIPOS_COMPROBANTE.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <input
          type="text"
          value={invoiceType === "ninguno" ? "" : invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase().slice(0, 60))}
          disabled={invoiceType === "ninguno" || processing}
          placeholder={invoiceType === "ninguno" ? "Sin número" : "F001-00012345"}
          aria-label="Número del comprobante"
          aria-invalid={invoiceType !== "ninguno" && !invoiceNumber.trim()}
          className={cn(
            "min-w-0 px-3 py-1.5 border rounded-xl text-sm font-mono bg-[var(--surface-raised)] dark:bg-[var(--surface-sunken)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] placeholder:font-sans focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50",
            invoiceType !== "ninguno" && !invoiceNumber.trim() ? "border-[var(--data-error-500)]" : "border-[var(--rule-base)]",
          )}
        />
      </div>

      {/* Fecha de entrega */}
      <div>
        <label htmlFor="poc-delivery" className="sr-only">
          Fecha de entrega
        </label>
        <input
          id="poc-delivery"
          type="date"
          value={deliveryDate}
          onChange={(e) => setDeliveryDate(e.target.value)}
          min={todayStr}
          className="w-full px-3 py-1.5 border border-[var(--rule-base)] rounded-xl text-sm bg-[var(--surface-raised)] text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </div>

      {/* Notas */}
      <div>
        <label htmlFor="poc-notes" className="sr-only">
          Notas al proveedor
        </label>
        <textarea
          id="poc-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={processing}
          rows={2}
          placeholder="Notas al proveedor..."
          className="w-full px-3 py-1.5 border border-[var(--rule-base)] rounded-xl text-sm bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {lastOC && (
        <div className="bg-primary/10 rounded-xl p-3 space-y-2">
          <p className="flex items-center gap-1 text-xs font-bold text-[var(--data-success-500)]"><CheckIcon className="h-3.5 w-3.5 shrink-0" aria-hidden /> OC Creada</p>
          <p className="text-xs text-[var(--data-success-500)]">ID: {lastOC.id}</p>
          <p className="text-xs text-[var(--data-success-500)]">{lastOC.items} productos — {formatCurrency(Number(lastOC.total))}</p>
          <button
            type="button"
            onClick={() => {
              // Navegar al tab de Ordenes para ver la OC creada
              const event = new CustomEvent("compras-navigate-tab", { detail: "ordenes-compra" });
              window.dispatchEvent(event);
            }}
            className="w-full text-center text-xs font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)] bg-[var(--accent-soft)] hover:bg-[var(--accent-muted)] rounded-lg py-1.5 transition-colors"
          >
            Ver en Órdenes →
          </button>
        </div>
      )}
      <CompraPlantillas plantillas={plantillas} hayItems={cart.length > 0} processing={processing} />


      {/* Aviso de trial/plan expirado (402 al crear OC) — causa real
          + acción clara, en vez del error genérico. */}
      {planBlockedMsg && (
        <div role="alert" className="mb-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15 p-3">
          <p className="text-xs font-bold text-[var(--data-warning-500)] flex items-center gap-1.5">
            <ClipboardList className="h-3.5 w-3.5 shrink-0" aria-hidden />
            No se pudo crear la orden — plan/prueba vencido
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">{planBlockedMsg}</p>
          <EnlacePanel apariencia="heredada" href="/admin?tab=plan" className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-primary hover:underline">
            Ver planes →
          </EnlacePanel>
        </div>
      )}


      {falta && (
        <p role="status" className="text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {falta}
        </p>
      )}

      {/* La acción principal a la vista; el resto en «Más» (ley de la vista). */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={confirmarOC}
          disabled={processing || cart.length === 0}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 min-h-10 bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {processing ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <ClipboardList aria-hidden="true" className="h-4 w-4" />
          )}
          {processing ? "Creando..." : "Crear orden de compra"}
        </button>
        <ActionMenu label="Más" actions={acciones} disabled={processing} size="md" />
      </div>
    </div>
  );
}
