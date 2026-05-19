"use client";

/**
 * AddedToCartDrawer — nombre legacy. Hoy renderea un MODAL CENTRAL
 * de detalle de producto al agregar al carrito (no un drawer lateral).
 *
 * Razon: el flujo viejo abria un sidebar derecho al agregar y otro sidebar al
 * clickear el carrito — confuso y duplicado. Ahora hay 2 superficies separadas:
 *   1. AGREGAR producto -> MODAL CENTRAL (este componente) con detalle.
 *   2. VER CARRITO -> sidebar lateral (MarketplaceCart) abierto desde el navbar.
 *
 * El boton "Ver mi carrito" del modal dispara `window.dispatchEvent(
 * new CustomEvent("buleje:open-cart"))` que el navbar escucha y abre el sidebar.
 *
 * Se mantienen los exports `AddedToCartDrawerProvider` + `useAddedToCartDrawer`
 * con la misma API ({ open(snapshot), close() }) para no romper callsites
 * (use-cart-with-undo, MarketplaceContent).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "framer-motion";
import {
  X,
  Check,
  Minus,
  Plus,
  ShoppingCart,
  ShoppingBag,
  ArrowRight,
  Store,
  ExternalLink,
  Pencil,
  Sparkles,
  Truck,
  Zap,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import {
  useMarketplaceCart,
  type CartItem,
} from "@/hooks/use-marketplace-cart";

/* ── Tipo del producto que se acaba de agregar ──────────────────────────── */
export interface AddedProductSnapshot {
  storeId: string;
  storeName: string;
  storeSlug: string;
  productId: number;
  storeProductId: string;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
  description?: string | null;
  variations?: Array<{ label: string; value: string }>;
}

/* ── Context ────────────────────────────────────────────────────────────── */
interface DrawerCtx {
  open: (product: AddedProductSnapshot) => void;
  close: () => void;
}

const DrawerContext = createContext<DrawerCtx | null>(null);

export function useAddedToCartDrawer(): DrawerCtx {
  const ctx = useContext(DrawerContext);
  if (!ctx) {
    return { open: () => {}, close: () => {} };
  }
  return ctx;
}

