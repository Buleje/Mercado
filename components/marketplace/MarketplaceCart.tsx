"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart } from "@buleje/design-system/icons";
import { useMarketplaceCart, type CartItem } from "@/hooks/use-marketplace-cart";
import ShareCartButton from "@/components/marketplace/ShareCartButton";
import WhatsAppOrderButton from "@/components/marketplace/WhatsAppOrderButton";
import { cn } from "@/lib/utils";

// ---------- helpers ----------

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

// ---------- sub-componentes ----------

function CartItemRow({
  item,
  onIncrease,
  onDecrease,
  onRemove,
}: {
  item: CartItem;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-3 group/row">
      {/* imagen */}
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800 ring-1 ring-gray-200 dark:ring-gray-700">
        {item.image ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            className="object-cover transition-transform duration-300 group-hover/row:scale-110"
            sizes="56px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900">
            <svg
              aria-hidden="true"
              className="h-6 w-6 text-gray-300 dark:text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          </div>
        )}
      </div>

      {/* info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
          {item.name}
        </p>
        <p className="text-xs font-bold text-primary dark:text-primary/80 mt-0.5">
          {fmt(item.price)}
          {item.unit ? ` / ${item.unit}` : ""}
        </p>
        <p className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-gray-500 mt-0.5">
          Subtotal: {fmt(item.price * item.quantity)}
        </p>
      </div>

      {/* controles cantidad — pill style */}
      <div className="flex items-center rounded-xl bg-gray-100 dark:bg-gray-800 overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700">
        <button
          onClick={onDecrease}
          aria-label={`Reducir cantidad de ${item.name}`}
          className="flex h-8 w-8 items-center justify-center text-gray-700 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
          </svg>
        </button>
        <span className="w-7 text-center text-sm font-bold text-gray-900 dark:text-white">
          {item.quantity}
        </span>
        <button
          onClick={onIncrease}
          aria-label={`Aumentar cantidad de ${item.name}`}
          className="flex h-8 w-8 items-center justify-center text-gray-700 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* eliminar */}
      <button
        onClick={onRemove}
        aria-label={`Eliminar ${item.name} del carrito`}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 opacity-0 group-hover/row:opacity-100 transition-all hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}

// ---------- badge para navbar ----------

