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
  ArrowRight,
  Store,
  ExternalLink,
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

            {/* Modal CENTRAL — wrapper centra con flex */}
            <div
              className="fixed inset-0 z-[61] flex items-center justify-center p-4 sm:p-6 pointer-events-none"
              aria-hidden="true"
            >
              <m.div
                key="modal"
                initial={{ opacity: 0, scale: 0.92, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ type: "spring", damping: 26, stiffness: 360 }}
                role="dialog"
                aria-labelledby="added-modal-title"
                aria-modal="true"
                className={cn(
                  "relative pointer-events-auto",
                  // Antes max-w-2xl (672px) era demasiado ancho — Brandon mayo 2026
                  // dijo "muy confuso". Ahora max-w-sm (384px) compacto vertical.
                  "w-full max-w-sm flex flex-col",
                  "bg-[var(--surface-raised)]",
                  "rounded-3xl shadow-2xl overflow-hidden",
                  "ring-1 ring-black/5",
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {/* ── Header — banner verde con check animado ──────────── */}
                <div className="relative bg-gradient-to-br from-[var(--data-success)]/10 via-[var(--accent-soft)] to-[var(--accent-soft)] px-5 py-4">
                  <button
                    onClick={close}
                    aria-label="Cerrar"
                    className="absolute right-3 top-3 h-8 w-8 inline-flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-white/60 hover:text-[var(--text-primary)] transition-colors"
                  >
                    <X className="h-4 w-4" strokeWidth={2.25} />
                  </button>

                  <div className="flex items-center gap-2.5 pr-10">
                    {/* Check con doble pulse para feedback visual */}
                    <span className="relative inline-flex h-9 w-9 items-center justify-center shrink-0">
                      <m.span
                        aria-hidden
                        className="absolute inset-0 rounded-full bg-[var(--data-success)]/30"
                        initial={{ scale: 0.6, opacity: 0.8 }}
                        animate={{ scale: 1.6, opacity: 0 }}
                        transition={{ duration: 0.9, ease: "easeOut" }}
                      />
                      <span className="relative h-9 w-9 rounded-full bg-[var(--data-success)] inline-flex items-center justify-center shadow-md">
                        <Check className="h-4.5 w-4.5 text-white" strokeWidth={3} aria-hidden />
                      </span>
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--data-success)]">
                        ¡Listo!
                      </p>
                      <h2
                        id="added-modal-title"
                        className="text-sm font-extrabold text-[var(--text-primary)] leading-tight"
                      >
                        Agregado al carrito
                      </h2>
                    </div>
                  </div>
                </div>

                {/* ── Producto: layout horizontal compacto ──────────────── */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  <div className="flex gap-3">
                    {/* Imagen 80x80 — gradient brand cuando no hay imagen */}
                    <div className="relative h-20 w-20 shrink-0 rounded-2xl overflow-hidden bg-gradient-to-br from-[var(--brand-primary)]/15 to-[var(--brand-secondary)]/10 ring-1 ring-[var(--rule-soft)]">
                      {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.image}
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <span className="text-2xl font-black text-[var(--brand-primary)]/60">
                            {product.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {product.storeName && (
                        <Link
                          href={`/marketplace/${product.storeSlug}`}
                          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] hover:text-[var(--brand-primary)] transition-colors"
                        >
                          <Store className="h-3 w-3" strokeWidth={2} aria-hidden />
                          <span className="truncate">{product.storeName}</span>
                        </Link>
                      )}

                      <h3 className="mt-0.5 text-sm font-extrabold leading-tight text-[var(--text-primary)] line-clamp-2">
                        {product.name}
                      </h3>

                      <p className="mt-1 text-xl font-black text-[var(--brand-primary)] tabular-nums leading-none">
                        {fmt(product.price)}
                        {product.unit && (
                          <span className="ml-1 text-[10px] font-semibold text-[var(--text-tertiary)]">
                            / {product.unit}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Selector de cantidad — fila completa con subtotal alineado */}
                  <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                      Cantidad
                    </span>
                    <div className="flex items-center rounded-lg bg-[var(--surface-raised)] ring-1 ring-[var(--rule-base)]">
                      <button
                        type="button"
                        onClick={handleDec}
                        aria-label={qty <= 1 ? "Quitar del carrito" : "Reducir cantidad"}
                        className="h-8 w-8 inline-flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] rounded-l-lg transition-colors active:scale-95"
                      >
                        <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </button>
                      <span
                        aria-live="polite"
                        className="min-w-[2rem] text-center text-sm font-extrabold tabular-nums"
                      >
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={handleInc}
                        aria-label="Aumentar cantidad"
                        className="h-8 w-8 inline-flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] rounded-r-lg transition-colors active:scale-95"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </button>
                    </div>
                    <span className="text-xs font-extrabold tabular-nums text-[var(--text-primary)]">
                      {fmt(product.price * qty)}
                    </span>
                  </div>

                  {/* Variaciones — chips compactos */}
                  {product.variations && product.variations.length > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                          Variaciones
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
                          className="text-[10px] font-extrabold text-[var(--accent)] hover:underline"
                        >
                          Editar
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {product.variations.map((v, i) => (
                          <span
                            key={`${v.label}-${i}`}
                            className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-sunken)] px-2 py-1 text-[11px]"
                          >
                            <span className="text-[var(--text-tertiary)]">{v.label}:</span>
                            <span className="font-bold text-[var(--text-primary)]">{v.value}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Link a ficha completa */}
                  <Link
                    href={productDetailHref}
                    onClick={close}
                    className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent)] hover:underline"
                  >
                    Ver ficha completa
                    <ExternalLink className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                  </Link>

                  {/* Resumen carrito — pill compacto */}
                  <div className="mt-4 rounded-2xl bg-gradient-to-r from-[var(--brand-primary)]/8 to-[var(--brand-primary)]/5 ring-1 ring-[var(--brand-primary)]/15 px-4 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[var(--brand-primary)]">
                        <ShoppingCart className="h-3 w-3" strokeWidth={2.5} />
                        Tu carrito
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                        {cartCount} {cartCount === 1 ? "producto" : "productos"}
                      </p>
                    </div>
                    <p className="text-lg font-black tabular-nums text-[var(--text-primary)]">
                      {fmt(subtotal)}
                    </p>
                  </div>
                </div>

                {/* ── Footer ───────────────────────────────────────────── */}
                <div className="px-5 pb-5 pt-1 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={close}
                    className="inline-flex items-center justify-center rounded-xl border-2 border-[var(--rule-base)] px-3 h-11 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Seguir comprando
                  </button>
                  <button
                    type="button"
                    onClick={handleGoToCart}
                    className={cn(
                      "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 h-11",
                      "text-xs font-extrabold uppercase tracking-wider",
                      "bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/30",
                      "hover:bg-[var(--accent)]/90 hover:shadow-xl hover:shadow-[var(--accent)]/40",
                      "active:scale-[0.98] transition-all",
                    )}
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
