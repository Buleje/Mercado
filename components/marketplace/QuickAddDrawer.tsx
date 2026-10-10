"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, m as motion } from "framer-motion";
import { X, Minus, Plus, ShoppingCart, ImageOff } from "lucide-react";
import { useQuickAdd } from "@/contexts/quick-add-context";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import type { Product } from "@/data/products";

const MAX_QTY = 99;

type WithStoreMeta = {
  _bulejeStoreMeta?: {
    storeId: string;
    storeName: string;
    storeSlug: string;
    storeProductId: string;
  };
};

export default function QuickAddDrawer() {
  const { product, isOpen, close } = useQuickAdd();

  // ESC + lock body scroll viven aquí porque dependen sólo de isOpen,
  // no del producto. El estado mutable (qty, adding) vive en el
  // sub-componente keyeado por product.id → se reinicia al cambiar de producto
  // sin un useEffect de reset (mejor perf, sin "set-state-in-effect").
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, close]);

  return (
    <AnimatePresence>
      {isOpen && product && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Agregar ${product.name}`}
          className="fixed inset-0 z-50 flex items-center justify-center px-3 py-6 sm:px-6"
        >
          <motion.button
            type="button"
            key="qa-backdrop"
            aria-label="Cerrar"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
          />

          <motion.div
            key="qa-card"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] shadow-2xl flex flex-col md:flex-row"
          >
            <QuickAddContent key={String(product.id)} product={product} onClose={close} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Contenido del modal — vive en un sub-componente keyeado por product.id para
// que cambiar de producto reinicie qty/adding sin un useEffect imperativo.
// ──────────────────────────────────────────────────────────────────────────────

interface ContentProps {
  product: Product;
  onClose: () => void;
}

function QuickAddContent({ product, onClose }: ContentProps) {
  const { addMultiple } = useCart();
  const { addItem: addMarketplaceItem } = useMarketplaceCart();
  const { showToast } = useToast();

  const [qty, setQty] = useState(1);
  const [qtyInput, setQtyInput] = useState("1");
  const [adding, setAdding] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closingRef = useRef<number | undefined>(undefined);

  const stock = product.stock;
  const outOfStock = stock === 0;
  const maxQty = useMemo(
    () => Math.min(MAX_QTY, stock && stock > 0 ? stock : MAX_QTY),
    [stock],
  );

  // Focus inicial al close button — un solo timer, no en cadena.
  useEffect(() => {
    const t = window.setTimeout(() => closeButtonRef.current?.focus(), 120);
    return () => {
      window.clearTimeout(t);
      if (closingRef.current !== undefined) window.clearTimeout(closingRef.current);
    };
  }, []);

  const setQtySafe = useCallback(
    (next: number) => {
      const clamped = Math.max(1, Math.min(maxQty, Math.floor(next) || 1));
      setQty(clamped);
      setQtyInput(String(clamped));
    },
    [maxQty],
  );

  const handleQtyInputChange = (raw: string) => {
    if (raw === "") {
      setQtyInput("");
      return;
    }
    const onlyDigits = raw.replace(/\D/g, "").slice(0, 3);
    setQtyInput(onlyDigits);
    const n = parseInt(onlyDigits, 10);
    if (!Number.isNaN(n) && n >= 1) {
      setQty(Math.min(maxQty, n));
    }
  };

  const handleQtyBlur = () => {
    const n = parseInt(qtyInput, 10);
    if (Number.isNaN(n) || n < 1) setQtySafe(1);
    else if (n > maxQty) setQtySafe(maxQty);
    else setQtyInput(String(n));
  };

  const handleAdd = useCallback(() => {
    if (adding) return;
    setAdding(true);
    const meta = (product as WithStoreMeta)._bulejeStoreMeta;
    if (meta) {
      addMarketplaceItem({
        storeId: meta.storeId,
        storeName: meta.storeName,
        storeSlug: meta.storeSlug,
        storeProductId: meta.storeProductId,
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: qty,
        image: product.image ?? null,
        unit: product.unit ?? null,
      });
    } else {
      addMultiple([{ product, quantity: qty }]);
    }
    showToast(`${qty}× ${product.name}`, product.image);
    closingRef.current = window.setTimeout(() => onClose(), 320);
  }, [product, adding, qty, addMultiple, addMarketplaceItem, showToast, onClose]);

  const subtotal = useMemo(() => Number(product.price) * qty, [product.price, qty]);

  return (
    <>
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute top-3 right-3 z-10 h-9 w-9 rounded-full bg-[var(--surface-canvas)]/90 backdrop-blur border border-[var(--rule-base)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors shadow-md"
      >
        <X className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
      </button>

      {/* ── IMAGEN ────────────────────────────────────── */}
      <div className="relative w-full md:w-[44%] md:shrink-0 aspect-square md:aspect-auto md:min-h-[420px] bg-[var(--surface-sunken)] overflow-hidden">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 100vw, 44vw"
            className="object-cover"
            priority
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--text-tertiary)]">
            <ImageOff className="h-12 w-12 opacity-40" aria-hidden="true" />
            <span className="text-sm font-bold">Sin imagen</span>
          </div>
        )}
        {product.badge && (
          <span className="absolute top-3 left-3 inline-flex items-center h-7 px-3 rounded-full bg-[var(--accent)] text-white text-xs font-extrabold uppercase tracking-wider shadow-md">
            {product.badge}
          </span>
        )}
      </div>

      {/* ── DETALLES ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto px-6 pt-7 pb-4 md:px-7 md:pt-9">
          {product.category && (
            <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-[11px] font-extrabold uppercase tracking-wider">
              {product.category}
            </span>
          )}

          <h3 className="mt-3 text-2xl md:text-[26px] font-extrabold leading-tight text-[var(--text-primary)]">
            {product.name}
          </h3>

          {product.unit && (
            <p className="mt-1 text-sm font-semibold text-[var(--text-tertiary)]">
              Vendido por {product.unit}
            </p>
          )}

          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)]">
              S/ {Number(product.price).toFixed(2)}
            </span>
            {product.unit && (
              <span className="text-sm font-bold text-[var(--text-tertiary)]">
                / {product.unit}
              </span>
            )}
          </div>

          {product.description && (
            <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
              {product.description}
            </p>
          )}

          {outOfStock ? (
            <div className="mt-5 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200">
              Producto agotado por ahora.
            </div>
          ) : typeof stock === "number" && stock > 0 && stock <= 5 ? (
            <div className="mt-5 inline-flex items-center h-7 px-3 rounded-full bg-amber-100 text-amber-900 text-xs font-extrabold uppercase tracking-wider dark:bg-amber-950/40 dark:text-amber-200">
              Quedan {stock}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-4 md:px-7">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="inline-flex items-stretch rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] overflow-hidden">
              <button
                type="button"
                onClick={() => setQtySafe(qty - 1)}
                disabled={qty <= 1 || outOfStock}
                aria-label="Disminuir cantidad"
                className="flex h-12 w-12 items-center justify-center text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
              </button>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={qtyInput}
                onChange={(e) => handleQtyInputChange(e.target.value)}
                onBlur={handleQtyBlur}
                onFocus={(e) => e.currentTarget.select()}
                disabled={outOfStock}
                aria-label="Cantidad"
                className="w-14 text-center text-base font-extrabold tabular-nums text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] bg-transparent border-x-2 border-[var(--rule-base)] outline-none focus:bg-primary/10 disabled:opacity-40"
              />
              <button
                type="button"
                onClick={() => setQtySafe(qty + 1)}
                disabled={qty >= maxQty || outOfStock}
                aria-label="Aumentar cantidad"
                className="flex h-12 w-12 items-center justify-center text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
              </button>
            </div>

            <div className="text-right">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                Subtotal
              </div>
              <div className="text-xl font-extrabold tabular-nums text-[var(--text-primary)]">
                S/ {subtotal.toFixed(2)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={outOfStock || adding}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-base font-extrabold text-white shadow-lg transition-all hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            <ShoppingCart className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
            {outOfStock
              ? "Agotado"
              : adding
                ? "Agregando…"
                : `Agregar ${qty > 1 ? `${qty} ` : ""}al carrito`}
          </button>
        </div>
      </div>
    </>
  );
}
