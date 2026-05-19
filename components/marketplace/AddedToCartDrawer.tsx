"use client";

/**
 * AddedToCartDrawer — Brandon 2026-05-18 v5: REDISEÑO TOAST MINIMAL.
 *
 * Antes: modal central / bottom-sheet con hero gigante, contador qty, hero
 * brand celebratorio, breakdown precio, 2 CTAs. Interrumpía el flujo de
 * compra y se sentía "pesado" — el cliente tenía que cerrar para seguir.
 *
 * Ahora: toast flotante minimal estilo Glovo/Rappi.
 *   · Mobile (xs): top inset-x-4 top-4 — 80px alto con thumb + nombre +
 *     "agregado al carrito · N items"
 *   · Desktop (sm+): bottom-right 6 — pill similar + link "Ver carrito >"
 *   · Auto-cierra 2.5s (clearTimeout en open consecutivo para reset)
 *   · Sin botones primarios — zero interrupción
 *   · Cliente sigue comprando sin perder contexto
 *
 * Se mantiene la API del context (`open(snapshot)`, `close()`) intacta para
 * no romper callsites (use-cart-with-undo, MarketplaceContent).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, m } from "framer-motion";
import { Check, ShoppingBag, ArrowRight, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

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

const AUTO_DISMISS_MS = 2500;

/* ── Provider + Toast ───────────────────────────────────────────────────── */
export function AddedToCartDrawerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [product, setProduct] = useState<AddedProductSnapshot | null>(null);
  const [visible, setVisible] = useState(false);
  const { items } = useMarketplaceCart();
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    setVisible(false);
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const open = useCallback(
    (p: AddedProductSnapshot) => {
      // Reset del timer si el cliente agrega varios productos seguidos —
      // el toast del último producto manda y dura 2.5s desde ese momento.
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
      setProduct(p);
      setVisible(true);
      dismissTimerRef.current = setTimeout(() => {
        setVisible(false);
        dismissTimerRef.current = null;
      }, AUTO_DISMISS_MS);
    },
    [],
  );

  // Cleanup al desmontar el provider
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const cartCount = useMemo(
    () => items.reduce((acc, i) => acc + i.quantity, 0),
    [items],
  );

  const ctx = useMemo<DrawerCtx>(() => ({ open, close }), [open, close]);

  return (
    <DrawerContext.Provider value={ctx}>
      {children}

      <AnimatePresence>
        {visible && product && (
          <m.div
            key="toast"
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 480, damping: 32 }}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={cn(
              // Mobile: top centered con inset-x-4
              "fixed z-[9000] inset-x-3 top-3",
              // Desktop: bottom-right con max-width
              "sm:inset-x-auto sm:right-6 sm:left-auto sm:top-auto sm:bottom-6",
              "sm:max-w-sm",
              "rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
              "shadow-[0_12px_32px_-8px_rgba(0,0,0,0.18)]",
              "ring-1 ring-[var(--accent)]/15",
              "overflow-hidden",
            )}
          >
            <div className="flex items-center gap-3 p-3 sm:p-3.5">
              {/* Check verde + thumb del producto */}
              <div className="relative shrink-0">
                {product.image ? (
                  <div className="relative h-12 w-12 sm:h-14 sm:w-14 rounded-xl overflow-hidden bg-[var(--surface-sunken)] ring-1 ring-[var(--rule-soft)]">
                    <Image
                      src={product.image}
                      alt={product.name}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-[var(--accent)]/12 inline-flex items-center justify-center">
                    <ShoppingBag
                      className="h-5 w-5 text-[var(--accent)]"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                  </div>
                )}
                {/* Badge check verde en la esquina */}
                <span
                  className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--data-success-500)] text-white ring-2 ring-[var(--surface-raised)] shadow-sm"
                  aria-hidden
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              </div>

              {/* Info: nombre + estado */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-[var(--text-primary)] truncate leading-tight">
                  {product.name}
                </p>
                <p className="mt-0.5 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] leading-tight">
                  <span className="text-[var(--data-success-600,var(--data-success-500))]">
                    Agregado al carrito
                  </span>
                  <span className="mx-1.5 text-[var(--text-tertiary)]">·</span>
                  <span className="tabular-nums">
                    {cartCount} {cartCount === 1 ? "producto" : "productos"}
                  </span>
                </p>
              </div>

              {/* Desktop only: link "Ver carrito" */}
              <Link
                href="/marketplace/carrito"
                onClick={close}
                className="hidden sm:inline-flex items-center gap-1 shrink-0 px-3 h-9 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-[length:var(--ts-xs)] font-extrabold hover:bg-[var(--accent)]/15 transition-colors"
              >
                Ver carrito
                <ArrowRight className="h-3 w-3" strokeWidth={2.75} />
              </Link>

              {/* Mobile only: botón X compacto para cerrar manualmente
                  (auto-cierra en 2.5s pero el cliente puede acelerar) */}
              <button
                type="button"
                onClick={close}
                aria-label="Cerrar notificación"
                className="sm:hidden shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors active:scale-95"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            {/* Barra de progreso de auto-dismiss — pista visual sutil al
                cliente de que el toast se cierra solo. */}
            <m.span
              aria-hidden
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: AUTO_DISMISS_MS / 1000, ease: "linear" }}
              className="block h-0.5 origin-left bg-[var(--accent)]/40"
            />
          </m.div>
        )}
      </AnimatePresence>
    </DrawerContext.Provider>
  );
}
