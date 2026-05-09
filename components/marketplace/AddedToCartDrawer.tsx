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
  Pencil,
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
                  // max-w-md (~448px) — equilibrio entre legibilidad (textos
                  // y botones grandes) y compactness (no abruma).
                  "w-full max-w-md flex flex-col",
                  "bg-[var(--surface-raised)]",
                  "rounded-3xl shadow-2xl overflow-hidden",
                  "ring-1 ring-black/5",
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {/* ── Header — banner verde con check animado ──────────── */}
                <div className="relative bg-gradient-to-br from-[var(--data-success-500)]/10 via-[var(--accent-soft)] to-[var(--accent-soft)] px-5 py-4">
                  <button
                    onClick={close}
                    aria-label="Cerrar"
                    className="absolute right-3 top-3 h-8 w-8 inline-flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-white/60 hover:text-[var(--text-primary)] transition-colors"
                  >
                    <X className="h-4 w-4" strokeWidth={2.25} />
                  </button>

                  <div className="flex items-center gap-3 pr-10">
                    {/* Check con doble pulse para feedback visual */}
                    <span className="relative inline-flex h-11 w-11 items-center justify-center shrink-0">
                      <m.span
                        aria-hidden
                        className="absolute inset-0 rounded-full bg-[var(--data-success-500)]/30"
                        initial={{ scale: 0.6, opacity: 0.8 }}
                        animate={{ scale: 1.6, opacity: 0 }}
                        transition={{ duration: 0.9, ease: "easeOut" }}
                      />
                      <span className="relative h-11 w-11 rounded-full bg-[var(--data-success-500)] inline-flex items-center justify-center shadow-md">
                        <Check className="h-5 w-5 text-white" strokeWidth={3} aria-hidden />
                      </span>
                    </span>
                    <div className="min-w-0">
                      <p className="text-[length:var(--ts-xs)] font-extrabold uppercase tracking-[0.1em] text-[var(--data-success-500)]">
                        ¡Listo!
                      </p>
                      <h2
                        id="added-modal-title"
                        className="text-[length:var(--ts-lg)] font-black text-[var(--text-primary)] leading-tight tracking-tight"
                      >
                        Agregado al carrito
                      </h2>
                    </div>
                  </div>
                </div>

                {/* ── Producto: layout horizontal con jerarquía clara ─── */}
                <div className="flex-1 overflow-y-auto px-5 py-5">
                  <div className="flex gap-4">
                    {/* Imagen 96x96 — gradient brand cuando no hay imagen */}
                    <div className="relative h-24 w-24 shrink-0 rounded-2xl overflow-hidden bg-gradient-to-br from-[var(--brand-primary)]/15 to-[var(--brand-secondary)]/10 ring-1 ring-[var(--rule-soft)]">
                      {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.image}
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <span className="text-3xl font-black text-[var(--brand-primary)]/60">
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
                          className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-bold uppercase tracking-[0.06em] text-[var(--text-tertiary)] hover:text-[var(--brand-primary)] transition-colors"
                        >
                          <Store className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                          <span className="truncate">{product.storeName}</span>
                        </Link>
                      )}

                      <h3 className="mt-1 text-[length:var(--ts-base)] font-black leading-tight text-[var(--text-primary)] line-clamp-2 tracking-tight">
                        {product.name}
                      </h3>

                      <p className="mt-1.5 text-[length:clamp(1.375rem,3vw,1.625rem)] font-black text-[var(--brand-primary)] tabular-nums leading-none">
                        {fmt(product.price)}
                        {product.unit && (
                          <span className="ml-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)]">
                            / {product.unit}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Selector de cantidad — más alto y legible */}
                  <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3">
                    <span className="text-[length:var(--ts-sm)] font-extrabold text-[var(--text-secondary)]">
                      Cantidad
                    </span>
                    <div className="flex items-center rounded-xl bg-[var(--surface-raised)] ring-1 ring-[var(--rule-base)] overflow-hidden">
                      <button
                        type="button"
                        onClick={handleDec}
                        aria-label={qty <= 1 ? "Quitar del carrito" : "Reducir cantidad"}
                        className="h-10 w-10 inline-flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors active:scale-95"
                      >
                        <Minus className="h-4 w-4" strokeWidth={2.5} />
                      </button>
                      <span
                        aria-live="polite"
                        className="min-w-[2.5rem] text-center text-[length:var(--ts-base)] font-black tabular-nums"
                      >
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={handleInc}
                        aria-label="Aumentar cantidad"
                        className="h-10 w-10 inline-flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors active:scale-95"
                      >
                        <Plus className="h-4 w-4" strokeWidth={2.5} />
                      </button>
                    </div>
                    <span className="text-[length:var(--ts-base)] font-black tabular-nums text-[var(--text-primary)]">
                      {fmt(product.price * qty)}
                    </span>
                  </div>

                  {/* Variaciones — bloque legible (no chips diminutos) */}
                  {product.variations && product.variations.length > 0 && (
                    <div className="mt-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[length:var(--ts-xs)] font-extrabold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
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
                          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft,color-mix(in oklab, var(--accent) 8%, transparent))] px-3 h-8 text-[length:var(--ts-xs)] font-extrabold text-[var(--accent)] hover:bg-[var(--accent)]/15 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} />
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

                  {/* Link a ficha completa */}
                  <Link
                    href={productDetailHref}
                    onClick={close}
                    className="mt-3 inline-flex items-center gap-1.5 text-[length:var(--ts-sm)] font-bold text-[var(--accent)] hover:underline"
                  >
                    Ver ficha completa
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                  </Link>

                  {/* Resumen carrito — pill prominente */}
                  <div className="mt-4 rounded-2xl bg-gradient-to-r from-[var(--brand-primary)]/10 to-[var(--brand-primary)]/5 ring-1 ring-[var(--brand-primary)]/20 px-4 py-3.5 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-extrabold uppercase tracking-[0.08em] text-[var(--brand-primary)]">
                        <ShoppingCart className="h-3.5 w-3.5" strokeWidth={2.5} />
                        Tu carrito
                      </p>
                      <p className="mt-1 text-[length:var(--ts-sm)] font-semibold text-[var(--text-secondary)]">
                        {cartCount} {cartCount === 1 ? "producto" : "productos"} en total
                      </p>
                    </div>
                    <p className="text-[length:clamp(1.25rem,2.5vw,1.5rem)] font-black tabular-nums text-[var(--text-primary)]">
                      {fmt(subtotal)}
                    </p>
                  </div>
                </div>

                {/* ── Footer ─ jerarquía clara: pagar primero, seguir abajo */}
                <div className="px-5 pb-5 pt-2 space-y-2.5">
                  {/* Primario — ir al carrito (con total visible) */}
                  <button
                    type="button"
                    onClick={handleGoToCart}
                    className={cn(
                      "w-full inline-flex items-center justify-between gap-2 rounded-2xl px-5 h-14",
                      "text-[length:var(--ts-base)] font-extrabold",
                      "bg-[var(--accent-600,var(--accent))] text-white shadow-lg shadow-[var(--accent)]/30",
                      "hover:bg-[var(--accent)]/90 hover:shadow-xl hover:shadow-[var(--accent)]/40",
                      "active:scale-[0.985] transition-all",
                    )}
                  >
                    <span className="inline-flex items-center gap-2">
                      <ShoppingCart className="h-5 w-5" strokeWidth={2.25} aria-hidden />
                      Ir al carrito y pagar
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="tabular-nums">{fmt(subtotal)}</span>
                      <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                    </span>
                  </button>
                  {/* Secundario — seguir comprando (ghost) */}
                  <button
                    type="button"
                    onClick={close}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] px-4 h-12 text-[length:var(--ts-sm)] font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] hover:border-[var(--rule-strong)] transition-colors"
                  >
                    Agregar y seguir comprando
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
