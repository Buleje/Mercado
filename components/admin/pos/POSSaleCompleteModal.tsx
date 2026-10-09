"use client";

import { toast } from "sonner";
import { useState } from "react";
import { Banknote, X, Check, Receipt, Printer, MessageCircle, Send, Smartphone, CreditCard, HandCoins } from "@buleje/design-system/icons";
import { m } from "@/components/admin/providers";
import { isThermalPrintSupported, printThermal } from "@/lib/thermal-printer";
import { formatCurrency, formatDateNumeric, formatTime } from "@/lib/format";
import { fmt, type CartItem } from "@/components/admin/pos/pos-shared";
import { SaleConfetti, useCountUp } from "@/components/admin/pos/POSSaleConfetti";
import QuickAbonoFromSale from "@/components/admin/pos/POSQuickAbono";

// ── Sale Complete Modal (Mejora 4: WhatsApp mejorado + Mejora 1: animaciones) ──

export default function SaleCompleteModal({
  saleComplete,
  lastSaleDetails,
  cartTotal,
  paymentMethod,
  cart,
  onNewSale,
  onClose,
}: {
  saleComplete: { id: string; change: number };
  lastSaleDetails: {
    items: { name: string; quantity: number; price: number }[];
    total: number;
    payment: string;
    customerPhone?: string;
    customerName?: string;
    discountAmount?: number;
    comprobanteTipo?: string;
    comprobanteNumero?: string;
  } | null;
  cartTotal: number;
  paymentMethod: string;
  cart: CartItem[];
  onNewSale: () => void;
  onClose: () => void;
}) {
  const [manualPhone, setManualPhone] = useState("");
  const displayTotal = lastSaleDetails?.total ?? cartTotal;
  // Fix 2026-07-08 (reporte ventas-caja): el count-up 0→total tardaba 1000ms →
  // un vistazo/captura al abrir el modal "¡Venta completada!" podía leer un
  // monto intermedio (ej. S/4.84 en una venta de S/50). Lo acortamos a 550ms:
  // sigue siendo un "pop" celebratorio pero se estabiliza casi al instante.
  const animatedTotal = useCountUp(displayTotal, 550);

  function buildWhatsAppUrl(phone: string) {
    const now = new Date();
    const dateStr = formatDateNumeric(now);
    const timeStr = formatTime(now);

    const details = lastSaleDetails;
    const items = details?.items || cart.map(i => ({ name: i.product.name, quantity: i.quantity, price: i.product.price }));
    const total = details?.total || cartTotal;
    const payment = details?.payment || paymentMethod;
    const discount = details?.discountAmount;
    const comprobante = details?.comprobanteTipo || "ticket";

    const comprobanteLabel = comprobante === "boleta" ? "Boleta"
      : comprobante === "factura" ? "Factura"
      : comprobante === "cotizacion" ? "Cotización"
      : comprobante === "proforma" ? "Proforma"
      : "Ticket";
    const comprobanteNum = details?.comprobanteNumero;

    const itemsText = items
      .map(i => `  ${i.name} x${i.quantity} — ${formatCurrency(i.price * i.quantity)}`)
      .join("\n");

    const lines = [
      `🧾 *${comprobanteLabel} Buleje*`,
      ...(comprobanteNum ? [`📋 N° ${comprobanteNum}`] : []),
      `📅 ${dateStr} ${timeStr}`,
      `─────────`,
      itemsText,
      `─────────`,
      `💰 *Total: ${formatCurrency(total)}*`,
    ];

    if (discount && discount > 0) {
      lines.push(`🏷 Descuento: -${formatCurrency(discount)}`);
    }

    lines.push(
      `💳 Pagado con: ${payment}`,
      `─────────`,
      `¡Gracias por su compra! 😊`,
      `Buleje — Pucallpa`
    );

    const text = lines.join("\n");
    const cleanPhone = phone.replace(/\D/g, "");
    const fullPhone = cleanPhone.startsWith("51") ? cleanPhone : "51" + cleanPhone;
    return `https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`;
  }

  const hasCustomerPhone = lastSaleDetails?.customerPhone;
  const customerName = lastSaleDetails?.customerName;

  // Payment method → icono Lucide (no emojis). Consistente con el design system.
  const method = (lastSaleDetails?.payment || paymentMethod || "efectivo").toLowerCase();
  const MethodIcon: Record<string, typeof Banknote> = {
    efectivo: Banknote,
    yape: Smartphone,
    plin: Smartphone,
    tarjeta: CreditCard,
    mixto: HandCoins,
    fiado: HandCoins,
  };
  const PayIcon = MethodIcon[method] ?? Banknote;

  const comprobanteLabel = (t?: string) =>
    t === "boleta" ? "Boleta"
    : t === "factura" ? "Factura"
    : t === "cotizacion" ? "Cotización"
    : t === "proforma" ? "Proforma"
    : "Ticket";

  return (
    <div className="modal-backdrop p-4">
      <div className="bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] ring-1 ring-[var(--rule-base)] max-w-md w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-[var(--dur-fast)]">
        {/* Header — success + titulo + total */}
        <div className="px-6 pt-8 pb-6 text-center relative overflow-hidden">
          <SaleConfetti />

          {/* Boton cerrar (X) */}
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute top-4 right-4 z-30 p-2 rounded-xl hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <X className="h-5 w-5 text-[var(--text-tertiary)] dark:text-muted" />
          </button>

          <m.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="h-20 w-20 rounded-full bg-primary/10 dark:bg-primary/15 flex items-center justify-center mx-auto mb-4 relative z-20"
          >
            <Check className="h-10 w-10 text-[var(--data-success-500)]" strokeWidth={3} />
          </m.div>
          <m.h3
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-2xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-4"
          >
            ¡Venta completada!
          </m.h3>
          <m.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="text-4xl sm:text-5xl font-extrabold text-primary tabular-nums"
          >
            {fmt(animatedTotal)}
          </m.p>
          <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-soft)]">
            <PayIcon className="h-4 w-4 text-[var(--text-secondary)]" />
            <span className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted">
              Pagado con <span className="capitalize">{method}</span>
            </span>
          </div>
        </div>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-4">
          {saleComplete.change === -1 ? (
            <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)]/30 rounded-xl p-4 text-center">
              <p className="text-sm font-semibold text-[var(--data-warning-500)] uppercase tracking-wide mb-1">Venta al fiado</p>
              <p className="text-base text-[var(--data-warning-500)]">El cliente queda debiendo</p>
            </div>
          ) : saleComplete.change > 0 ? (
            <div className="bg-primary/10 dark:bg-primary/15 border border-[var(--data-success-500)]/30 rounded-xl p-5 text-center">
              <p className="text-sm font-semibold text-[var(--data-success-500)] uppercase tracking-wide mb-1">Dar de vuelto</p>
              <p className="text-4xl font-extrabold text-[var(--data-success-500)] tabular-nums">{fmt(saleComplete.change)}</p>
            </div>
          ) : null}

          {lastSaleDetails?.comprobanteNumero ? (
            <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Receipt className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Comprobante</p>
                <p className="text-base font-mono font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                  {comprobanteLabel(lastSaleDetails.comprobanteTipo)} #{lastSaleDetails.comprobanteNumero}
                </p>
              </div>
            </div>
          ) : null}

          <QuickAbonoFromSale customerPhone={lastSaleDetails?.customerPhone} customerName={lastSaleDetails?.customerName} />

          <div className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] pt-4">
            <p className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted mb-3">
              Enviar por WhatsApp
            </p>
            {hasCustomerPhone ? (
              <a
                href={buildWhatsAppUrl(hasCustomerPhone)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 rounded-xl bg-[var(--accent-dark)] hover:brightness-110 text-white font-semibold text-base transition-colors flex items-center justify-center gap-2"
              >
                <MessageCircle className="h-5 w-5" />
                <span className="truncate">Enviar a {customerName || hasCustomerPhone}</span>
              </a>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-sm font-semibold">+51</span>
                  <input
                    type="tel"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value.replace(/\D/g, "").slice(0, 9))}
                    placeholder="Número del cliente"
                    className="w-full pl-12 pr-3 h-11 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-base text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                {manualPhone.length >= 9 ? (
                  <a
                    href={buildWhatsAppUrl(manualPhone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-5 py-3 rounded-xl bg-[var(--accent-dark)] text-white font-semibold text-base hover:brightness-110 transition-colors flex items-center gap-2 shrink-0"
                  >
                    <Send className="h-4 w-4" />
                    Enviar
                  </a>
                ) : (
                  <button
                    disabled
                    className="px-5 py-3 rounded-xl bg-[var(--surface-sunken)] dark:bg-[var(--surface-sunken)] text-[var(--text-tertiary)] font-semibold text-base cursor-not-allowed flex items-center gap-2 shrink-0"
                  >
                    <Send className="h-4 w-4" />
                    Enviar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer — acciones principales */}
        <div className="px-6 py-5 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] dark:bg-surface/30 space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <a
              href={`/venta/${saleComplete.id}/recibo`}
              target="_blank"
              rel="noopener noreferrer"
              className="py-3 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] font-semibold text-base hover:bg-[var(--surface-sunken)] transition-colors flex items-center justify-center gap-2"
            >
              <Printer className="h-5 w-5" />
              Imprimir
            </a>
            <button
              onClick={onNewSale}
              className="min-h-11 rounded-xl bg-primary text-white font-semibold text-base hover:bg-primary-dark transition-colors flex items-center justify-center gap-2"
            >
              Nueva venta
              <span aria-hidden>&rarr;</span>
            </button>
          </div>
          {isThermalPrintSupported() && (
            <button
              onClick={async () => {
                try {
                  await printThermal({
                    businessName: "Buleje",
                    ticketId: saleComplete.id,
                    date: new Date(),
                    items: cart.map(i => ({ name: i.product.name, quantity: i.quantity, price: i.product.price, unit: i.product.unit })),
                    total: cartTotal,
                    payment: paymentMethod,
                    amountPaid: cartTotal,
                    change: saleComplete.change >= 0 ? saleComplete.change : undefined,
                  });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Error al imprimir");
                }
              }}
              className="w-full py-2.5 rounded-xl text-[var(--text-secondary)] dark:text-muted font-semibold text-sm hover:bg-[var(--surface-sunken)] transition-colors flex items-center justify-center gap-2"
            >
              <Printer className="h-4 w-4" /> Ticket térmico (ESC/POS)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
