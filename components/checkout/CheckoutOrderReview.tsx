"use client";

import { m } from "framer-motion";
import { MapPin, Home, ShoppingCart, ShieldCheck, Lock, CheckCircle2, MessageCircle, FileText } from "@buleje/design-system/icons";

interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  unit?: string;
  image?: string;
  note?: string;
}

export interface CheckoutOrderReviewProps {
  items: CartItem[];
  finalTotal: number;
  discount: number;
  location: string;
  reference: string;
  effectiveCustomerLocation?: string;
  effectiveCustomerReference?: string;
  onEditAddress: () => void;
}

export function CheckoutOrderReview({
  items,
  finalTotal,
  discount,
  location,
  reference,
  effectiveCustomerLocation,
  effectiveCustomerReference,
  onEditAddress,
}: CheckoutOrderReviewProps) {
  const displayLocation = location || effectiveCustomerLocation;
  const displayReference = reference || effectiveCustomerReference;

  return (
    <div className="space-y-4 pr-0 sm:pr-6 pb-5 sm:pb-0">
      {/* Delivery address highlight */}
      {displayLocation ? (
        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-linear-to-r from-primary/5 to-emerald-50/50 dark:from-primary/10 dark:to-emerald-900/10 border border-primary/20 rounded-2xl p-4 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="flex items-start gap-3 relative z-10">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-bold text-primary uppercase tracking-wider">
                Entregaremos en
              </p>
              <p className="text-sm font-bold text-gray-800 dark:text-foreground mt-0.5 truncate">
                {displayLocation}
              </p>
              {displayReference && (
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                  <Home className="h-3 w-3 shrink-0" />
                  {displayReference}
                </p>
              )}
            </div>
            <m.button
              type="button"
              onClick={onEditAddress}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="text-xs text-primary font-bold hover:underline shrink-0 px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors"
            >
              Cambiar
            </m.button>
          </div>
        </m.div>
      ) : (
        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-4"
        >
          <m.button
            type="button"
            onClick={onEditAddress}
            whileHover={{ scale: 1.02 }}
            className="flex items-center gap-3 text-sm text-[var(--data-warning-700)] dark:text-amber-400 font-bold w-full"
          >
            <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-800/30 flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5" />
            </div>
            Agrega tu direccion de entrega &rarr;
          </m.button>
        </m.div>
      )}

      {/* Items list -- collapsible review */}
      <details open className="group">
        <summary className="flex items-center justify-between cursor-pointer list-none text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 py-2 px-3 rounded-xl bg-gray-50 dark:bg-surface hover:bg-gray-100 dark:hover:bg-surface/80 transition-colors">
          <span className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Revisar pedido ({items.length}{" "}
            {items.length === 1 ? "producto" : "productos"})
          </span>
          <span className="flex items-center gap-2">
            <span className="text-sm font-extrabold text-gray-900 dark:text-foreground">
              S/{finalTotal.toFixed(2)}
            </span>
            <svg
              className="h-4 w-4 transition-transform group-open:rotate-180"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </span>
        </summary>
        <div className="rounded-2xl border border-gray-100 dark:border-card-border overflow-hidden bg-white dark:bg-card shadow-sm">
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-50 dark:divide-card-border">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/50 dark:hover:bg-surface/30 transition-colors"
              >
                <div className="relative h-10 w-10 rounded-lg overflow-hidden bg-gray-100 dark:bg-surface shrink-0 ring-1 ring-gray-100 dark:ring-card-border">
                  {item.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={item.image}
                      alt={item.name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-[var(--rule-base)]">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m7.5 7.5-.84-1.681a1.5 1.5 0 0 1 1.342-2.169h8.996a1.5 1.5 0 0 1 1.342 2.169L17.5 7.5m-10 0h10m-10 0H4.5a1.5 1.5 0 0 0-1.5 1.5v9a1.5 1.5 0 0 0 1.5 1.5h15a1.5 1.5 0 0 0 1.5-1.5V9a1.5 1.5 0 0 0-1.5-1.5h-3" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800 dark:text-foreground truncate leading-tight">
                    {item.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-md bg-primary/10 text-primary text-xs font-bold">
                      x{item.quantity}
                    </span>
                    <span className="text-xs text-gray-400">{item.unit}</span>
                    <span className="text-xs text-gray-400">
                      S/{item.price.toFixed(2)} c/u
                    </span>
                    {item.note && (
                      <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--data-warning-500)] truncate">
                        <FileText className="h-3 w-3 shrink-0" strokeWidth={2} />
                        {item.note}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm font-extrabold text-gray-900 dark:text-foreground shrink-0 tabular-nums">
                  S/{(item.price * item.quantity).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
          {/* Summary breakdown */}
          <div className="px-4 py-2.5 border-t border-gray-100 dark:border-card-border bg-gray-50/50 dark:bg-surface/30 space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Subtotal</span>
              <span>
                S/
                {items
                  .reduce((s, i) => s + i.price * i.quantity, 0)
                  .toFixed(2)}
              </span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-xs text-[var(--data-success-600)] font-bold">
                <span>Descuento</span>
                <span>-S/{discount.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      </details>

      {/* WhatsApp summary — el texto del mensaje conserva los emojis porque
          el cliente final los ve en su chat de WhatsApp (UX nativa de la app),
          pero el botón de la web es 100% propio sin emojis. */}
      <a
        href={`https://wa.me/?text=${encodeURIComponent(
          `Mi pedido:\n${items
            .map(
              (i) =>
                `• ${i.name} x${i.quantity} — S/${(i.price * i.quantity).toFixed(2)}`
            )
            .join("\n")}\n\nTotal: S/${finalTotal.toFixed(2)}${
            discount > 0 ? ` (desc: -S/${discount.toFixed(2)})` : ""
          }`
        )}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed border-emerald-400/50 text-[var(--data-success-600)] text-xs font-bold hover:bg-emerald-50 dark:hover:bg-emerald-900/10 hover:border-emerald-500 transition-colors"
      >
        <MessageCircle className="h-4 w-4" strokeWidth={2} />
        Enviar resumen por WhatsApp
      </a>

      {/* Trust signals — pago seguro */}
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-900/10 px-4 py-3">
        <div className="flex items-center justify-center gap-2 mb-2">
          <ShieldCheck className="h-4 w-4 text-[var(--data-success-600)] dark:text-emerald-400" />
          <p className="text-xs font-extrabold text-[var(--data-success-700)] dark:text-emerald-300 uppercase tracking-wider">
            Compra 100% protegida
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center gap-1 text-center">
            <Lock className="h-3.5 w-3.5 text-[var(--data-success-600)] dark:text-emerald-400" />
            <span className="text-[length:var(--ts-2xs)] font-semibold text-gray-600 dark:text-zinc-400">
              SSL encriptado
            </span>
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--data-success-600)] dark:text-emerald-400" />
            <span className="text-[length:var(--ts-2xs)] font-semibold text-gray-600 dark:text-zinc-400">
              Pago verificado
            </span>
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--data-success-600)] dark:text-emerald-400" />
            <span className="text-[length:var(--ts-2xs)] font-semibold text-gray-600 dark:text-zinc-400">
              Datos seguros
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
