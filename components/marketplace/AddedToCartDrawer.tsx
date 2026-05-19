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
                {/* ───── HEADER COMPACTO ─────────────────────────────────
                    Brandon 2026-05-18 v6 — rediseño opción A "compacto sin
                    hero grande". Antes: hero verde gigante con check
                    celebratorio + "¡LO TENÉS!" + "Listo, va a tu carrito"
                    (ocupaba ~25% del modal). Ahora: header sutil con drag
                    handle + check verde inline + título + close.
                    Resultado: 40% menos alto vertical, más elegante. */}
                <div className="relative shrink-0 px-5 sm:px-6 pt-5 sm:pt-6 pb-3">
                  {/* Drag handle (mobile sheet) */}
                  <div className="sm:hidden absolute top-1.5 left-0 right-0 flex justify-center" aria-hidden>
                    <span className="h-1 w-10 rounded-full bg-[var(--text-tertiary)]/30" />
                  </div>

                  <div className="flex items-center justify-between gap-3 mt-1 sm:mt-0">
                    <div className="inline-flex items-center gap-2.5 min-w-0">
                      <m.span
                        initial={{ scale: 0, rotate: -25 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", damping: 14, stiffness: 380 }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--data-success-500)] text-white shadow-md shadow-[var(--data-success-500)]/30 shrink-0"
                        aria-hidden
                      >
                        <Check className="h-5 w-5" strokeWidth={3.25} />
                      </m.span>
                      <h2
                        id="added-modal-title"
                        className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--text-primary)] leading-tight"
                      >
                        Agregado al carrito
                      </h2>
                    </div>
                    <button
                      onClick={close}
                      aria-label="Cerrar"
                      className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)] hover:text-[var(--text-primary)] transition-colors active:scale-95"
                    >
                      <X className="h-4 w-4" strokeWidth={2.75} />
                    </button>
                  </div>
                </div>

                {/* Separator sutil */}
                <div aria-hidden className="mx-5 sm:mx-6 h-px bg-[var(--rule-soft)]" />

                {/* ───── BODY scrollable ──────────────────────────────── */}
                <div className="flex-1 overflow-y-auto px-5 sm:px-6 pt-3 pb-4">
                  {/* Card producto — HORIZONTAL compacto (no flotando) */}
                  <m.div
                    initial={{ y: 12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.08, duration: 0.3 }}
                    className="relative rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3 flex gap-3 items-stretch"
                  >
                    {/* Imagen 80×80 con badge qty inline */}
                    <div className="relative h-20 w-20 shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-[var(--brand-primary)]/20 to-[var(--brand-secondary)]/10 ring-1 ring-[var(--rule-soft)]">
                      {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.image}
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <span className="text-2xl font-black text-[var(--brand-primary)]/55 leading-none">
                            {product.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      {/* Badge qty top-right */}
                      <span className="absolute top-1 right-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-[var(--brand-primary)] text-white text-[length:var(--ts-2xs,10px)] font-black tabular-nums shadow-sm ring-1 ring-white/90">
                        ×{qty}
                      </span>
                    </div>

                    {/* Info producto inline */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                      {product.storeName && (
                        <Link
                          href={`/marketplace/${product.storeSlug}`}
                          className="inline-flex items-center gap-1 self-start max-w-full text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-[0.06em] text-[var(--text-tertiary)] hover:text-[var(--brand-primary)] transition-colors"
                        >
                          <Store className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
                          <span className="truncate">{product.storeName}</span>
                        </Link>
                      )}

                      <h3 className="mt-0.5 text-sm sm:text-base font-extrabold leading-[1.2] text-[var(--text-primary)] line-clamp-2">
                        {product.name}
                      </h3>

                      <div className="mt-0.5 flex items-baseline gap-1">
                        <p className="text-base sm:text-lg font-black text-[var(--brand-primary)] tabular-nums leading-none">
                          {fmt(product.price)}
                        </p>
                        {product.unit && (
                          <span className="text-[length:var(--ts-2xs,11px)] font-bold text-[var(--text-tertiary)]">
                            /{product.unit}
                          </span>
                        )}
                      </div>
                    </div>
                  </m.div>

                  {/* ── Stepper cantidad — más compacto inline ───────── */}
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[length:var(--ts-2xs,10px)] font-extrabold uppercase tracking-[0.08em] text-[var(--text-tertiary)] leading-none">
                        Subtotal
                      </p>
                      <p className="mt-1 text-base font-black tabular-nums text-[var(--text-primary)] leading-none">
                        {fmt(product.price * qty)}
                      </p>
                    </div>
                    <div className="flex items-center rounded-full bg-[var(--brand-primary)]/8 ring-1 ring-[var(--brand-primary)]/20 overflow-hidden shrink-0">
                      <button
                        type="button"
                        onClick={handleDec}
                        aria-label={qty <= 1 ? "Quitar del carrito" : "Reducir cantidad"}
                        className="h-10 w-10 inline-flex items-center justify-center text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/15 transition-colors active:scale-85"
                      >
                        <Minus className="h-4 w-4" strokeWidth={2.75} />
                      </button>
                      <span
                        aria-live="polite"
                        className="min-w-[2.5rem] text-center text-base font-black tabular-nums text-[var(--text-primary)]"
                      >
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={handleInc}
                        aria-label="Aumentar cantidad"
                        className="h-10 w-10 inline-flex items-center justify-center text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/15 transition-colors active:scale-85"
                      >
                        <Plus className="h-4 w-4" strokeWidth={2.75} />
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

                  {/* ── Delivery status — PILL compacto en lugar del banner
                      grande con progress bar. Brandon 2026-05-18 v6 opción A:
                      pill inline una sola línea, mucho menos vertical. La
                      progress bar se mantiene pero más delgada (h-1 vs h-2.5
                      anterior) y SOLO cuando NO hay delivery free aún. */}
                  <div
                    className={cn(
                      "mt-3 rounded-xl px-3 py-2 flex items-center gap-2",
                      hasFreeDelivery
                        ? "bg-[var(--data-success-500)]/10 ring-1 ring-[var(--data-success-500)]/25"
                        : "bg-[var(--surface-sunken)] ring-1 ring-[var(--rule-soft)]",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-7 w-7 items-center justify-center rounded-full shrink-0",
                        hasFreeDelivery
                          ? "bg-[var(--data-success-500)] text-white"
                          : "bg-[var(--brand-primary)]/12 text-[var(--brand-primary)]",
                      )}
                    >
                      <Truck className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </span>
                    <div className="flex-1 min-w-0">
                      {hasFreeDelivery ? (
                        <p className="text-[length:var(--ts-xs)] font-extrabold text-[var(--data-success-500)] leading-tight inline-flex items-center gap-1">
                          <Zap className="h-3 w-3 shrink-0" strokeWidth={2.75} aria-hidden />
                          Delivery GRATIS
                        </p>
                      ) : (
                        <>
                          <p className="text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] leading-tight">
                            Faltan{" "}
                            <span className="tabular-nums font-extrabold text-[var(--brand-primary)]">
                              {fmt(remainingForFree)}
                            </span>{" "}
                            para delivery <span className="font-extrabold text-[var(--data-success-500)]">GRATIS</span>
                          </p>
                          <div className="relative mt-1.5 h-1 rounded-full bg-[var(--rule-soft)] overflow-hidden">
                            <m.div
                              initial={{ width: 0 }}
                              animate={{ width: `${progressPct}%` }}
                              transition={{ delay: 0.2, duration: 0.6, ease: "easeOut" }}
                              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[var(--brand-secondary)] to-[var(--brand-primary)]"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>

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
