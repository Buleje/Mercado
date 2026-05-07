"use client";

import React, { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  X,
  ChevronLeft,
  MapPin,
  Phone,
  User,
  MessageSquare,
  CreditCard,
  ShoppingBag,
  Check,
  Loader2,
  Star,
  Shield,
  Truck,
  Tag,
  Zap,
  Gift,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart, type CartItem } from "@/hooks/use-marketplace-cart";

/* ── Helpers ────────────────────────────────────────────────────── */

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

type Step = "cart" | "datos" | "envio" | "pago" | "confirmacion";

const STEPS: { key: Step; label: string; num: number }[] = [
  { key: "datos", label: "Datos", num: 1 },
  { key: "envio", label: "Envío", num: 2 },
  { key: "pago", label: "Pago", num: 3 },
  { key: "confirmacion", label: "Confirmar", num: 4 },
];

/* ── Step Indicator ──────────────────────────────────────────── */

function StepIndicator({ current }: { current: Step }) {
  const stepsArr: Step[] = ["datos", "envio", "pago", "confirmacion"];
  const currentIdx = stepsArr.indexOf(current);

  return (
    <div className="flex items-center gap-1 sm:gap-2 px-6 py-3 border-b border-gray-200/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-950/50">
      {STEPS.map(({ key, label, num }, idx) => {
        const isActive = current === key;
        const isDone = currentIdx > idx;
        return (
          <React.Fragment key={key}>
            {idx > 0 && (
              <div
                className={cn(
                  "flex-1 h-0.5 rounded-full transition-colors",
                  isDone ? "bg-primary" : "bg-gray-200 dark:bg-gray-700"
                )}
              />
            )}
            <div
              className={cn(
                "flex items-center gap-1.5 transition-colors",
                isActive
                  ? "text-primary"
                  : isDone
                    ? "text-primary/70"
                    : "text-gray-400 dark:text-gray-500"
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[length:var(--ts-2xs)] font-black transition-colors",
                  isActive
                    ? "bg-primary text-white shadow-md shadow-primary/30"
                    : isDone
                      ? "bg-primary/20 text-primary"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500"
                )}
              >
                {isDone ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  num
                )}
              </div>
              <span className="text-[length:var(--ts-2xs)] font-semibold hidden sm:inline">
                {label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ── Cart Summary Mini (sidebar in step view) ────────────────── */

function MiniCartSummary({
  items,
  byStore,
  totalByStore,
  grandTotal,
}: {
  items: CartItem[];
  byStore: Record<string, { storeName: string; storeSlug: string; items: CartItem[] }>;
  totalByStore: Record<string, { storeName: string; total: number }>;
  grandTotal: number;
}) {
  const storeIds = Object.keys(byStore);

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
          Tu pedido ({items.length} {items.length === 1 ? "producto" : "productos"})
        </span>
      </div>
      {storeIds.map((sid) => {
        const g = byStore[sid];
        return (
          <div key={sid} className="space-y-1">
            <div className="flex items-center gap-1.5">
              <div
                className="flex h-5 w-5 items-center justify-center rounded-md text-[length:var(--ts-2xs)] font-black text-white"
                style={{ background: "linear-gradient(135deg,var(--accent),#134e4a)" }}
              >
                {g.storeName.slice(0, 1).toUpperCase()}
              </div>
              <span className="text-[length:var(--ts-2xs)] font-semibold text-gray-600 dark:text-gray-400">
                {g.storeName}
              </span>
              <span className="ml-auto text-[length:var(--ts-2xs)] font-bold text-gray-900 dark:text-white">
                {fmt(totalByStore[sid]?.total ?? 0)}
              </span>
            </div>
            {g.items.map((item) => (
              <div key={`${item.storeId}-${item.productId}`} className="flex items-center gap-2 pl-6.5 text-[length:var(--ts-2xs)] text-gray-500 dark:text-gray-400">
                <span>{item.quantity}×</span>
                <span className="truncate flex-1">{item.name}</span>
                <span className="shrink-0">{fmt(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
        );
      })}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Total</span>
        <span className="font-mono text-sm font-black text-primary">{fmt(grandTotal)}</span>
      </div>
    </div>
  );
}

/* ── Main Modal ──────────────────────────────────────────────── */

export default function MarketplaceCheckoutModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const {
    items,
    byStore,
    totalByStore,
    grandTotal,
    itemCount,
    clearStore,
  } = useMarketplaceCart();

  const [step, setStep] = useState<Step>("datos");
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [orderResults, setOrderResults] = useState<
    { storeName: string; storeSlug: string; success: boolean; orderId?: string; error?: string }[]
  >([]);

  // SECURITY 2026-05-07 (audit M1 P0): pago multi-tienda con MP genera N
  // preferences (1 por tienda). Antes solo se creaba 1 preference para la
  // PRIMERA tienda y las demás N-1 nunca cobraban → vendors sin pago.
  const [mpPendingPayments, setMpPendingPayments] = useState<
    { storeName: string; storeSlug: string; orderId: string; total: number; initPoint: string }[]
  >([]);

  // Customer data
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  // Payment
  const [payMethod, setPayMethod] = useState<"efectivo" | "yape" | "mercado_pago">("efectivo");
  const [cashAmount, setCashAmount] = useState("");

  // Referral code
  const [referralCode, setReferralCode] = useState("");
  const [referralResult, setReferralResult] = useState<{ success: boolean; message: string } | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);

  // One-click checkout: detect returning customer
  const [hasSavedData, setHasSavedData] = useState(false);
  const [quickBuyMode, setQuickBuyMode] = useState(false);

  // Coupon
  const [couponCodes, setCouponCodes] = useState<Record<string, string>>({});
  const [couponResults, setCouponResults] = useState<
    Record<string, { valid: boolean; discount: number; code: string; reason?: string }>
  >({});
  const [couponLoading, setCouponLoading] = useState<Record<string, boolean>>({});

  // Loyalty
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [redeemPoints, setRedeemPoints] = useState(0);

  // Restore customer info from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem("marketplace-customer-info");
      if (saved) {
        const info = JSON.parse(saved);
        if (info.name) setName(info.name);
        if (info.phone) setPhone(info.phone);
        if (info.address) setAddress(info.address);
        if (info.reference) setReference(info.reference);
        // Detect returning customer with complete data
        if (info.name && info.phone && info.address) {
          setHasSavedData(true);
        }
      }
    } catch { /* silent */ }
  }, []);

  // Fetch loyalty points when phone changes
  useEffect(() => {
    if (!phone || phone.trim().length < 6) {
      setLoyaltyPoints(0);
      setRedeemPoints(0);
      return;
    }
    let cancelled = false;
    fetch(`/api/marketplace/loyalty?phone=${encodeURIComponent(phone.trim())}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setLoyaltyPoints(d.data?.points ?? 0);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [phone]);

  // Totals
  const totalCouponDiscount = Object.values(couponResults).reduce(
    (sum, r) => sum + (r.valid ? r.discount : 0),
    0
  );
  const loyaltyDiscount = Math.min(redeemPoints / 100, grandTotal - totalCouponDiscount);
  const finalTotal = Math.max(0, grandTotal - totalCouponDiscount - loyaltyDiscount);

  // Validate coupon
  const validateCoupon = useCallback(
    async (storeSlug: string) => {
      const code = couponCodes[storeSlug]?.trim();
      if (!code) return;
      const storeTotal = totalByStore[storeSlug]?.total ?? grandTotal;
      setCouponLoading((p) => ({ ...p, [storeSlug]: true }));
      try {
        const res = await fetch("/api/marketplace/coupons/validate", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ code, storeSlug, cartTotal: storeTotal }),
        });
        const data = await res.json();
        setCouponResults((p) => ({ ...p, [storeSlug]: data }));
      } catch {
        setCouponResults((p) => ({
          ...p,
          [storeSlug]: { valid: false, discount: 0, code, reason: "Error de conexión" },
        }));
      } finally {
        setCouponLoading((p) => ({ ...p, [storeSlug]: false }));
      }
    },
    [couponCodes, totalByStore, grandTotal]
  );

  // Navigate steps
  const goTo = (s: Step) => {
    setOrderError(null);
    setStep(s);
  };

  // Apply referral code
  const handleApplyReferral = useCallback(async () => {
    const code = referralCode.trim().toUpperCase();
    if (!code || !phone.trim()) return;
    setReferralLoading(true);
    try {
      const res = await fetch("/api/marketplace/referral/apply", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ phone: phone.trim(), code }),
      });
      const data = await res.json();
      setReferralResult(data);
    } catch {
      setReferralResult({ success: false, message: "Error de conexión" });
    } finally {
      setReferralLoading(false);
    }
  }, [referralCode, phone]);

  // Quick buy: skip to confirmation with saved data
  const handleQuickBuy = useCallback(() => {
    if (!name.trim() || !phone.trim() || !address.trim()) return;
    setQuickBuyMode(true);
    setStep("confirmacion");
  }, [name, phone, address]);

  const validateDatos = (): boolean => {
    if (!name.trim() || name.trim().length < 2) {
      setOrderError("Ingresa tu nombre (mínimo 2 caracteres)");
      return false;
    }
    if (!phone.trim() || phone.trim().length < 6) {
      setOrderError("Ingresa tu teléfono (mínimo 6 dígitos)");
      return false;
    }
    return true;
  };

  const validateEnvio = (): boolean => {
    if (!address.trim() || address.trim().length < 5) {
      setOrderError("Ingresa tu dirección de entrega (mínimo 5 caracteres)");
      return false;
    }
    return true;
  };

  const handleSubmitDatos = () => {
    if (validateDatos()) goTo("envio");
  };

  const handleSubmitEnvio = () => {
    if (validateEnvio()) goTo("pago");
  };

  const handleSubmitPago = () => {
    goTo("confirmacion");
  };

  // Place order
  const handleOrder = useCallback(async () => {
    if (itemCount === 0 || submitting) return;
    setSubmitting(true);
    setOrderError(null);
    setOrderSuccess(false);
    setOrderResults([]);

    // Persist customer info
    try {
      localStorage.setItem(
        "marketplace-customer-info",
        JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          reference: reference.trim(),
        })
      );
    } catch { /* silent */ }

    // Fire-and-forget: save cart for recovery
    const storeIds = Object.keys(byStore);
    for (const storeId of storeIds) {
      const group = byStore[storeId];
      fetch("/api/marketplace/cart/save", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          storeSlug: group.storeSlug,
          customerName: name.trim(),
          customerPhone: phone.trim(),
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
      }).catch(() => {});
    }

    // Split checkout — one order per store
    const results = await Promise.allSettled(
      storeIds.map((storeId) => {
        const group = byStore[storeId];
        const orderItems = group.items.map((i) => ({
          storeProductId: i.storeProductId,
          productId: i.productId,
          name: i.name,
          quantity: i.quantity,
          retailPrice: i.price,
          unit: i.unit ?? "unidad",
        }));
        return fetch("/api/marketplace/orders", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            storeSlug: group.storeSlug,
            customerName: name.trim(),
            customerPhone: phone.trim(),
            customerAddress: `${address.trim()}${reference.trim() ? ` (Ref: ${reference.trim()})` : ""}`,
            notes: notes.trim() || undefined,
            paymentMethod: payMethod,
            items: orderItems,
          }),
        }).then(async (r) => {
          if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            throw new Error(data.error || `Error ${r.status}`);
          }
          const data = await r.json().catch(() => ({}));
          return { storeId, orderId: data?.data?.orderId };
        });
      })
    );

    const perStoreResults = storeIds.map((storeId, idx) => {
      const group = byStore[storeId];
      const r = results[idx];
      return {
        storeName: group.storeName,
        storeSlug: group.storeSlug,
        success: r.status === "fulfilled",
        orderId: r.status === "fulfilled" ? (r.value as { storeId: string; orderId?: string }).orderId : undefined,
        error: r.status === "rejected" ? (r.reason?.message ?? "Error desconocido") : undefined,
      };
    });
    setOrderResults(perStoreResults);

    const succeeded = perStoreResults.filter((r) => r.success);
    const failed = perStoreResults.filter((r) => !r.success);

    // Clear successful stores
    for (const r of succeeded) {
      const sid = storeIds.find((id) => byStore[id]?.storeSlug === r.storeSlug);
      if (sid) clearStore(sid);
    }

    // SECURITY 2026-05-07 (audit M1): MP multi-vendor — generar N preferences,
    // 1 por tienda. Si solo hay 1 tienda, redirect directo. Si hay 2+, mostrar
    // lista de CTAs "Pagar S/X a Tienda Y" para que el cliente complete cada pago.
    // El backend (create-preference) reconstruye items desde Order.findUnique
    // para preservar invariante "totales en backend" — no se confía en cliente.
    if (payMethod === "mercado_pago" && succeeded.length > 0) {
      const succeededWithOrderId = succeeded.filter((s): s is typeof s & { orderId: string } => Boolean(s.orderId));
      try {
        const preferencePromises = succeededWithOrderId.map(async (s) => {
          const res = await fetch("/api/marketplace/payment/mercadopago/create-preference", {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              orderId: s.orderId,
              storeSlug: s.storeSlug,
              storeName: s.storeName,
              customerName: name.trim(),
              customerPhone: phone.trim(),
            }),
          });
          if (!res.ok) return null;
          const data = (await res.json()) as { initPoint?: string; total?: number };
          if (!data.initPoint) return null;
          return {
            storeName: s.storeName,
            storeSlug: s.storeSlug,
            orderId: s.orderId,
            total: data.total ?? 0,
            initPoint: data.initPoint,
          };
        });
        const preferences = (await Promise.all(preferencePromises)).filter((p): p is NonNullable<typeof p> => p !== null);

        if (preferences.length === 1) {
          // 1 tienda: redirect directo (UX original mantenida)
          window.location.href = preferences[0].initPoint;
          return;
        }
        if (preferences.length > 1) {
          // Multi-tienda: mostrar lista de pagos pendientes
          setMpPendingPayments(preferences);
          setOrderSuccess(true);
          setSubmitting(false);
          return;
        }
      } catch { /* fall through to normal success */ }
    }

    if (failed.length > 0 && succeeded.length > 0) {
      setOrderError(
        `${succeeded.length} pedidos enviados, pero ${failed.length} fallaron: ${failed[0].error}`
      );
      setOrderSuccess(true);
    } else if (failed.length > 0) {
      setOrderError(`Error: ${failed[0].error}`);
    } else {
      setOrderSuccess(true);
    }
    setSubmitting(false);
  }, [byStore, itemCount, clearStore, name, phone, address, reference, notes, payMethod, submitting]);

  // Reset on close
  const handleClose = () => {
    if (!submitting) {
      setStep("datos");
      setOrderError(null);
      setOrderSuccess(false);
      setOrderResults([]);
      setMpPendingPayments([]);
      onClose();
    }
  };

  // Close on success after delay (NO auto-close si hay pagos MP pendientes
  // — el cliente debe hacer click en cada CTA "Pagar a Tienda Y" antes de cerrar).
  useEffect(() => {
    if (orderSuccess && orderResults.every((r) => r.success) && mpPendingPayments.length === 0) {
      const timer = setTimeout(() => {
        if (!submitting) {
          setStep("datos");
          setOrderError(null);
          setOrderSuccess(false);
          setOrderResults([]);
          onClose();
        }
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [orderSuccess, orderResults, mpPendingPayments.length, submitting, onClose]);

  const storeIds = Object.keys(byStore);

  if (!isOpen || itemCount === 0) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            key="checkout-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            key="checkout-modal"
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-4 sm:inset-x-auto sm:inset-y-6 sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-lg z-50 flex flex-col bg-white dark:bg-gray-950 rounded-3xl shadow-2xl shadow-black/20 overflow-hidden border border-gray-200/50 dark:border-gray-800/50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200/80 dark:border-gray-800/80 bg-linear-to-r from-primary/5 to-transparent">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
                  <ShoppingBag className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">
                    Finalizar compra
                  </h2>
                  <p className="text-[length:var(--ts-2xs)] text-gray-500 dark:text-gray-400">
                    {itemCount} {itemCount === 1 ? "producto" : "productos"}
                    {storeIds.length > 1 ? ` · ${storeIds.length} tiendas` : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={submitting}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-all hover:bg-gray-100 hover:rotate-90 dark:hover:bg-gray-800"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Step indicator */}
            {!orderSuccess && step !== "cart" && <StepIndicator current={step} />}

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                {orderSuccess ? (
                  /* ─── SUCCESS ─── */
                  <motion.div
                    key="success"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex h-full flex-col items-center justify-center gap-4 px-8 py-12 text-center"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", delay: 0.1 }}
                      className="flex h-24 w-24 items-center justify-center rounded-3xl bg-linear-to-br from-green-100 to-emerald-50 dark:from-green-900/40 dark:to-emerald-900/20 shadow-lg shadow-green-200/50"
                    >
                      <Check className="h-12 w-12 text-green-600 dark:text-green-400" strokeWidth={2.5} />
                    </motion.div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      ¡Pedidos enviados!
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                      Cada tienda recibirá tu pedido y te contactará por WhatsApp para coordinar.
                    </p>
                    {orderResults.length > 0 && (
                      <div className="w-full max-w-xs space-y-2 mt-2">
                        {orderResults.map((r, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm",
                              r.success
                                ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                                : "bg-red-50 dark:bg-red-950/30 text-[var(--data-error-700)] dark:text-red-400"
                            )}
                          >
                            <span>{r.success ? "✓" : "✗"}</span>
                            <span className="font-semibold flex-1 text-left truncate">
                              {r.storeName}
                            </span>
                            {r.error && (
                              <span className="text-xs opacity-70 truncate max-w-30">
                                {r.error}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* SECURITY 2026-05-07 (audit M1): MP multi-vendor — N CTAs de pago */}
                    {mpPendingPayments.length > 0 && (
                      <div className="w-full max-w-xs space-y-3 mt-4">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                          Pagos pendientes ({mpPendingPayments.length}):
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Tienes pedidos en {mpPendingPayments.length} tiendas. Paga cada uno por separado:
                        </p>
                        {mpPendingPayments.map((p) => (
                          <a
                            key={p.orderId}
                            href={p.initPoint}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between gap-2 rounded-2xl border-2 border-primary bg-primary/10 hover:bg-primary/20 px-4 py-3 transition-colors"
                          >
                            <span className="font-semibold text-sm text-left text-gray-900 dark:text-white truncate">
                              {p.storeName}
                            </span>
                            <span className="font-bold text-sm text-primary whitespace-nowrap">
                              Pagar S/{Number(p.total).toFixed(2)}
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ) : step === "datos" ? (
                  /* ─── STEP 1: DATOS PERSONALES ─── */
                  <motion.div
                    key="step-datos"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="px-6 py-5 space-y-4"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <User className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        Tus datos
                      </h3>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
                      Para contactarte sobre tu pedido
                    </p>

                    {/* One-click checkout banner for returning customers */}
                    {hasSavedData && !quickBuyMode && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl border-2 border-primary/30 bg-linear-to-r from-primary/5 to-emerald-50/50 dark:from-primary/10 dark:to-emerald-950/30 p-4 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-primary" />
                          <span className="text-sm font-bold text-gray-900 dark:text-white">
                            ¡Hola de nuevo, {name.split(" ")[0]}!
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Datos guardados: {phone} · {address.slice(0, 30)}…
                        </p>
                        <button
                          onClick={handleQuickBuy}
                          className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-linear-to-r from-primary to-[var(--data-success-600)] text-white text-sm font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98] transition-all"
                        >
                          <Zap className="h-4 w-4" />
                          Comprar con un clic · {fmt(grandTotal)}
                        </button>
                        <p className="text-[length:var(--ts-2xs)] text-center text-gray-400 dark:text-gray-500">
                          Pago en efectivo · Tus datos ya están guardados
                        </p>
                      </motion.div>
                    )}

                    <div className="space-y-3">
                      <div>
                        <label htmlFor="mco-name" className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                          <User className="h-3 w-3 inline mr-1" />
                          Nombre completo *
                        </label>
                        <input
                          id="mco-name"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Ej: Juan Pérez"
                          className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          maxLength={100}
                        />
                      </div>

                      <div>
                        <label htmlFor="mco-phone" className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                          <Phone className="h-3 w-3 inline mr-1" />
                          Teléfono / WhatsApp *
                        </label>
                        <input
                          id="mco-phone"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="Ej: 916409675"
                          className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          maxLength={20}
                        />
                      </div>
                    </div>

                    {/* Loyalty points */}
                    {loyaltyPoints > 0 && (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-600 dark:text-gray-400 font-medium">
                            ⭐ Tus puntos: <strong className="text-primary">{loyaltyPoints}</strong>
                          </span>
                          <span className="text-gray-400 dark:text-gray-500">(100 pts = S/1)</span>
                        </div>
                        <div className="flex gap-2 items-center">
                          <input
                            type="number"
                            min={0}
                            max={loyaltyPoints}
                            step={100}
                            value={redeemPoints}
                            onChange={(e) =>
                              setRedeemPoints(Math.min(Number(e.target.value) || 0, loyaltyPoints))
                            }
                            className="w-24 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-xs text-gray-900 dark:text-white focus:border-primary focus:ring-1 focus:ring-primary/20"
                          />
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            = -{fmt(redeemPoints / 100)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Referral code input */}
                    <div className="rounded-xl border border-orange-200/50 dark:border-orange-800/30 bg-orange-50/50 dark:bg-orange-950/20 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Gift className="h-4 w-4 text-orange-500" />
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                          ¿Tienes código de referido?
                        </span>
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={referralCode}
                          onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                          placeholder="Ej: ABC123"
                          className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-orange-400 focus:ring-1 focus:ring-orange-400/20"
                          maxLength={10}
                          disabled={!!referralResult?.success}
                        />
                        <button
                          onClick={handleApplyReferral}
                          disabled={referralLoading || !referralCode.trim() || !phone.trim() || !!referralResult?.success}
                          className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
                        >
                          {referralLoading ? "..." : referralResult?.success ? "✓" : "Aplicar"}
                        </button>
                      </div>
                      {referralResult && (
                        <p className={cn(
                          "text-xs",
                          referralResult.success ? "text-green-600 dark:text-green-400" : "text-[var(--data-error-500)] dark:text-red-400"
                        )}>
                          {referralResult.message}
                        </p>
                      )}
                    </div>

                    {/* Mini cart summary */}
                    <MiniCartSummary
                      items={items}
                      byStore={byStore}
                      totalByStore={totalByStore}
                      grandTotal={grandTotal}
                    />
                  </motion.div>
                ) : step === "envio" ? (
                  /* ─── STEP 2: DIRECCIÓN DE ENVÍO ─── */
                  <motion.div
                    key="step-envio"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="px-6 py-5 space-y-4"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Truck className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        Dirección de entrega
                      </h3>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label htmlFor="mco-address" className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                          <MapPin className="h-3 w-3 inline mr-1" />
                          Dirección *
                        </label>
                        <input
                          id="mco-address"
                          type="text"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="Ej: Jr. Los Olivos 123, Pucallpa"
                          className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          maxLength={300}
                        />
                      </div>

                      <div>
                        <label htmlFor="mco-ref" className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                          Referencia (opcional)
                        </label>
                        <input
                          id="mco-ref"
                          type="text"
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                          placeholder="Ej: Cerca de la esquina, frente al parque"
                          className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          maxLength={200}
                        />
                      </div>

                      <div>
                        <label htmlFor="mco-notes" className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                          <MessageSquare className="h-3 w-3 inline mr-1" />
                          Notas (opcional)
                        </label>
                        <textarea
                          id="mco-notes"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Tocar el timbre, dejar en portería…"
                          rows={2}
                          className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                          maxLength={500}
                        />
                      </div>
                    </div>

                    {/* Cupones */}
                    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                          Cupones de descuento
                        </span>
                      </div>
                      {storeIds.map((sid) => {
                        const g = byStore[sid];
                        const couponR = couponResults[g.storeSlug];
                        return (
                          <div key={sid}>
                            <span className="text-[length:var(--ts-2xs)] text-gray-600 dark:text-gray-400 font-medium">
                              {g.storeName}
                            </span>
                            <div className="flex gap-1.5 mt-1">
                              <input
                                type="text"
                                value={couponCodes[g.storeSlug] ?? ""}
                                onChange={(e) =>
                                  setCouponCodes((p) => ({
                                    ...p,
                                    [g.storeSlug]: e.target.value.toUpperCase(),
                                  }))
                                }
                                placeholder="Código de cupón"
                                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-primary focus:ring-1 focus:ring-primary/20"
                                maxLength={30}
                              />
                              <button
                                onClick={() => validateCoupon(g.storeSlug)}
                                disabled={
                                  !!couponLoading[g.storeSlug] || !couponCodes[g.storeSlug]?.trim()
                                }
                                className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                              >
                                {couponLoading[g.storeSlug] ? "..." : "Aplicar"}
                              </button>
                            </div>
                            {couponR && (
                              <p
                                className={cn(
                                  "text-xs mt-1",
                                  couponR.valid
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-[var(--data-error-500)] dark:text-red-400"
                                )}
                              >
                                {couponR.valid
                                  ? `✓ -${fmt(couponR.discount)} descuento`
                                  : couponR.reason || "Cupón inválido"}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                ) : step === "pago" ? (
                  /* ─── STEP 3: MÉTODO DE PAGO ─── */
                  <motion.div
                    key="step-pago"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="px-6 py-5 space-y-4"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <CreditCard className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        ¿Cómo vas a pagar?
                      </h3>
                    </div>

                    <div className="space-y-3">
                      {/* Efectivo */}
                      <button
                        onClick={() => setPayMethod("efectivo")}
                        className={cn(
                          "w-full flex items-center gap-4 rounded-2xl border-2 p-4 transition-all",
                          payMethod === "efectivo"
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-12 w-12 items-center justify-center rounded-xl",
                            payMethod === "efectivo"
                              ? "bg-primary/10 text-primary"
                              : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                          )}
                        >
                          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                            />
                          </svg>
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-bold text-gray-900 dark:text-white">Efectivo</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Pagas cuando recibas tu pedido
                          </p>
                        </div>
                        <div
                          className={cn(
                            "h-5 w-5 rounded-full border-2 flex items-center justify-center",
                            payMethod === "efectivo" ? "border-primary" : "border-gray-300 dark:border-gray-600"
                          )}
                        >
                          {payMethod === "efectivo" && (
                            <div className="h-3 w-3 rounded-full bg-primary" />
                          )}
                        </div>
                      </button>

                      {/* Yape */}
                      <button
                        onClick={() => setPayMethod("yape")}
                        className={cn(
                          "w-full flex items-center gap-4 rounded-2xl border-2 p-4 transition-all",
                          payMethod === "yape"
                            ? "border-[#6E2B8B] bg-[#6E2B8B]/5 ring-1 ring-[#6E2B8B]/20"
                            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-12 w-12 items-center justify-center rounded-xl",
                            payMethod === "yape"
                              ? "bg-[#6E2B8B]/10 text-[#6E2B8B]"
                              : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                          )}
                        >
                          <span className="text-lg font-black">Y</span>
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-bold text-gray-900 dark:text-white">Yape</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Transfiere al número del vendedor
                          </p>
                        </div>
                        <div
                          className={cn(
                            "h-5 w-5 rounded-full border-2 flex items-center justify-center",
                            payMethod === "yape" ? "border-[#6E2B8B]" : "border-gray-300 dark:border-gray-600"
                          )}
                        >
                          {payMethod === "yape" && (
                            <div className="h-3 w-3 rounded-full bg-[#6E2B8B]" />
                          )}
                        </div>
                      </button>

                      {/* Mercado Pago */}
                      <button
                        onClick={() => setPayMethod("mercado_pago")}
                        className={cn(
                          "w-full flex items-center gap-4 rounded-2xl border-2 p-4 transition-all",
                          payMethod === "mercado_pago"
                            ? "border-[#009ee3] bg-[#009ee3]/5 ring-1 ring-[#009ee3]/20"
                            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-12 w-12 items-center justify-center rounded-xl",
                            payMethod === "mercado_pago"
                              ? "bg-[#009ee3]/10 text-[#009ee3]"
                              : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                          )}
                        >
                          <CreditCard className="h-6 w-6" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-bold text-gray-900 dark:text-white">Mercado Pago</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Tarjeta, transferencia o saldo MP
                          </p>
                        </div>
                        <div
                          className={cn(
                            "h-5 w-5 rounded-full border-2 flex items-center justify-center",
                            payMethod === "mercado_pago" ? "border-[#009ee3]" : "border-gray-300 dark:border-gray-600"
                          )}
                        >
                          {payMethod === "mercado_pago" && (
                            <div className="h-3 w-3 rounded-full bg-[#009ee3]" />
                          )}
                        </div>
                      </button>
                    </div>

                    {/* Cash calculator */}
                    {payMethod === "efectivo" && (
                      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-4 space-y-2">
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                          Calculadora de vuelto
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">S/</span>
                          <input
                            type="number"
                            value={cashAmount}
                            onChange={(e) => setCashAmount(e.target.value)}
                            placeholder={finalTotal.toFixed(2)}
                            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-primary focus:ring-1 focus:ring-primary/20"
                          />
                        </div>
                        {cashAmount && Number(cashAmount) >= finalTotal && (
                          <div className="flex justify-between text-sm bg-green-50 dark:bg-green-950/30 rounded-lg px-3 py-2">
                            <span className="text-green-700 dark:text-green-400 font-medium">Tu vuelto:</span>
                            <span className="text-green-700 dark:text-green-400 font-bold">
                              {fmt(Number(cashAmount) - finalTotal)}
                            </span>
                          </div>
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

                    {payMethod === "yape" && (
                      <div className="rounded-xl border border-[#6E2B8B]/20 bg-[#6E2B8B]/5 p-4 space-y-3">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                          Instrucciones de Yape
                        </p>
                        <ol className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
                          <li className="flex items-start gap-2">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6E2B8B]/10 text-[length:var(--ts-2xs)] font-bold text-[#6E2B8B]">1</span>
                            <span>Confirma aquí y te enviaremos el número de Yape</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6E2B8B]/10 text-[length:var(--ts-2xs)] font-bold text-[#6E2B8B]">2</span>
                            <span>Transfiere <strong>{fmt(finalTotal)}</strong> por Yape</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6E2B8B]/10 text-[length:var(--ts-2xs)] font-bold text-[#6E2B8B]">3</span>
                            <span>El vendedor verificará y preparará tu pedido</span>
                          </li>
                        </ol>
                      </div>
                    )}

                    {payMethod === "mercado_pago" && (
                      <div className="rounded-xl border border-[#009ee3]/20 bg-[#009ee3]/5 p-4 space-y-3">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                          Pago con Mercado Pago
                        </p>
                        <ol className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
                          <li className="flex items-start gap-2">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#009ee3]/10 text-[length:var(--ts-2xs)] font-bold text-[#009ee3]">1</span>
                            <span>Al confirmar, te redirigiremos a Mercado Pago</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#009ee3]/10 text-[length:var(--ts-2xs)] font-bold text-[#009ee3]">2</span>
                            <span>Elige: tarjeta, transferencia o saldo de Mercado Pago</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#009ee3]/10 text-[length:var(--ts-2xs)] font-bold text-[#009ee3]">3</span>
                            <span>El vendedor recibirá el pago y preparará tu pedido</span>
                          </li>
                        </ol>
                        <p className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                          <Shield className="h-3 w-3" /> Pago 100% seguro con encriptación
                        </p>
                      </div>
                    )}
                  </motion.div>
                ) : step === "confirmacion" ? (
                  /* ─── STEP 4: CONFIRMACIÓN FINAL ─── */
                  <motion.div
                    key="step-confirm"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="px-6 py-5 space-y-4"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        Confirma tu pedido
                      </h3>
                    </div>

                    {/* Summary: customer data */}
                    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-4 space-y-2">
                      <p className="text-xs font-bold text-gray-500 dark:text-gray-400">📍 Entrega</p>
                      <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
                        <span className="text-gray-500">Nombre</span>
                        <span className="font-medium text-gray-900 dark:text-white">{name}</span>
                        <span className="text-gray-500">Teléfono</span>
                        <span className="font-medium text-gray-900 dark:text-white">{phone}</span>
                        <span className="text-gray-500">Dirección</span>
                        <span className="font-medium text-gray-900 dark:text-white">{address}</span>
                        {reference && (
                          <>
                            <span className="text-gray-500">Referencia</span>
                            <span className="text-gray-700 dark:text-gray-300">{reference}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Summary: payment */}
                    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-4">
                      <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">💳 Pago</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white capitalize">
                          {payMethod === "yape" ? "Yape" : payMethod === "mercado_pago" ? "Mercado Pago" : "Efectivo"}
                        </span>
                      </div>
                    </div>

                    {/* Summary: products per store */}
                    <MiniCartSummary
                      items={items}
                      byStore={byStore}
                      totalByStore={totalByStore}
                      grandTotal={grandTotal}
                    />

                    {/* Discounts + final total */}
                    <div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4 space-y-1">
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
                              <span>Puntos</span>
                              <span>-{fmt(loyaltyDiscount)}</span>
                            </div>
                          )}
                          <div className="h-px bg-primary/20 my-1" />
                        </>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                          Total a pagar
                        </span>
                        <span className="font-mono text-xl font-black text-primary">
                          {fmt(finalTotal)}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {/* Footer CTA */}
            {!orderSuccess && (
              <div className="border-t border-gray-200/80 dark:border-gray-800/80 px-6 py-4 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm">
                {orderError && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-3 rounded-xl bg-red-50 dark:bg-red-950/20 px-4 py-2 text-xs text-[var(--data-error-700)] dark:text-red-400 border border-red-200/50 dark:border-red-800/30"
                  >
                    {orderError}
                  </motion.p>
                )}

                <div className="flex items-center gap-3">
                  {step !== "datos" && (
                    <button
                      onClick={() => {
                        if (quickBuyMode) {
                          setQuickBuyMode(false);
                          goTo("datos");
                          return;
                        }
                        const prev: Record<Step, Step> = {
                          cart: "cart",
                          datos: "datos",
                          envio: "datos",
                          pago: "envio",
                          confirmacion: "pago",
                        };
                        goTo(prev[step]);
                      }}
                      className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (step === "datos") handleSubmitDatos();
                      else if (step === "envio") handleSubmitEnvio();
                      else if (step === "pago") handleSubmitPago();
                      else if (step === "confirmacion") handleOrder();
                    }}
                    disabled={submitting}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 h-12 rounded-xl font-bold text-sm transition-all",
                      step === "confirmacion"
                        ? "bg-linear-to-r from-primary to-[var(--data-success-600)] text-white shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 active:scale-[0.98]"
                        : "bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/25 active:scale-[0.98]",
                      submitting && "opacity-70 pointer-events-none"
                    )}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Procesando…
                      </>
                    ) : step === "datos" ? (
                      "Continuar a envío →"
                    ) : step === "envio" ? (
                      "Continuar a pago →"
                    ) : step === "pago" ? (
                      "Revisar pedido →"
                    ) : (
                      <>
                        <ShoppingBag className="h-4 w-4" />
                        Confirmar pedido · {fmt(finalTotal)}
                      </>
                    )}
                  </button>
                </div>

                {/* Trust badges */}
                <div className="flex items-center justify-center gap-4 mt-3 text-[length:var(--ts-2xs)] text-gray-400 dark:text-gray-500">
                  <span className="flex items-center gap-1">
                    <Shield className="h-3 w-3" /> Compra segura
                  </span>
                  <span className="flex items-center gap-1">
                    <Truck className="h-3 w-3" /> Delivery rápido
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3" /> +100 ventas
                  </span>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