/* ── Provider + Modal ───────────────────────────────────────────────────── */
export function AddedToCartDrawerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [product, setProduct] = useState<AddedProductSnapshot | null>(null);
  const [visible, setVisible] = useState(false);
  const { items, updateQuantity, removeItem } = useMarketplaceCart();

  const open = useCallback((p: AddedProductSnapshot) => {
    setProduct(p);
    setVisible(true);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
  }, []);

  // Escape cierra
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, close]);

  // Lock body scroll
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  // Derivar item live del cart para mostrar la cantidad real
  const liveItem: CartItem | null = useMemo(() => {
    if (!product) return null;
    return (
      items.find(
        (i) =>
          i.storeId === product.storeId && i.productId === product.productId,
      ) ?? null
    );
  }, [items, product]);

  const qty = liveItem?.quantity ?? 1;

  const subtotal = useMemo(
    () => items.reduce((acc, i) => acc + i.price * i.quantity, 0),
    [items],
  );
  const cartCount = useMemo(
    () => items.reduce((acc, i) => acc + i.quantity, 0),
    [items],
  );

  const ctx = useMemo<DrawerCtx>(() => ({ open, close }), [open, close]);

  const handleInc = useCallback(() => {
    if (!product) return;
    updateQuantity(product.storeId, product.productId, qty + 1);
  }, [product, qty, updateQuantity]);

  const handleDec = useCallback(() => {
    if (!product) return;
    if (qty <= 1) {
      removeItem(product.storeId, product.productId);
      close();
      return;
    }
    updateQuantity(product.storeId, product.productId, qty - 1);
  }, [product, qty, updateQuantity, removeItem, close]);

  const handleGoToCart = useCallback(() => {
    close();
    router.push("/marketplace/carrito");
  }, [close, router]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
    }).format(n);

  const productDetailHref = product
    ? `/marketplace/${product.storeSlug}/producto/${product.productId}`
    : "#";

  // Progress hacia delivery gratis (threshold S/30 — alinea con StorePolicies).
  // Funciona como "gamification" del checkout: si todavía falta poco, el cliente
  // suele añadir un acompañamiento adicional para alcanzarlo.
  const FREE_DELIVERY_THRESHOLD = 30;
  const remainingForFree = Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal);
  const progressPct = Math.min(100, (subtotal / FREE_DELIVERY_THRESHOLD) * 100);
  const hasFreeDelivery = subtotal >= FREE_DELIVERY_THRESHOLD;

  return (
    <DrawerContext.Provider value={ctx}>
      {children}

      <AnimatePresence>
        {visible && product && (
          <>
            {/* Overlay */}
            <m.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={close}
              className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-sm"
              aria-hidden="true"
            />

            {/* Wrapper — bottom-sheet en mobile, modal centrado en desktop */}
            <div
              className="fixed inset-0 z-[61] flex items-end sm:items-center justify-center sm:p-6 pointer-events-none"
              aria-hidden="true"
            >
              <m.div
                key="modal"
                initial={{ opacity: 0, y: 80, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 50, scale: 0.97 }}
                transition={{ type: "spring", damping: 28, stiffness: 360 }}
                role="dialog"
                aria-labelledby="added-modal-title"
                aria-modal="true"
                className={cn(
                  "relative pointer-events-auto",
                  // Sheet en mobile (esquinas top redondeadas pronunciadas),
                  // modal centrado en sm+ (max-w-md para mantener foco).
                  "w-full max-w-md sm:max-w-lg flex flex-col",
                  "bg-[var(--surface-raised)]",
                  "rounded-t-[32px] sm:rounded-[32px] overflow-hidden",
                  "shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.28)] sm:shadow-[0_30px_80px_-12px_rgba(0,0,0,0.35)]",
                  "ring-1 ring-black/5",
                  "max-h-[94vh] sm:max-h-[90vh]",
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {/* ───── HERO: banner brand con celebración ──────────── */}
                <div
                  className={cn(
                    "relative px-5 sm:px-7 pt-5 sm:pt-7 pb-7 sm:pb-8 overflow-hidden",
                    "bg-gradient-to-br from-[var(--brand-primary)] via-[var(--brand-primary)] to-[color-mix(in_oklab,var(--brand-primary)_60%,#0a0a0a_40%)]",
                  )}
                >
                  {/* Confetti orbs — celebración sin emojis */}
                  <m.span
                    aria-hidden
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 0.35, scale: 1 }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                    className="absolute -top-6 -right-6 h-32 w-32 rounded-full bg-white/15 blur-2xl"
                  />
                  <m.span
                    aria-hidden
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 0.25, scale: 1 }}
                    transition={{ duration: 0.6, delay: 0.18 }}
                    className="absolute -bottom-10 -left-8 h-28 w-28 rounded-full bg-white/12 blur-2xl"
                  />
                  {/* Drag handle (mobile sheet) */}
                  <div className="sm:hidden absolute top-2 left-0 right-0 flex justify-center" aria-hidden>
                    <span className="h-1.5 w-12 rounded-full bg-white/40" />
                  </div>

                  <button
                    onClick={close}
                    aria-label="Cerrar"
                    className="absolute right-3 sm:right-4 top-3 sm:top-4 h-10 w-10 inline-flex items-center justify-center rounded-full bg-white/15 backdrop-blur-sm text-white hover:bg-white/25 transition-all active:scale-90"
                  >
                    <X className="h-5 w-5" strokeWidth={2.5} />
                  </button>

                  {/* Check celebrante grande con doble pulse */}
                  <div className="relative inline-flex items-center justify-center">
                    <span className="relative inline-flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center">
                      <m.span
                        aria-hidden
                        className="absolute inset-0 rounded-full bg-white/40"
                        initial={{ scale: 0.5, opacity: 0.9 }}
                        animate={{ scale: 2, opacity: 0 }}
                        transition={{ duration: 1.1, ease: "easeOut", repeat: 1, repeatDelay: 0.3 }}
                      />
                      <m.span
                        aria-hidden
                        className="absolute inset-0 rounded-full bg-white/25"
                        initial={{ scale: 0.5, opacity: 0.7 }}
                        animate={{ scale: 1.7, opacity: 0 }}
                        transition={{ duration: 1.0, ease: "easeOut", delay: 0.15 }}
                      />
                      <m.span
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", damping: 14, stiffness: 320, delay: 0.05 }}
                        className="relative h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-white inline-flex items-center justify-center shadow-2xl"
                      >
                        <Check className="h-8 w-8 sm:h-10 sm:w-10 text-[var(--brand-primary)]" strokeWidth={3.5} aria-hidden />
                      </m.span>
                    </span>
                  </div>

                  <div className="relative mt-4 sm:mt-5">
                    <p className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-[length:var(--ts-2xs,11px)] font-black uppercase tracking-[0.14em] text-white">
                      <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                      ¡Lo tenés!
                    </p>
                    <h2
                      id="added-modal-title"
                      className="mt-2 text-[length:clamp(1.625rem,5vw,2rem)] font-black text-white leading-[1.05] tracking-tight"
                    >
                      Listo, va a tu carrito
                    </h2>
                  </div>
                </div>

                {/* ───── BODY scrollable ──────────────────────────────── */}
                <div className="flex-1 overflow-y-auto px-5 sm:px-7 pt-5 pb-4 -mt-4 sm:-mt-5">
                  {/* Card producto — flotando sobre el hero (-mt) */}
                  <m.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1, duration: 0.4 }}
                    className="relative rounded-3xl bg-[var(--surface-raised)] ring-1 ring-[var(--rule-soft)] shadow-xl shadow-black/5 p-4 sm:p-5 flex gap-4 sm:gap-5"
                  >
                    {/* Imagen producto — grande y prominente */}
                    <m.div
                      initial={{ scale: 0.85, rotate: -4, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      transition={{ delay: 0.15, type: "spring", damping: 16, stiffness: 280 }}
                      className="relative h-28 w-28 sm:h-32 sm:w-32 shrink-0 rounded-2xl overflow-hidden bg-gradient-to-br from-[var(--brand-primary)]/25 to-[var(--brand-secondary)]/15 ring-2 ring-white shadow-lg"
                    >
                      {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.image}
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <span className="text-5xl sm:text-6xl font-black text-[var(--brand-primary)]/55 leading-none">
                            {product.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      {/* Badge "1x" superpuesto al ítem */}
                      <span className="absolute top-1.5 right-1.5 inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-full bg-[var(--brand-primary)] text-white text-[length:var(--ts-xs)] font-black tabular-nums shadow-md ring-2 ring-white">
                        ×{qty}
                      </span>
                    </m.div>

                    {/* Info producto */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                      {product.storeName && (
                        <Link
                          href={`/marketplace/${product.storeSlug}`}
                          className="inline-flex items-center gap-1.5 self-start max-w-full rounded-full bg-[var(--surface-sunken)] ring-1 ring-[var(--rule-base)] px-2.5 py-1 text-[length:var(--ts-2xs,11px)] font-black uppercase tracking-[0.08em] text-[var(--text-secondary)] hover:ring-[var(--brand-primary)]/40 hover:text-[var(--brand-primary)] transition-colors"
                        >
                          <Store className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
                          <span className="truncate">{product.storeName}</span>
                        </Link>
                      )}

                      <h3 className="mt-1.5 text-[length:var(--ts-lg)] sm:text-[length:var(--ts-xl)] font-black leading-[1.15] text-[var(--text-primary)] line-clamp-2 tracking-tight">
                        {product.name}
                      </h3>

                      <div className="mt-1.5 flex items-baseline gap-1.5 flex-wrap">
                        <p className="text-[length:clamp(1.75rem,5.5vw,2.25rem)] font-black text-[var(--brand-primary)] tabular-nums leading-none">
                          {fmt(product.price)}
                        </p>
                        {product.unit && (
                          <span className="text-[length:var(--ts-xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                            / {product.unit}
                          </span>
                        )}
                      </div>
                    </div>
                  </m.div>

                  {/* ── Stepper cantidad — táctil enorme ───────────── */}
                  <div className="mt-4 flex items-center gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[length:var(--ts-2xs,11px)] font-black uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                        Cantidad · Subtotal
                      </p>
                      <p className="mt-0.5 text-[length:var(--ts-xl)] sm:text-[length:var(--ts-2xl)] font-black tabular-nums text-[var(--text-primary)] leading-none">
                        {fmt(product.price * qty)}
                      </p>
                    </div>
                    <div className="flex items-center rounded-2xl bg-[var(--brand-primary)]/8 ring-2 ring-[var(--brand-primary)]/20 overflow-hidden">
                      <button
                        type="button"
                        onClick={handleDec}
                        aria-label={qty <= 1 ? "Quitar del carrito" : "Reducir cantidad"}
                        className="h-12 w-12 sm:h-14 sm:w-14 inline-flex items-center justify-center text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/15 transition-colors active:scale-85"
                      >
                        <Minus className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={3} />
                      </button>
                      <span
                        aria-live="polite"
                        className="min-w-[3.5rem] sm:min-w-[4rem] text-center text-[length:var(--ts-2xl)] font-black tabular-nums text-[var(--text-primary)]"
                      >
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={handleInc}
                        aria-label="Aumentar cantidad"
                        className="h-12 w-12 sm:h-14 sm:w-14 inline-flex items-center justify-center text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/15 transition-colors active:scale-85"
                      >
                        <Plus className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={3} />
                      </button>
                    </div>
                  </div>

                  {/* Variaciones */}
                  {product.variations && product.variations.length > 0 && (
                    <div className="mt-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                      <div className="flex items-center justify-between mb-2.5">
                        <p className="text-[length:var(--ts-2xs,11px)] font-black uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                          Lo que elegiste
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            if (typeof window !== "undefined") {
                              window.dispatchEvent(
                                new CustomEvent("buleje:reedit-modifiers", {
                                  detail: {
                                    storeId: product.storeId,
                                    productId: product.productId,
                                  },
                                }),
                              );
                            }
                            close();
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--accent)]/30 bg-[var(--accent-soft,color-mix(in_oklab,var(--accent)_8%,transparent))] px-3 h-9 text-[length:var(--ts-xs)] font-extrabold text-[var(--accent)] hover:bg-[var(--accent)]/15 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />
                          Editar
                        </button>
                      </div>
                      <ul className="space-y-1.5">
                        {product.variations.map((v, i) => (
                          <li
                            key={`${v.label}-${i}`}
                            className="flex items-center justify-between gap-3 text-[length:var(--ts-sm)]"
                          >
                            <span className="font-semibold text-[var(--text-tertiary)]">
                              {v.label}
                            </span>
                            <span className="font-extrabold text-[var(--text-primary)] text-right">
                              {v.value}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* ── Progress bar: faltan S/X para delivery GRATIS ─── */}
                  <m.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className={cn(
                      "mt-3 rounded-2xl p-3.5 sm:p-4 ring-2",
                      hasFreeDelivery
                        ? "bg-[var(--data-success-500)]/10 ring-[var(--data-success-500)]/30"
                        : "bg-[var(--data-warning-500,#f97316)]/8 ring-[var(--data-warning-500,#f97316)]/25",
                    )}
                  >
                    <div className="flex items-center gap-2.5 mb-2">
                      <span
                        className={cn(
                          "inline-flex h-9 w-9 items-center justify-center rounded-xl shrink-0",
                          hasFreeDelivery
                            ? "bg-[var(--data-success-500)] text-white"
                            : "bg-[var(--data-warning-500,#f97316)]/15 text-[var(--data-warning-500,#f97316)]",
                        )}
                      >
                        <Truck className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                      </span>
                      <div className="flex-1 min-w-0">
                        {hasFreeDelivery ? (
                          <p className="text-[length:var(--ts-sm)] sm:text-[length:var(--ts-base)] font-black text-[var(--data-success-500)] leading-tight inline-flex items-center gap-1.5">
                            <Zap className="h-4 w-4 shrink-0" strokeWidth={2.75} aria-hidden />
                            ¡Tenés delivery GRATIS!
                          </p>
                        ) : (
                          <p className="text-[length:var(--ts-sm)] sm:text-[length:var(--ts-base)] font-black text-[var(--text-primary)] leading-tight">
                            Faltan{" "}
                            <span className="tabular-nums text-[var(--data-warning-500,#f97316)]">
                              {fmt(remainingForFree)}
                            </span>{" "}
                            para delivery <span className="text-[var(--data-success-500)]">GRATIS</span>
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="relative h-2.5 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                      <m.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPct}%` }}
                        transition={{ delay: 0.25, duration: 0.7, ease: "easeOut" }}
                        className={cn(
                          "absolute inset-y-0 left-0 rounded-full",
                          hasFreeDelivery
                            ? "bg-gradient-to-r from-[var(--data-success-500)] to-[var(--brand-primary)]"
                            : "bg-gradient-to-r from-[var(--data-warning-500,#f97316)] via-[var(--brand-secondary)] to-[var(--brand-primary)]",
                        )}
                      />
                    </div>
                  </m.div>

                  {/* Link "Ver ficha completa" — Brandon 2026-05-18 v5: oculto
                      en mobile (xs), solo desktop. En cel el cliente no
                      necesita salirse del flujo de compra para ver detalles
                      adicionales — todo lo importante ya está en el card. */}
                  <Link
                    href={productDetailHref}
                    onClick={close}
                    className="hidden sm:inline-flex mt-3 items-center gap-1.5 text-[length:var(--ts-sm)] font-bold text-[var(--accent)] hover:underline"
                  >
                    Ver ficha completa
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                  </Link>
                </div>

                {/* ───── FOOTER STICKY ──────────────────────────────────
                    Brandon 2026-05-18 v5: simplificado a UN solo botón.
                    Antes había "Pagar ahora" + "Seguir comprando" (2 CTAs)
                    que desviaban al checkout o cerraban el drawer. Brandon
                    quiere flujo más comercial: el cliente ya agregó al
                    carrito (eso dice el header "Listo, va a tu carrito"),
                    así que el botón solo confirma "Listo" y cierra el
                    drawer — el cliente sigue comprando naturalmente.
                    El resumen del pedido (count + subtotal) sigue visible
                    para context, pero ya no compite con el CTA grande. */}
                <div
                  className="border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] px-5 sm:px-7 pt-3"
                  style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
                >
                  {/* Resumen del carrito — compacto, sin competir con CTA */}
                  <div className="flex items-center justify-between gap-3 mb-2.5">
                    <div className="inline-flex items-center gap-2.5 min-w-0">
                      <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-primary)]/12 text-[var(--brand-primary)] shrink-0">
                        <ShoppingBag className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-[var(--brand-primary)] text-white text-[length:var(--ts-2xs,11px)] font-black tabular-nums ring-2 ring-[var(--surface-raised)]">
                          {cartCount}
                        </span>
                      </span>
                      <p className="text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] leading-tight">
                        {cartCount} {cartCount === 1 ? "producto" : "productos"} en tu pedido
                      </p>
                    </div>
                    <p className="text-xl font-black tabular-nums text-[var(--text-primary)] leading-none">
                      {fmt(subtotal)}
                    </p>
                  </div>

                  {/* CTA único — "Listo, seguir agregando" cierra el drawer
                      y deja al cliente en la tienda. Estilo gradient accent
                      con halo animado mantenido (alta visibilidad). */}
                  <m.button
                    type="button"
                    onClick={close}
                    whileTap={{ scale: 0.97 }}
                    className={cn(
                      "relative w-full inline-flex items-center justify-center gap-2.5 rounded-2xl px-5 h-13",
                      "text-sm font-extrabold uppercase tracking-wide",
                      "bg-gradient-to-r from-[var(--brand-primary)] via-[var(--brand-primary)] to-[color-mix(in_oklab,var(--brand-primary)_70%,#0a0a0a_30%)] text-white",
                      "shadow-[0_12px_28px_-8px_color-mix(in_oklab,var(--brand-primary)_60%,transparent)]",
                      "hover:shadow-[0_18px_36px_-8px_color-mix(in_oklab,var(--brand-primary)_70%,transparent)] hover:brightness-110",
                      "transition-all ring-1 ring-inset ring-white/20",
                      "overflow-hidden",
                    )}
                    style={{ height: "3.25rem" }}
                  >
                    {/* Halo animado */}
                    <m.span
                      aria-hidden
                      className="absolute inset-y-0 -left-20 w-20 bg-white/20 skew-x-[-20deg] pointer-events-none"
                      animate={{ x: ["0%", "550%"] }}
                      transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }}
                    />
                    <Check className="h-5 w-5 relative" strokeWidth={2.75} aria-hidden />
                    <span className="relative">Listo, seguir comprando</span>
                  </m.button>

                  {/* Link discreto al carrito — solo para clientes que SÍ
                      quieren ir a pagar. No es CTA primario. */}
                  <button
                    type="button"
                    onClick={handleGoToCart}
                    className="mt-2 w-full inline-flex items-center justify-center gap-1.5 h-10 text-[length:var(--ts-xs)] font-bold text-[var(--text-tertiary)] hover:text-[var(--brand-primary)] transition-colors"
                  >
                    Ver mi carrito
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                  </button>
                </div>
              </m.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </DrawerContext.Provider>
  );
}
