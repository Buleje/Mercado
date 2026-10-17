"use client";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";

import { useMemo } from "react";
import { Bookmark as BookmarkIcon, ClipboardList, FileDown, Loader2, MessageCircle, Users } from "@buleje/design-system/icons";
import { Check as CheckIcon } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { TIPOS_COMPROBANTE, type TipoComprobante } from "@/lib/compras/estados-oc";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import CompraCondicionPago from "./CompraCondicionPago";
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
    cart, discount, setDiscount, subtotal, discountAmount, desglose, total, paymentMethod, setPaymentMethod,
    deliveryDate, setDeliveryDate, notes, setNotes, lastOC, invoiceType, setInvoiceType, invoiceNumber, setInvoiceNumber,
  } = carrito;
  const { processing, planBlockedMsg, confirmarOC, generateWhatsApp, handleSaveDraft } = orden;
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

      {/* Totales (C04): el costo ya incluye el IGV (ADR-377), así que se
          desglosa —base + IGV (+ lo exonerado) = total— en vez de esconderlo tras un botón. */}
      <dl className="space-y-1 text-xs">
        {discountAmount > 0 && (
          <>
            <div className="flex justify-between text-[var(--text-secondary)]">
              <dt>Subtotal</dt>
              <dd className="font-mono">{formatCurrency(subtotal)}</dd>
            </div>
            <div className="flex justify-between text-[var(--data-error-500)]">
              <dt>{discount > 0 ? `Descuento ${discount}%` : "Promoción"}</dt>
              <dd className="font-mono">-{formatCurrency(discountAmount)}</dd>
            </div>
          </>
        )}
        <div className="flex justify-between text-[var(--text-secondary)]">
          <dt>Base imponible</dt>
          <dd className="font-mono">{formatCurrency(desglose.base)}</dd>
        </div>
        <div className="flex justify-between text-[var(--text-secondary)]">
          <dt>IGV 18 % (incluido)</dt>
          <dd className="font-mono">{formatCurrency(desglose.igv)}</dd>
        </div>
        {desglose.noGravado > 0.004 && (
          <div className="flex justify-between text-[var(--text-secondary)]">
            <dt>Exonerado o inafecto</dt>
            <dd className="font-mono">{formatCurrency(desglose.noGravado)}</dd>
          </div>
        )}
        <div className="flex justify-between font-bold text-base text-[var(--text-primary)] pt-1 border-t border-[var(--rule-soft)]">
          <dt>TOTAL</dt>
          <dd className="font-mono text-primary">{formatCurrency(total)}</dd>
        </div>
      </dl>

      <CompraCondicionPago value={paymentMethod} onChange={setPaymentMethod} disabled={processing} />

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
        <div role="status" className="bg-primary/10 rounded-xl p-3 space-y-1.5">
          <p className="flex items-center gap-1 text-xs font-bold text-[var(--data-success-ink)]"><CheckIcon className="h-3.5 w-3.5 shrink-0" aria-hidden /> Orden creada a {lastOC.proveedor}</p>
          <p className="text-xs text-[var(--text-secondary)]">{lastOC.items} productos — {formatCurrency(Number(lastOC.total))}</p>
          <p className="text-xs text-[var(--text-secondary)]">
            Siguiente: cuando llegue la mercadería, recíbela en Órdenes (ahí sube el stock).
            {lastOC.credito ? " La deuda ya está en Por pagar." : ""}
          </p>
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
        <div className="shrink-0"><ActionMenu label="Más" soloIcono actions={acciones} disabled={processing} size="md" /></div>
        <InfoTip
          title="Orden, recepción y pago"
          side="top"
          what="Crear la orden sólo deja el pedido anotado para el proveedor: no mueve el stock ni registra un pago."
          affects="El stock sube cuando la recibes en Órdenes › Recibir. Al contado pagas al recibir; a crédito queda una cuenta en Por pagar y ahí registras el pago."
          example="Pides 21 tornillos a crédito 15 días: hoy se crea la orden y la cuenta; el día que llegan los recibes (stock +21) y al pagar eliges transferencia o efectivo."
          className="self-center"
        />
      </div>
    </div>
  );
}
