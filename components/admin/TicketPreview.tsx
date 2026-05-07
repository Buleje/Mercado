"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useCallback } from "react";
import Image from "next/image";
import { X, Printer, MessageCircle, Banknote, Smartphone, CreditCard } from "@buleje/design-system/icons";

// ── Types ────────────────────────────────────────────────────────────────────

type TicketItem = {
  name: string;
  qty: number;
  price: number;
};

type PaymentLineDetail = {
  method: string;
  amount: number;
};

type TicketData = {
  ticketNumber: string;
  boletaNumber?: string;
  fecha: string;
  items: TicketItem[];
  subtotal: number;
  igv: number;
  total: number;
  paymentMethod: string;
  paymentDetails?: PaymentLineDetail[];
  customerName?: string;
  customerPhone?: string;
  cashierName?: string;
};

type BusinessInfo = {
  name: string;
  ruc?: string;
  dni?: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
  yapePhone?: string;
  footerMessage?: string;
};

type Props = {
  ticket: TicketData;
  business: BusinessInfo;
  onClose: () => void;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toFixed(2)}`;
}

function paymentIcon(method: string) {
  const m = method.toLowerCase();
  if (m === "efectivo") return <Banknote className="h-3 w-3 inline" />;
  if (m === "yape" || m === "plin") return <Smartphone className="h-3 w-3 inline" />;
  if (m === "tarjeta") return <CreditCard className="h-3 w-3 inline" />;
  return null;
}

function buildWhatsAppText(ticket: TicketData, business: BusinessInfo): string {
  const lines: string[] = [];
  lines.push(`*${business.name}*`);
  if (business.ruc) lines.push(`RUC: ${business.ruc}`);
  if (business.dni) lines.push(`DNI: ${business.dni}`);
  if (ticket.boletaNumber) lines.push(`Boleta: ${ticket.boletaNumber}`);
  lines.push(`Ticket: ${ticket.ticketNumber}`);
  lines.push(`Fecha: ${ticket.fecha}`);
  if (ticket.cashierName) lines.push(`Cajero: ${ticket.cashierName}`);
  lines.push("─────────────────");
  lines.push("*Detalle:*");
  for (const item of ticket.items) {
    lines.push(
      `  ${item.qty}x ${item.name} - ${fmt(item.price * item.qty)}`
    );
  }
  lines.push("─────────────────");
  lines.push(`   Subtotal: ${fmt(ticket.subtotal)}`);
  lines.push(`   IGV (18%): ${fmt(ticket.igv)}`);
  lines.push(`*TOTAL: ${fmt(ticket.total)}*`);
  lines.push("");
  if (ticket.paymentMethod === "MIXTO" && ticket.paymentDetails) {
    lines.push("*Pago mixto:*");
    for (const pd of ticket.paymentDetails) {
      lines.push(`  ${pd.method}: ${fmt(pd.amount)}`);
    }
  } else {
    lines.push(`Pago: ${ticket.paymentMethod}`);
  }
  lines.push("");
  lines.push(
    business.footerMessage ??
      `Gracias por su preferencia! Vuelva pronto`
  );
  lines.push(`${business.name}`);
  return lines.join("\n");
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TicketPreview({ ticket, business, onClose }: Props) {
  const [sending, setSending] = useState(false);
  const [ticketWidth, setTicketWidth] = useState<"80mm" | "58mm">("80mm");

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleWhatsApp = () => {
    setSending(true);
    const text = encodeURIComponent(buildWhatsAppText(ticket, business));
    const phone = ticket.customerPhone?.replace(/\D/g, "") ?? "";
    const url = phone
      ? `https://wa.me/${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, "_blank");
    setTimeout(() => setSending(false), 1000);
  };

  const qrUrl = business.yapePhone
    ? `https://chart.googleapis.com/chart?chs=150x150&cht=qr&chl=${encodeURIComponent(business.yapePhone)}&choe=UTF-8`
    : null;

  return (
    <>
      {/* Print-only styles — optimized for thermal printers (58mm / 80mm) */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .ticket-container, .ticket-container * { visibility: visible !important; }
          .ticket-container {
            position: absolute; left: 0; top: 0;
            width: ${ticketWidth};
            max-width: ${ticketWidth};
            margin: 0; padding: 2mm;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            line-height: 1.3;
            background: white;
            z-index: 99999;
          }
          .ticket-container * {
            font-size: 11px !important;
            color: black !important;
          }
          .ticket-container h2 { font-size: 13px !important; }
          .ticket-separator { border: none; border-top: 1px dashed #000; margin: 3mm 0; }
          .ticket-items { width: 100%; font-size: 10px; }
          .ticket-items td { padding: 1px 0; }
          .ticket-total { font-size: 14px !important; font-weight: bold; text-align: center; margin: 3mm 0; }
          .no-print { display: none !important; }
          @page { size: ${ticketWidth} auto; margin: 0; }
        }
      `}</style>

      {/* Modal overlay */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 no-print">
        <div className="bg-white dark:bg-card rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
          {/* Close button + width toggle */}
          <div className="flex justify-between items-center p-4 border-b border-[var(--rule-soft)] dark:border-card-border no-print">
            <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground">
              Vista previa del ticket
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* Ticket width toggle */}
              <div className="flex bg-gray-100 dark:bg-accent rounded-lg p-0.5">
                <button
                  onClick={() => setTicketWidth("58mm")}
                  className={`px-2 py-1 rounded-md text-[length:var(--ts-2xs)] font-bold transition-colors ${
                    ticketWidth === "58mm"
                      ? "bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground "
                      : "text-[var(--text-secondary)] dark:text-muted"
                  }`}
                >
                  58mm
                </button>
                <button
                  onClick={() => setTicketWidth("80mm")}
                  className={`px-2 py-1 rounded-md text-[length:var(--ts-2xs)] font-bold transition-colors ${
                    ticketWidth === "80mm"
                      ? "bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground "
                      : "text-[var(--text-secondary)] dark:text-muted"
                  }`}
                >
                  80mm
                </button>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface transition-colors"
              >
                <X className="h-5 w-5 text-[var(--text-tertiary)]" />
              </button>
            </div>
          </div>

          {/* Ticket content */}
          <div className="ticket-container p-6 space-y-4">
            {/* Header with logo */}
            <div className="text-center space-y-1">
              {business.logoUrl && (
                <Image
                  src={business.logoUrl}
                  alt={business.name}
                  width={48}
                  height={48}
                  className="mx-auto mb-2 object-contain"
                />
              )}
              <SectionTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground">
                {business.name}
              </SectionTitle>
              {business.ruc && (
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">
                  RUC: {business.ruc}
                </p>
              )}
              {business.dni && (
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">
                  DNI: {business.dni}
                </p>
              )}
              {business.address && (
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">
                  {business.address}
                </p>
              )}
              {business.phone && (
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">
                  Tel: {business.phone}
                </p>
              )}
            </div>

            {/* Boleta number + Ticket number + date */}
            <div className="ticket-separator border-t border-b border-dashed border-[var(--rule-base)] dark:border-card-border py-2 space-y-1">
              {ticket.boletaNumber && (
                <div className="text-center">
                  <span className="text-xs font-extrabold text-[var(--text-primary)] dark:text-foreground">
                    {ticket.boletaNumber}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className="font-bold text-[var(--text-primary)] dark:text-foreground">
                  Ticket: {ticket.ticketNumber}
                </span>
                <span className="text-[var(--text-secondary)] dark:text-muted">
                  {ticket.fecha}
                </span>
              </div>
              {ticket.cashierName && (
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">
                  Cajero: {ticket.cashierName}
                </p>
              )}
            </div>

            {ticket.customerName && (
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted">
                Cliente: {ticket.customerName}
              </p>
            )}

            {/* Items table — Producto | Qty | P.Unit | Subtotal */}
            <table className="ticket-items w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--rule-base)] dark:border-card-border">
                  <th className="text-left py-1 font-bold text-[var(--text-secondary)] dark:text-muted">
                    Producto
                  </th>
                  <th className="text-center py-1 font-bold text-[var(--text-secondary)] dark:text-muted w-10">
                    Qty
                  </th>
                  <th className="text-right py-1 font-bold text-[var(--text-secondary)] dark:text-muted w-16">
                    P.Unit
                  </th>
                  <th className="text-right py-1 font-bold text-[var(--text-secondary)] dark:text-muted w-16">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody>
                {ticket.items.map((item, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-50 dark:border-card-border"
                  >
                    <td className="py-1.5 text-[var(--text-primary)] dark:text-foreground">
                      {item.name}
                    </td>
                    <td className="py-1.5 text-center text-[var(--text-secondary)] dark:text-muted">
                      {item.qty}
                    </td>
                    <td className="py-1.5 text-right text-[var(--text-secondary)] dark:text-muted">
                      {fmt(item.price)}
                    </td>
                    <td className="py-1.5 text-right font-semibold text-[var(--text-primary)] dark:text-foreground">
                      {fmt(item.price * item.qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals — Subtotal, IGV 18% separated, Total bold */}
            <div className="ticket-separator space-y-1 border-t border-dashed border-[var(--rule-base)] dark:border-card-border pt-3">
              <div className="flex justify-between text-xs text-[var(--text-secondary)] dark:text-muted">
                <span>Subtotal</span>
                <span>{fmt(ticket.subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-[var(--text-secondary)] dark:text-muted">
                <span>IGV (18%)</span>
                <span>{fmt(ticket.igv)}</span>
              </div>
              <div className="flex justify-between text-base font-extrabold text-[var(--text-primary)] dark:text-foreground pt-1 ticket-total">
                <span>TOTAL</span>
                <span>{fmt(ticket.total)}</span>
              </div>
            </div>

            {/* Payment method with icon — if MIXTO: breakdown */}
            <div className="text-xs text-center space-y-1.5">
              {ticket.paymentMethod === "MIXTO" && ticket.paymentDetails ? (
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-bold">
                    Pago mixto
                  </span>
                  <div className="space-y-0.5 mt-1">
                    {ticket.paymentDetails.map((pd, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-center gap-1.5 text-[var(--text-secondary)] dark:text-muted"
                      >
                        {paymentIcon(pd.method)}
                        <span className="capitalize">{pd.method}</span>
                        <span className="font-bold">{fmt(pd.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-bold">
                  {paymentIcon(ticket.paymentMethod)} Pago:{" "}
                  {ticket.paymentMethod}
                </span>
              )}
            </div>

            {/* Yape QR */}
            {qrUrl && (
              <div className="text-center space-y-1 pt-2">
                <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                  Paga con Yape
                </p>
                <Image
                  src={qrUrl}
                  alt="QR Yape"
                  className="mx-auto"
                  width={120}
                  height={120}
                />
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  {business.yapePhone}
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="ticket-separator text-center border-t border-dashed border-[var(--rule-base)] dark:border-card-border pt-3">
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">
                {business.footerMessage ??
                  "Gracias por su preferencia! Vuelva pronto"}
              </p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted mt-1">
                {business.name}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 p-4 border-t border-[var(--rule-soft)] dark:border-card-border no-print">
            <button
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
            <button
              onClick={handleWhatsApp}
              disabled={sending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#25D366] text-white text-sm font-bold hover:bg-[#1ebe5d] transition-colors disabled:opacity-50"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
