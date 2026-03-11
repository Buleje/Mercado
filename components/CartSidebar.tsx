"use client";

import { useRef, useEffect, useState, startTransition } from "react";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { X, Plus, Minus, Trash2, ShoppingCart, MessageCircle, Clipboard, Share2, CheckCircle2, Download, MessageCircleOff, Package, Tag, Truck } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useCustomer } from "@/contexts/customer-context";
import { useSettings } from "@/contexts/settings-context";
import { usePromotions } from "@/contexts/promotions-context";
import { sendOrder, type SendResult } from "@/lib/order-utils";

/** Renders a cart item image with graceful error fallback */
function CartItemImage({ src, alt }: { src: string; alt: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
        <Package className="h-7 w-7 text-gray-300" />
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      className="object-cover"
      sizes="80px"
      onError={() => setErr(true)}
    />
  );
}

export default function CartSidebar() {
  const { items, isOpen, count, total, close, removeItem, updateQty, clear, markOrderPending, openConfirmModal, clearPendingOrder, openCheckout } =
    useCart();
  const { customer } = useCustomer();
  const { mode } = useSettings();
  const { getBestPromotion, promotions } = usePromotions();
  const panelRef = useRef<HTMLDivElement>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [sending, setSending] = useState(false);

  const promo = getBestPromotion(total, customer?.phone);
  const discount = promo ? total * (promo.discountPercent / 100) : 0;
  const finalTotal = total - discount;

  // Reset state when cart is closed
  useEffect(() => {
    if (!isOpen) {
      startTransition(() => {
        setSendResult(null);
        setSending(false);
      });
    }
  }, [isOpen]);

  // Lock scroll when open
  useScrollLock(isOpen);

  const handleOrder = async () => {
    if (items.length === 0) return;
    // Checkout flow mode — open the checkout modal (handles data collection inside)
    if (mode === "checkout") {
      openCheckout();
      return;
    }
    // WhatsApp mode
    const sender = customer ?? {
      name: "Cliente",
      phone: "",
      location: "Pucallpa, Ucayali",
      reference: "",
      savedLocations: [],
    };
    setSending(true);
    const result = await sendOrder(sender, items, total);
    setSending(false);
    setSendResult(result);
    markOrderPending();
    // Dispatch order tracking event so OrderProgress widget appears
    const orderId = `WA-${Date.now().toString(36).toUpperCase()}`;
    window.dispatchEvent(new CustomEvent("bsm:orderCreated", { detail: { orderId } }));
    setTimeout(() => openConfirmModal(), 1800);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
            aria-hidden="true"
            className="fixed inset-0 z-6000 bg-black/50 backdrop-blur-sm"
          />

          {/* Panel */}
          <m.aside
            ref={panelRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            role="dialog"
            aria-modal="true"
            aria-label="Carrito de compras"
            className="fixed top-0 right-0 bottom-0 z-6001 w-full max-w-md bg-white dark:bg-background shadow-2xl flex flex-col isolate"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5 border-b bg-primary/5">
              <div className="flex items-center gap-3">
                <ShoppingCart className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">
                  Tu Carrito{" "}
                  <span className="text-primary">({count})</span>
                </h2>
              </div>
              <button
                onClick={close}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Cerrar carrito"
              >
                <X className="h-5 w-5 text-muted" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-5 py-10 px-2">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/8">
                    <ShoppingCart className="h-9 w-9 text-primary/40" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-foreground">Tu carrito está vacío</p>
                    <p className="text-sm text-muted mt-1">Agrega productos para hacer tu pedido</p>
                  </div>
                  <div className="w-full space-y-2">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wide">Categorías populares</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {[
                        { emoji: "🥬", label: "Verduras", id: "frutas-verduras" },
                        { emoji: "🏪", label: "Abarrotes", id: "abarrotes" },
                        { emoji: "🥩", label: "Carnes", id: "carnes" },
                        { emoji: "🧀", label: "Lácteos", id: "lacteos" },
                        { emoji: "🥤", label: "Bebidas", id: "bebidas" },
                        { emoji: "🧹", label: "Limpieza", id: "limpieza" },
                      ].map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => {
                            close();
                            // Navigate + dispatch category filter
                            const el = document.getElementById(`cat-${cat.id}`);
                            if (el) {
                              el.scrollIntoView({ behavior: "smooth", block: "start" });
                            } else {
                              window.location.href = `/tienda#cat-${cat.id}`;
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/8 text-primary text-xs font-semibold hover:bg-primary/15 transition-colors"
                        >
                          <span>{cat.emoji}</span>
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={close}
                    className="w-full max-w-48 rounded-xl bg-primary text-white py-2.5 text-sm font-bold hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
                  >
                    Explorar tienda
                  </button>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="flex gap-3 bg-gray-50 dark:bg-card rounded-xl p-3"
                  >
                    {/* Image */}
                    <div className="relative h-20 w-20 shrink-0 rounded-lg overflow-hidden bg-white">
                      <CartItemImage src={item.image} alt={item.name} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm text-foreground leading-tight line-clamp-2">
                        {item.name}
                      </h3>
                      <p className="text-xs text-muted mt-0.5">
                        S/{item.price.toFixed(2)} / {item.unit}
                      </p>

                      <div className="flex items-center justify-between mt-2">
                        {/* Quantity Controls */}
                        <div className="flex items-center gap-1 bg-white rounded-lg border shadow-sm">
                          <button
                            onClick={() =>
                              updateQty(item.id, item.quantity - 1)
                            }
                            className="p-1.5 hover:bg-gray-50 rounded-l-lg transition-colors"
                            aria-label="Reducir cantidad"
                          >
                            <Minus className="h-3.5 w-3.5 text-muted" />
                          </button>
                          <span className="px-3 text-sm font-semibold min-w-8 text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateQty(item.id, item.quantity + 1)
                            }
                            className="p-1.5 hover:bg-gray-50 rounded-r-lg transition-colors"
                            aria-label="Aumentar cantidad"
                          >
                            <Plus className="h-3.5 w-3.5 text-muted" />
                          </button>
                        </div>

                        {/* Subtotal + Delete */}
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-primary">
                            S/{(item.price * item.quantity).toFixed(2)}
                          </span>
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            aria-label={`Eliminar ${item.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t dark:border-card-border px-4 sm:px-6 py-4 sm:py-5 pb-safe space-y-3 sm:space-y-4 bg-white dark:bg-background shrink-0">

            {/* Promotion banner */}
                {promo && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                    <Tag className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-emerald-700 truncate">{promo.name}</p>
                      <p className="text-xs text-emerald-600">-{promo.discountPercent}% aplicado</p>
                    </div>
                    <p className="font-bold text-emerald-700 text-sm shrink-0">-S/{discount.toFixed(2)}</p>
                  </div>
                )}

                {/* Promo threshold progress — "Spend X more to unlock Y%" */}
                {(() => {
                  const upcoming = promotions
                    .filter(p => p.minPurchase && p.minPurchase > total && p.targetType !== "specific")
                    .sort((a, b) => (a.minPurchase ?? 0) - (b.minPurchase ?? 0))[0];
                  if (!upcoming?.minPurchase) return null;
                  const needed = upcoming.minPurchase - total;
                  const pct = Math.min((total / upcoming.minPurchase) * 100, 100);
                  return (
                    <div className="rounded-xl border border-dashed border-amber-400/40 bg-amber-50 dark:bg-amber-500/5 px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <Tag className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                            Agrega <span className="text-amber-500 font-extrabold">S/{needed.toFixed(2)}</span> más para -{upcoming.discountPercent}%
                          </span>
                        </div>
                        <span className="text-[11px] font-bold tabular-nums text-amber-600/70">
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-amber-200/60 dark:bg-amber-500/20 overflow-hidden">
                        <div className="h-full rounded-full bg-amber-400 transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}

                {/* Free delivery progress */}
                {(() => {
                  const FREE_DELIVERY = 50;
                  const remaining = FREE_DELIVERY - finalTotal;
                  const pct = Math.min((finalTotal / FREE_DELIVERY) * 100, 100);
                  return (
                    <div className="rounded-xl border border-dashed border-primary/25 bg-primary/4 px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5 text-primary" />
                          <span className="text-xs font-bold text-primary">
                            {remaining > 0
                              ? `Agrega S/${remaining.toFixed(2)} más para delivery gratis`
                              : "🎉 ¡Delivery gratis desbloqueado!"}
                          </span>
                        </div>
                        <span className="text-[11px] font-bold tabular-nums" style={{ color: remaining > 0 ? "var(--color-muted)" : "var(--color-primary)" }}>
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-primary/15 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: remaining <= 0 ? "#25D366" : "var(--color-primary)" }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Total */}
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-muted">
                    Total
                  </span>
                  <div className="text-right">
                    {promo && (
                      <p className="text-sm text-gray-400 line-through leading-none mb-0.5">
                        S/{total.toFixed(2)}
                      </p>
                    )}
                    <span className="text-2xl font-extrabold text-primary">
                      S/{finalTotal.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Order Button — WhatsApp or Checkout depending on mode */}
                {mode === "checkout" ? (
                  <m.button
                    onClick={handleOrder}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="w-full flex items-center justify-center gap-3 rounded-xl bg-primary px-6 py-4 text-base font-bold text-white shadow-lg shadow-primary/25 hover:bg-primary-dark transition-all duration-200"
                  >
                    <Package className="h-5 w-5" />
                    Completar pedido
                  </m.button>
                ) : (

                  <m.button
                    onClick={handleOrder}
                    disabled={sending}
                    whileHover={{ scale: sending ? 1 : 1.02 }}
                    whileTap={{ scale: sending ? 1 : 0.97 }}
                    className="w-full flex items-center justify-center gap-3 rounded-xl bg-[#25D366] px-6 py-4 text-base font-bold text-white shadow-lg shadow-[#25D366]/20 hover:bg-[#20BD5A] transition-all duration-200 disabled:opacity-70 disabled:cursor-wait"
                  >
                    {sending ? (
                      <>
                        <m.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}>
                          <Share2 className="h-5 w-5" />
                        </m.span>
                        Preparando imagen…
                      </>
                    ) : (
                      <>
                        <MessageCircle className="h-5 w-5" />
                        Pedir por WhatsApp
                      </>
                    )}
                  </m.button>
                )}
                <AnimatePresence>
                  {sendResult && (
                    <m.div
                      key={sendResult}
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ type: "spring", damping: 22, stiffness: 300 }}
                      className={`rounded-xl border px-4 py-3.5 flex items-start gap-3 ${
                        sendResult === "shared"
                          ? "border-[#25D366]/30 bg-[#25D366]/8"
                          : sendResult === "clipboard"
                          ? "border-primary/25 bg-primary/6"
                          : "border-amber-300/50 bg-amber-50"
                      }`}
                    >
                      {sendResult === "shared" && <CheckCircle2 className="h-5 w-5 text-[#20BD5A] shrink-0 mt-0.5" />}
                      {sendResult === "clipboard" && <Clipboard className="h-5 w-5 text-primary shrink-0 mt-0.5" />}
                      {sendResult === "fallback" && <Download className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />}
                      <div>
                        {sendResult === "shared" && (
                          <>
                            <p className="text-sm font-bold text-[#157c3c]">¡Imagen enviada!</p>
                            <p className="text-xs text-foreground/70 mt-0.5">Selecciona el chat de Bodega San Martín en WhatsApp para enviar tu pedido.</p>
                          </>
                        )}
                        {sendResult === "clipboard" && (
                          <>
                            <p className="text-sm font-bold text-primary">Imagen copiada al portapapeles</p>
                            <p className="text-xs text-foreground/70 mt-0.5 leading-relaxed">WhatsApp se abrió con el texto del pedido. <strong>Pega la imagen con Ctrl+V</strong> en el chat antes de enviar.</p>
                          </>
                        )}
                        {sendResult === "fallback" && (
                          <>
                            <p className="text-sm font-bold text-amber-600">Imagen descargada</p>
                            <p className="text-xs text-foreground/70 mt-0.5">Adjunta el archivo PNG en el chat de WhatsApp antes de enviar el mensaje.</p>
                          </>
                        )}
                      </div>
                    </m.div>
                  )}
                </AnimatePresence>

                {/* Clear Cart */}
                <button
                  onClick={clear}
                  className="w-full text-center text-sm text-muted hover:text-red-500 transition-colors py-1"
                >
                  Vaciar carrito
                </button>

                {/* "Didn't send" escape hatch — shown after fallback/clipboard result */}
                <AnimatePresence>
                  {(sendResult === "fallback" || sendResult === "clipboard") && (
                    <m.button
                      key="not-sent"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      onClick={() => { clearPendingOrder(); setSendResult(null); }}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-muted hover:text-foreground hover:border-gray-300 hover:bg-gray-50 transition-all"
                    >
                      <MessageCircleOff className="h-4 w-4 shrink-0" />
                      No envie el mensaje por WhatsApp (Cerrar)
                    </m.button>
                  )}
                </AnimatePresence>
              </div>
            )}
          </m.aside>
        </>
      )}
    </AnimatePresence>
  );
}
