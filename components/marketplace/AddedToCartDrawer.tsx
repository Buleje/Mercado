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
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 8 }}
                transition={{ type: "spring", damping: 28, stiffness: 320 }}
                role="dialog"
                aria-labelledby="added-modal-title"
                aria-modal="true"
                className={cn(
                  "relative pointer-events-auto",
                  "w-full max-w-2xl max-h-[90vh] flex flex-col",
                  "bg-[var(--surface-raised)] border border-[var(--rule-soft)]",
                  "rounded-2xl shadow-2xl overflow-hidden",
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header con check + close */}
                <div className="relative border-b border-[var(--rule-soft)] px-5 py-3 bg-[var(--surface-sunken)]">
                  <button
                    onClick={close}
                    aria-label="Cerrar"
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} />
                  </button>

                  <div className="flex items-center gap-2 pr-10">
                    <div className="h-7 w-7 rounded-full bg-[var(--accent-soft)] flex items-center justify-center">
                      <Check
                        className="h-4 w-4 text-[var(--accent)]"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    </div>
                    <span
                      id="added-modal-title"
                      className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)]"
                    >
                      Agregado al carrito
                    </span>
                  </div>
                </div>

                {/* Contenido scrolleable: 2 columnas en desktop, 1 en mobile */}
                <div className="flex-1 overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-5 p-5">
                    {/* Imagen grande */}
                    <div className="relative aspect-square sm:aspect-auto sm:h-48 rounded-xl overflow-hidden bg-[var(--surface-sunken)] border border-[var(--rule-soft)]">
                      {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.image}
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-[var(--text-tertiary)]">
                          <ShoppingCart className="h-10 w-10" strokeWidth={1.5} />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex flex-col min-w-0">
                      {product.storeName && (
                        <Link
                          href={`/marketplace/${product.storeSlug}`}
                          className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors mb-1"
                        >
                          <Store className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                          <span className="truncate">{product.storeName}</span>
                        </Link>
                      )}

                      <h3 className="text-base sm:text-lg font-bold leading-tight text-[var(--text-primary)] mb-2 line-clamp-3">
                        {product.name}
                      </h3>

                      <p className="text-2xl font-black text-[var(--text-primary)] tabular-nums leading-none mb-3">
                        {fmt(product.price)}
                        {product.unit && (
                          <span className="ml-1.5 text-[length:var(--ts-xs)] font-normal text-[var(--text-tertiary)]">
                            / {product.unit}
                          </span>
                        )}
                      </p>

                      {/* Selector de cantidad */}
                      <div className="flex items-center gap-3 mb-4">
                        <span className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)]">
                          Cantidad
                        </span>
                        <div className="flex items-center rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)]">
                          <button
                            type="button"
                            onClick={handleDec}
                            aria-label="Reducir cantidad"
                            className="h-9 w-9 inline-flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] rounded-l-lg transition-colors"
                          >
                            <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <span
                            aria-live="polite"
                            className="min-w-[2.5rem] text-center text-[length:var(--ts-sm)] font-bold tabular-nums text-[var(--text-primary)]"
                          >
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={handleInc}
                            aria-label="Aumentar cantidad"
                            className="h-9 w-9 inline-flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] rounded-r-lg transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        </div>
                        <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] tabular-nums">
                          Subtotal {fmt(product.price * qty)}
                        </span>
                      </div>

                      {/* Variaciones */}
                      {product.variations && product.variations.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
                            Variaciones
                          </p>
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[length:var(--ts-xs)]">
                            {product.variations.map((v) => (
                              <div key={v.label} className="flex flex-col min-w-0">
                                <dt className="text-[var(--text-tertiary)] truncate">
                                  {v.label}
                                </dt>
                                <dd className="font-semibold text-[var(--text-primary)] truncate">
                                  {v.value}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}

                      {/* Descripcion */}
                      {product.description && (
                        <div className="mb-3">
                          <p className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                            Detalles
                          </p>
                          <p className="text-[length:var(--ts-xs)] leading-relaxed text-[var(--text-secondary)] line-clamp-4">
                            {product.description}
                          </p>
                        </div>
                      )}

                      {/* Link a detalle completo (incluye comentarios y reviews) */}
                      <Link
                        href={productDetailHref}
                        onClick={close}
                        className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--accent)] hover:underline mt-auto pt-2"
                      >
                        Ver ficha completa, comentarios y reviews
                        <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
                      </Link>
                    </div>
                  </div>

                  {/* Resumen carrito */}
                  <div className="px-5 pb-5">
                    <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                          Tu carrito
                        </p>
                        <p className="mt-0.5 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
                          {cartCount} {cartCount === 1 ? "producto" : "productos"}
                        </p>
                      </div>
                      <p className="text-lg font-bold tabular-nums text-[var(--text-primary)]">
                        {fmt(subtotal)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer CTAs */}
                <div className="border-t border-[var(--rule-soft)] px-5 py-4 flex flex-col sm:flex-row gap-2 bg-[var(--surface-raised)]">
                  <button
                    type="button"
                    onClick={close}
                    className="flex-1 inline-flex items-center justify-center rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2.5 text-[length:var(--ts-sm)] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Seguir comprando
                  </button>
                  <button
                    type="button"
                    onClick={handleGoToCart}
                    className={cn(
                      "flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5",
                      "text-[length:var(--ts-sm)] font-semibold transition-colors",
                      "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90",
                    )}
                  >
                    Ver mi carrito
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
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