export function CartBadge({ onClick }: { onClick: () => void }) {
  const { itemCount, grandTotal } = useMarketplaceCart();
  const [pulse, setPulse] = React.useState(false);
  const prevCountRef = React.useRef(itemCount);

  // Pulse animation cuando itemCount aumenta
  React.useEffect(() => {
    if (itemCount > prevCountRef.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 700);
      prevCountRef.current = itemCount;
      return () => clearTimeout(t);
    }
    prevCountRef.current = itemCount;
  }, [itemCount]);

  const fmtPrice = (n: number) =>
    new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
      maximumFractionDigits: 0,
    }).format(n);

  const hasItems = itemCount > 0;

  // NOTE: hover preview menu removido — el user pidió UX más directa:
  // click → página de carrito; no popover al hover.
  // Micro-animación: pulse ring al agregar + badge con spring, total
  // visible al lado del icono cuando hay items.

  return (
    <div className="relative">
      <motion.button
        onClick={onClick}
        animate={pulse ? { scale: [1, 1.12, 1] } : { scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        aria-label={`Carrito — ${itemCount} ${itemCount === 1 ? "producto" : "productos"}`}
        className={cn(
          "relative inline-flex items-center gap-2.5 h-11 rounded-full transition-colors shadow-sm focus-visible:outline-2 focus-visible:outline-[var(--accent)]",
          hasItems
            ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:bg-[var(--accent)] pl-3.5 pr-4 text-sm font-bold"
            : "w-11 justify-center border border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
        )}
      >
        {/* Icono — limpio, sin badge encima */}
        <span className="relative inline-flex items-center justify-center">
          <ShoppingCart
            className="h-5 w-5 shrink-0"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <AnimatePresence>
            {pulse && hasItems && (
              <motion.span
                key="pulse-ring"
                initial={{ scale: 0.8, opacity: 0.8 }}
                animate={{ scale: 2.6, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="absolute inset-0 rounded-full border-2 border-[var(--accent)] pointer-events-none"
                aria-hidden
              />
            )}
          </AnimatePresence>
        </span>
        {/* Contador + total INLINE cuando hay items — no tapa el icono */}
        <AnimatePresence mode="wait">
          {hasItems && (
            <motion.span
              key={`meta-${itemCount}-${Math.round(grandTotal)}`}
              initial={{ opacity: 0, x: -6, width: 0 }}
              animate={{ opacity: 1, x: 0, width: "auto" }}
              exit={{ opacity: 0, x: -6, width: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 whitespace-nowrap overflow-hidden"
            >
              <span className="inline-flex min-w-[1.25rem] h-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-black tabular-nums text-white">
                {itemCount > 99 ? "99+" : itemCount}
              </span>
              <span
                aria-hidden
                className="h-4 w-px bg-current opacity-25"
              />
              <span className="tabular-nums font-black text-sm">
                {fmtPrice(grandTotal)}
              </span>
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}

// ---------- drawer principal ----------

export default function MarketplaceCart({
  isOpen,
  onClose,
  onCheckout,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCheckout?: () => void;
}) {
  const {
    byStore,
    totalByStore,
    grandTotal,
    itemCount,
    updateQuantity,
    removeItem,
    clearAll,
    clearStore,
  } = useMarketplaceCart();

  const [isOrdering, setIsOrdering] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [orderResults, setOrderResults] = useState<Array<{ storeName: string; storeSlug: string; success: boolean; error?: string }>>([]);
  const [step, setStep] = useState<"cart" | "datos" | "pago" | "confirmacion">("cart");

  // Customer info form
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState<"efectivo" | "yape">("efectivo");
  const [cashAmount, setCashAmount] = useState("");

  // Coupon state (per store)
  const [couponCodes, setCouponCodes] = useState<Record<string, string>>({});
  const [couponResults, setCouponResults] = useState<Record<string, { valid: boolean; discount: number; code: string; description?: string; reason?: string }>>({});
  const [couponLoading, setCouponLoading] = useState<Record<string, boolean>>({});

  // Loyalty points state
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);

  // WhatsApp phone per store (slug → phone | null)
  const [storePhones, setStorePhones] = useState<Record<string, string | null>>({});

  // Persist customer info in localStorage
  useState(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem("marketplace-customer-info");
      if (saved) {
        const info = JSON.parse(saved);
        if (info.name) setCustomerName(info.name);
        if (info.phone) setCustomerPhone(info.phone);
        if (info.address) setCustomerAddress(info.address);
      }
    } catch { /* silent */ }
  });

  // Validate coupon for a specific store
  const validateCoupon = useCallback(async (storeSlug: string) => {
    const code = couponCodes[storeSlug]?.trim();
    if (!code) return;
    const storeTotal = totalByStore[storeSlug]?.total ?? grandTotal;
    setCouponLoading((p) => ({ ...p, [storeSlug]: true }));
    try {
      const res = await fetch("/api/marketplace/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, storeSlug, cartTotal: storeTotal }),
      });
      const data = await res.json();
      setCouponResults((p) => ({ ...p, [storeSlug]: data }));
    } catch {
      setCouponResults((p) => ({ ...p, [storeSlug]: { valid: false, discount: 0, code, reason: "Error de conexión" } }));
    } finally {
      setCouponLoading((p) => ({ ...p, [storeSlug]: false }));
    }
  }, [couponCodes, totalByStore, grandTotal]);

  // Fetch loyalty points when phone changes
  useEffect(() => {
    if (step !== "datos" || !customerPhone || customerPhone.trim().length < 6) {
      setLoyaltyPoints(0);
      setRedeemPoints(0);
      return;
    }
    let cancelled = false;
    setLoyaltyLoading(true);
    fetch(`/api/marketplace/loyalty?phone=${encodeURIComponent(customerPhone.trim())}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) {
          setLoyaltyPoints(d.data?.points ?? 0);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoyaltyLoading(false); });
    return () => { cancelled = true; };
  }, [step, customerPhone]);

  // Fetch WhatsApp phones for each store when the cart opens
  useEffect(() => {
    if (!isOpen) return;
    const slugs = Object.values(byStore).map((g) => g.storeSlug);
    const missing = slugs.filter((sl) => !(sl in storePhones));
    if (missing.length === 0) return;

    for (const slug of missing) {
      fetch(`/api/marketplace/stores/${encodeURIComponent(slug)}/phone`)
        .then((r) => r.ok ? r.json() : { phone: null })
        .then((d: { phone?: string | null }) => {
          setStorePhones((prev) => ({ ...prev, [slug]: d.phone ?? null }));
        })
        .catch(() => {
          setStorePhones((prev) => ({ ...prev, [slug]: null }));
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, byStore]);

  // Calculate total discounts
  const totalCouponDiscount = Object.values(couponResults).reduce(
    (sum, r) => sum + (r.valid ? r.discount : 0), 0
  );
  const loyaltyDiscount = Math.min(redeemPoints / 100, grandTotal - totalCouponDiscount); // 100 pts = S/1
  const finalTotal = Math.max(0, grandTotal - totalCouponDiscount - loyaltyDiscount);

  const goToCheckout = () => {
    if (onCheckout) {
      onCheckout();
      return;
    }
    setOrderError(null);
    setStep("datos");
  };

  const goToPago = () => {
    // Validate customer info before proceeding to payment
    if (!customerName.trim() || customerName.trim().length < 2) {
      setOrderError("Ingresa tu nombre (mínimo 2 caracteres)");
      return;
    }
    if (!customerPhone.trim() || customerPhone.trim().length < 6) {
      setOrderError("Ingresa tu teléfono (mínimo 6 dígitos)");
      return;
    }
    if (!customerAddress.trim() || customerAddress.trim().length < 5) {
      setOrderError("Ingresa tu dirección (mínimo 5 caracteres)");
      return;
    }
    setOrderError(null);
    setStep("pago");
  };

  const goToConfirmacion = () => {
    setOrderError(null);
    setStep("confirmacion");
  };

  const goBackToCart = () => {
    setStep("cart");
    setOrderError(null);
  };

  const goBackToDatos = () => {
    setStep("datos");
    setOrderError(null);
  };

  const goBackToPago = () => {
    setStep("pago");
    setOrderError(null);
  };

  const handleOrder = useCallback(async () => {
    if (itemCount === 0) return;
    setIsOrdering(true);
    setOrderError(null);
    setOrderSuccess(false);
    setOrderResults([]);

    // Save customer info for next time
    try {
      localStorage.setItem(
        "marketplace-customer-info",
        JSON.stringify({ name: customerName.trim(), phone: customerPhone.trim(), address: customerAddress.trim() })
      );
    } catch { /* silent */ }

    // Fire-and-forget: save cart for abandoned cart recovery BEFORE placing order
    const storeIds = Object.keys(byStore);
    for (const storeId of storeIds) {
      const group = byStore[storeId];
      fetch("/api/marketplace/cart/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeSlug: group.storeSlug,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          items: group.items.map((i) => ({
            storeProductId: i.storeProductId,
            productId: i.productId,
            name: i.name,
            quantity: i.quantity,
            price: i.price,
            unit: i.unit ?? "unidad",
          })),
          total: group.items.reduce((s, i) => s + i.price * i.quantity, 0),
        }),
      }).catch(() => {
        // Silent — analytics best-effort, no bloquea el flujo de checkout
      });
    }

    const results = await Promise.allSettled(
      storeIds.map((storeId) => {
        const group = byStore[storeId];
        const items = group.items.map((i) => ({
          storeProductId: i.storeProductId,
          productId: i.productId,
          name: i.name,
          quantity: i.quantity,
          retailPrice: i.price,
          unit: i.unit ?? "unidad",
        }));
        return fetch("/api/marketplace/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeSlug: group.storeSlug,
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            customerAddress: customerAddress.trim(),
            notes: customerNotes.trim() || undefined,
            paymentMethod,
            items,
          }),
        }).then(async (r) => {
          if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            throw new Error(data.error || `Error ${r.status}`);
          }
          return { storeId, ...r.json() };
        });
      })
    );

    // Build per-store results
    const perStoreResults = storeIds.map((storeId, idx) => {
      const group = byStore[storeId];
      const r = results[idx];
      return {
        storeName: group.storeName,
        storeSlug: group.storeSlug,
        success: r.status === "fulfilled",
        error: r.status === "rejected" ? (r.reason?.message ?? "Error desconocido") : undefined,
      };
    });
    setOrderResults(perStoreResults);

    const succeeded = perStoreResults.filter((r) => r.success);
    const failed = perStoreResults.filter((r) => !r.success);

    // Clear only successful stores from cart
    for (const r of succeeded) {
      const sid = storeIds.find((id) => byStore[id]?.storeSlug === r.storeSlug);
      if (sid) clearStore(sid);
    }

    if (failed.length > 0 && succeeded.length > 0) {
      // Partial success
      setOrderError(
        `${succeeded.length} ${succeeded.length === 1 ? "pedido enviado" : "pedidos enviados"}, pero ${failed.length} ${failed.length === 1 ? "falló" : "fallaron"}: ${failed[0].error}`
      );
      setOrderSuccess(true);
      setStep("cart");
    } else if (failed.length > 0) {
      // All failed
      setOrderError(
        `${failed.length} ${failed.length === 1 ? "pedido falló" : "pedidos fallaron"}: ${failed[0].error}`
      );
    } else {
      // All succeeded
      setOrderSuccess(true);
      setStep("cart");
      setPaymentMethod("efectivo");
      setCashAmount("");
      setTimeout(() => {
        setOrderSuccess(false);
        setOrderResults([]);
        onClose();
      }, 4000);
    }
    setIsOrdering(false);
  }, [byStore, itemCount, clearStore, onClose, customerName, customerPhone, customerAddress, customerNotes, paymentMethod]);

  const storeIds = Object.keys(byStore);
  const isEmpty = storeIds.length === 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* overlay */}
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* drawer */}
          <motion.aside
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-white/95 backdrop-blur-xl shadow-2xl shadow-black/20 dark:bg-gray-900/95 sm:w-96 border-l border-white/20 dark:border-gray-800/50"
            role="dialog"
            aria-modal="true"
            aria-label="Carrito de compras"
          >
            {/* header — glassmorphism */}
            <div className="flex items-center justify-between px-5 py-4 bg-[var(--surface-sunken)] border-b border-[var(--rule-soft)]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
                  <svg aria-hidden="true" className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white leading-none">
                    {step === "cart" ? "Mi carrito" : step === "datos" ? "Datos de entrega" : step === "pago" ? "Método de pago" : "Confirmar pedido"}
                  </h2>
                  {itemCount > 0 && (
                    <span className="text-[length:var(--ts-2xs)] font-semibold text-primary mt-0.5 block">
                      {itemCount} {itemCount === 1 ? "producto" : "productos"}
                      {storeIds.length > 1 ? ` · ${storeIds.length} tiendas` : ""}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isEmpty && step === "cart" && (
                  <button
                    onClick={clearAll}
                    className="text-[length:var(--ts-2xs)] font-semibold text-gray-400 underline-offset-2 hover:text-red-500 hover:underline dark:text-gray-500 dark:hover:text-red-400 transition-colors"
                  >
                    Vaciar
                  </button>
                )}
                <button
                  onClick={onClose}
                  aria-label="Cerrar carrito"
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-500 transition-all hover:bg-gray-100 hover:rotate-90 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Step bar */}
            {!isEmpty && !orderSuccess && step !== "cart" && (
              <div className="px-5 py-3 border-b border-gray-200/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-900/50">
                <div className="flex items-center gap-2">
                  {[
                    { key: "datos", label: "Datos", num: 1 },
                    { key: "pago", label: "Pago", num: 2 },
                    { key: "confirmacion", label: "Confirmar", num: 3 },
                  ].map(({ key, label, num }, idx) => {
                    const steps = ["datos", "pago", "confirmacion"];
                    const currentIdx = steps.indexOf(step);
                    const isActive = step === key;
                    const isDone = currentIdx > idx;
                    return (
                      <React.Fragment key={key}>
                        {idx > 0 && (
                          <div className={`flex-1 h-0.5 rounded-full ${isDone ? "bg-primary" : "bg-gray-200 dark:bg-gray-700"}`} />
                        )}
                        <div className={`flex items-center gap-1.5 ${isActive ? "text-primary" : isDone ? "text-primary/70" : "text-gray-400 dark:text-gray-500"}`}>
                          <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[length:var(--ts-2xs)] font-black ${
                            isActive ? "bg-primary text-white" : isDone ? "bg-primary/20 text-primary" : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500"
                          }`}>
                            {isDone ? "✓" : num}
                          </div>
                          <span className="text-[length:var(--ts-2xs)] font-semibold hidden sm:inline">{label}</span>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}

                {/* contenido */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700">
              {orderSuccess ? (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center"
                >
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-green-100 to-emerald-50 dark:from-green-900/40 dark:to-emerald-900/20 shadow-lg shadow-green-200/50 dark:shadow-green-900/30">
                    <svg aria-hidden="true" className="h-10 w-10 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {orderResults.every((r) => r.success) ? "¡Pedidos enviados!" : "Pedidos procesados"}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-[250px]">
                    {orderResults.every((r) => r.success)
                      ? "Cada tienda recibirá tu pedido y te contactará por WhatsApp."
                      : "Algunos pedidos se enviaron correctamente."}
                  </p>

                  {/* Per-store results */}
                  {orderResults.length > 0 && (
                    <div className="w-full max-w-[280px] space-y-2 mt-2">
                      {orderResults.map((r, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs ${
                            r.success
                              ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                              : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                          }`}
                        >
                          <span className="text-sm">{r.success ? "✓" : "✗"}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{r.storeName}</p>
                            {r.error && <p className="text-[length:var(--ts-2xs)] opacity-80 truncate">{r.error}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ) : isEmpty ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-100/80 dark:bg-gray-800/80 shadow-inner">
                    <svg aria-hidden="true" className="h-9 w-9 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
                      Tu carrito está vacío
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      Explora las tiendas y agrega productos
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="min-h-11 rounded-2xl bg-primary px-8 text-sm font-bold text-white transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-primary/25"
                  >
                    Ver tiendas
                  </button>
                </div>
              ) : step === "datos" ? (
                /* ─── PASO 1: DATOS DEL CLIENTE ─── */
                <div className="px-5 py-4 space-y-4">
                  <button
                    onClick={goBackToCart}
                    className="flex items-center gap-1 text-sm text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Volver al carrito
                  </button>

                  <div className="space-y-3">
                    <div>
                      <label htmlFor="mp-name" className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Nombre completo *
                      </label>
                      <input
                        id="mp-name"
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Ej: Juan Pérez"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
                        maxLength={100}
                      />
                    </div>

                    <div>
                      <label htmlFor="mp-phone" className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Teléfono / WhatsApp *
                      </label>
                      <input
                        id="mp-phone"
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="Ej: 916409675"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
                        maxLength={20}
                      />
                    </div>

                    <div>
                      <label htmlFor="mp-address" className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Dirección de entrega *
                      </label>
                      <input
                        id="mp-address"
                        type="text"
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                        placeholder="Ej: Jr. Los Olivos 123, Pucallpa"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
                        maxLength={300}
                      />
                    </div>

                    <div>
                      <label htmlFor="mp-notes" className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Notas (opcional)
                      </label>
                      <textarea
                        id="mp-notes"
                        value={customerNotes}
                        onChange={(e) => setCustomerNotes(e.target.value)}
                        placeholder="Ej: Tocar el timbre, cerca de la esquina..."
                        rows={2}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500 resize-none"
                        maxLength={500}
                      />
                    </div>
                  </div>

                  {/* Cupones por tienda */}
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Cupones de descuento</p>
                    {Object.keys(byStore).map((sid) => {
                      const g = byStore[sid];
                      const couponR = couponResults[g.storeSlug];
                      return (
                        <div key={sid} className="mb-2">
                          <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">{g.storeName}</span>
                          <div className="flex gap-1.5 mt-1">
                            <input
                              type="text"
                              value={couponCodes[g.storeSlug] ?? ""}
                              onChange={(e) => setCouponCodes((p) => ({ ...p, [g.storeSlug]: e.target.value.toUpperCase() }))}
                              placeholder="Código de cupón"
                              className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
                              maxLength={30}
                            />
                            <button
                              onClick={() => validateCoupon(g.storeSlug)}
                              disabled={!!couponLoading[g.storeSlug] || !couponCodes[g.storeSlug]?.trim()}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {couponLoading[g.storeSlug] ? "..." : "Aplicar"}
                            </button>
                          </div>
                          {couponR && (
                            <p className={`text-xs mt-1 ${couponR.valid ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                              {couponR.valid ? `✓ -${fmt(couponR.discount)} descuento` : couponR.reason || "Cupón inválido"}
                            </p>
                          )}
                        </div>
                      );
                    })}

                    {/* Loyalty points */}
                    {loyaltyPoints > 0 && (
                      <div className="mt-2 border-t border-gray-200 pt-2 dark:border-gray-700">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-600 dark:text-gray-400">Tus puntos: <strong className="tabular-nums">{loyaltyPoints}</strong></span>
                          <span className="text-gray-400 dark:text-gray-500">(100 pts = S/1)</span>
                        </div>
                        <div className="flex gap-1.5 mt-1">
                          <input
                            type="number"
                            min={0}
                            max={loyaltyPoints}
                            step={100}
                            value={redeemPoints}
                            onChange={(e) => setRedeemPoints(Math.min(Number(e.target.value) || 0, loyaltyPoints))}
                            placeholder="0"
                            className="w-20 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                          />
                          <span className="self-center text-xs text-gray-500 dark:text-gray-400">
                            puntos = -{fmt(redeemPoints / 100)}
                          </span>
                        </div>
                      </div>
                    )}
                    {loyaltyLoading && (
                      <p className="text-xs text-gray-400 mt-1">Consultando puntos...</p>
                    )}
                  </div>
                </div>
              ) : step === "pago" ? (
                /* ─── PASO 2: MÉTODO DE PAGO ─── */
                <div className="px-5 py-4 space-y-4">
                  <button
                    onClick={goBackToDatos}
                    className="flex items-center gap-1 text-sm text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Volver a datos
                  </button>

                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    ¿Cómo vas a pagar?
                  </h3>

                  <div className="space-y-3">
                    {/* Efectivo */}
                    <button
                      onClick={() => setPaymentMethod("efectivo")}
                      className={`w-full flex items-center gap-4 rounded-2xl border-2 p-4 transition-all ${
                        paymentMethod === "efectivo"
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      }`}
                    >
                      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                        paymentMethod === "efectivo" ? "bg-primary/10 text-primary" : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                      }`}>
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">Efectivo</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Pagas cuando recibas tu pedido</p>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                        paymentMethod === "efectivo" ? "border-primary" : "border-gray-300 dark:border-gray-600"
                      }`}>
                        {paymentMethod === "efectivo" && <div className="h-3 w-3 rounded-full bg-primary" />}
                      </div>
                    </button>

                    {/* Yape */}
                    <button
                      onClick={() => setPaymentMethod("yape")}
                      className={`w-full flex items-center gap-4 rounded-2xl border-2 p-4 transition-all ${
                        paymentMethod === "yape"
                          ? "border-[#6E2B8B] bg-[#6E2B8B]/5 ring-1 ring-[#6E2B8B]/20"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      }`}
                    >
                      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                        paymentMethod === "yape" ? "bg-[#6E2B8B]/10 text-[#6E2B8B]" : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                      }`}>
                        <span className="text-lg font-black">Y</span>
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">Yape</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Transfiere al número del vendedor</p>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                        paymentMethod === "yape" ? "border-[#6E2B8B]" : "border-gray-300 dark:border-gray-600"
                      }`}>
                        {paymentMethod === "yape" && <div className="h-3 w-3 rounded-full bg-[#6E2B8B]" />}
                      </div>
                    </button>
                  </div>

                  {/* Cash change calculator */}
                  {paymentMethod === "efectivo" && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50 space-y-2">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                        Calculadora de vuelto
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">S/</span>
                        <input
                          type="number"
                          value={cashAmount}
                          onChange={(e) => setCashAmount(e.target.value)}
                          placeholder={finalTotal.toFixed(2)}
                          min={0}
                          className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                      {cashAmount && Number(cashAmount) >= finalTotal && (
                        <div className="flex justify-between text-sm bg-green-50 dark:bg-green-950/30 rounded-lg px-3 py-2">
                          <span className="text-green-700 dark:text-green-400 font-medium">Tu vuelto:</span>
                          <span className="text-green-700 dark:text-green-400 font-bold">{fmt(Number(cashAmount) - finalTotal)}</span>
                        </div>
                      )}
                      {cashAmount && Number(cashAmount) > 0 && Number(cashAmount) < finalTotal && (
                        <p className="text-xs text-red-500">El monto no alcanza (faltan {fmt(finalTotal - Number(cashAmount))})</p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {[5, 10, 20, 50, 100].map((v) => (
                          <button
                            key={v}
                            onClick={() => setCashAmount(String(v))}
                            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            S/{v}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Yape instructions */}
                  {paymentMethod === "yape" && (
                    <div className="rounded-xl border border-[#6E2B8B]/20 bg-[#6E2B8B]/5 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6E2B8B]/10">
                          <span className="text-sm font-black text-[#6E2B8B]">Y</span>
                        </div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">Instrucciones de Yape</p>
                      </div>
                      <ol className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6E2B8B]/10 text-[length:var(--ts-2xs)] font-bold text-[#6E2B8B]">1</span>
                          <span>Confirma tu pedido aquí y recibirás el número de Yape del vendedor</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6E2B8B]/10 text-[length:var(--ts-2xs)] font-bold text-[#6E2B8B]">2</span>
                          <span>Abre tu app de Yape y transfiere <strong>{fmt(finalTotal)}</strong></span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6E2B8B]/10 text-[length:var(--ts-2xs)] font-bold text-[#6E2B8B]">3</span>
                          <span>El vendedor verificará el pago y preparará tu pedido</span>
                        </li>
                      </ol>
                    </div>
                  )}
                </div>
              ) : step === "confirmacion" ? (
                /* ─── PASO 3: CONFIRMACIÓN FINAL ─── */
                <div className="px-5 py-4 space-y-4">
                  <button
                    onClick={goBackToPago}
                    className="flex items-center gap-1 text-sm text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Volver a pago
                  </button>

                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    Resumen del pedido
                  </h3>

                  {/* Datos del cliente */}
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50 space-y-1.5">
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 mb-2">Datos de entrega</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Nombre</span>
                      <span className="font-medium text-gray-900 dark:text-white">{customerName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Teléfono</span>
                      <span className="font-medium text-gray-900 dark:text-white">{customerPhone}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Dirección</span>
                      <span className="font-medium text-gray-900 dark:text-white text-right max-w-[180px]">{customerAddress}</span>
                    </div>
                    {customerNotes && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Notas</span>
                        <span className="text-gray-700 dark:text-gray-300 text-right max-w-[180px]">{customerNotes}</span>
                      </div>
                    )}
                  </div>

                  {/* Método de pago */}
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 mb-2">Método de pago</p>
                    <div className="flex items-center gap-2">
                      {paymentMethod === "yape" ? (
                        <>
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#6E2B8B]/10">
                            <span className="text-xs font-black text-[#6E2B8B]">Y</span>
                          </div>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">Yape</span>
                        </>
                      ) : (
                        <>
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                            <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          </div>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">Efectivo</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Productos por tienda */}
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 mb-2">Productos</p>
                    {Object.keys(byStore).map((sid) => {
                      const g = byStore[sid];
                      const couponR = couponResults[g.storeSlug];
                      return (
                        <div key={sid} className="mb-2 last:mb-0">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-gray-700 dark:text-gray-300">{g.storeName}</span>
                            <span className="font-bold text-gray-900 dark:text-white">{fmt(totalByStore[sid]?.total ?? 0)}</span>
                          </div>
                          {g.items.map((item) => (
                            <div key={`${item.storeId}-${item.productId}`} className="flex justify-between text-xs text-gray-500 dark:text-gray-400 pl-2">
                              <span>{item.quantity}x {item.name}</span>
                              <span>{fmt(item.price * item.quantity)}</span>
                            </div>
                          ))}
                          {couponR?.valid && (
                            <p className="text-xs text-green-600 dark:text-green-400 pl-2 mt-0.5">✓ Cupón: -{fmt(couponR.discount)}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Totals */}
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1">
                    {(totalCouponDiscount > 0 || loyaltyDiscount > 0) && (
                      <>
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>Subtotal</span>
                          <span>{fmt(grandTotal)}</span>
                        </div>
                        {totalCouponDiscount > 0 && (
                          <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                            <span>Cupones</span>
                            <span>-{fmt(totalCouponDiscount)}</span>
                          </div>
                        )}
                        {loyaltyDiscount > 0 && (
                          <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                            <span>Puntos canjeados</span>
                            <span>-{fmt(loyaltyDiscount)}</span>
                          </div>
                        )}
                        <div className="h-px bg-primary/20 my-1" />
                      </>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-gray-900 dark:text-white">Total a pagar</span>
                      <span className="font-mono text-xl font-black text-primary">{fmt(finalTotal)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-5 py-4 space-y-6">
                  {storeIds.map((storeId) => {
                    const group = byStore[storeId];
                    const storeSub = totalByStore[storeId]?.total ?? 0;
                    return (
                      <section key={storeId} aria-label={`Productos de ${group.storeName}`}>
                        {/* encabezado tienda */}
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-black text-white"
                              style={{ background: "linear-gradient(135deg,#2563EB,#134e4a)" }}
                              aria-hidden="true"
                            >
                              {group.storeName.slice(0, 1).toUpperCase()}
                            </div>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                              {group.storeName}
                            </h3>
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              ({group.items.length} {group.items.length === 1 ? "item" : "items"})
                            </span>
                          </div>
                        </div>

                        {/* items */}
                        <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-gray-50/50 px-4 dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-800/30">
                          {group.items.map((item) => (
                            <CartItemRow
                              key={`${item.storeId}-${item.productId}`}
                              item={item}
                              onIncrease={() =>
                                updateQuantity(item.storeId, item.productId, item.quantity + 1)
                              }
                              onDecrease={() =>
                                updateQuantity(item.storeId, item.productId, item.quantity - 1)
                              }
                              onRemove={() => removeItem(item.storeId, item.productId)}
                            />
                          ))}
                        </div>

                        {/* subtotal tienda */}
                        <div className="mt-2 flex items-center justify-between px-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Subtotal {group.storeName}
                          </span>
                          <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">
                            {fmt(storeSub)}
                          </span>
                        </div>

                        {/* botón WhatsApp por tienda */}
                        <WhatsAppOrderButton
                          storeSlug={group.storeSlug}
                          storeName={group.storeName}
                          storePhone={storePhones[group.storeSlug] ?? null}
                          items={group.items.map((i) => ({
                            name: i.name,
                            quantity: i.quantity,
                            price: i.price,
                            unit: i.unit,
                          }))}
                          customerName={customerName || undefined}
                          customerAddress={customerAddress || undefined}
                          className="mt-2"
                        />
                      </section>
                    );
                  })}
                </div>
              )}
            </div>

            {/* footer con total y CTA — glassmorphism */}
            {!isEmpty && !orderSuccess && (
              <div className="border-t border-gray-200/80 px-5 py-4 dark:border-gray-800/80 bg-white/80 backdrop-blur-sm dark:bg-gray-900/80">
                {orderError && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-200/50 dark:border-red-800/30"
                  >
                    {orderError}
                  </motion.p>
                )}

                {step === "cart" ? (
                  <>
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Total
                      </span>
                      <span className="font-mono text-xl font-black text-primary dark:text-primary/90">
                        {fmt(grandTotal)}
                      </span>
                    </div>
                    <button
                      onClick={goToCheckout}
                      className="min-h-12 w-full rounded-2xl bg-primary text-sm font-bold text-white transition-all hover:bg-primary/90 hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-primary/25 focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      Continuar · {fmt(grandTotal)}
                    </button>
                    <div className="mt-2">
                      <ShareCartButton />
                    </div>
                    <p className="mt-2 text-center text-[length:var(--ts-2xs)] text-gray-400 dark:text-gray-500">
                      Se crea un pedido separado por cada tienda
                    </p>
                  </>
                ) : step === "datos" ? (
                  <button
                    onClick={goToPago}
                    className="min-h-12 w-full rounded-2xl bg-primary text-sm font-bold text-white transition-all hover:bg-primary/90 hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-primary/25 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    Elegir método de pago →
                  </button>
                ) : step === "pago" ? (
                  <button
                    onClick={goToConfirmacion}
                    className="min-h-12 w-full rounded-2xl bg-primary text-sm font-bold text-white transition-all hover:bg-primary/90 hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-primary/25 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    Revisar pedido · {fmt(finalTotal)}
                  </button>
                ) : (
                  <button
                    onClick={handleOrder}
                    disabled={isOrdering}
                    className="min-h-12 w-full rounded-2xl bg-primary text-sm font-bold text-white transition-all hover:bg-primary/90 hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-primary/25 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                  >
                    {isOrdering ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg
                          aria-hidden="true"
                          className="h-4 w-4 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Enviando pedido…
                      </span>
                    ) : (
                      `✓ Confirmar pedido · ${fmt(finalTotal)}`
                    )}
                  </button>
                )}
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
