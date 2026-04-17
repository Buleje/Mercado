"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { X, GitCompareArrows, Package, Star } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useCompare, type CompareItem } from "@/contexts/compare-context";

/* ── Formateador ─────────────────────────────────────────────────────────────── */

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

/* ── StarRating minimalista ──────────────────────────────────────────────────── */

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating.toFixed(1)} de 5 estrellas`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3 w-3",
            i < Math.round(rating)
              ? "fill-amber-400 text-amber-400"
              : "fill-gray-200 text-gray-200 dark:fill-gray-700 dark:text-gray-700"
          )}
          aria-hidden="true"
        />
      ))}
      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">{rating.toFixed(1)}</span>
    </div>
  );
}

/* ── ProductColumn ───────────────────────────────────────────────────────────── */

function ProductColumn({ item, onRemove }: { item: CompareItem; onRemove: () => void }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      {/* Imagen */}
      <div className="relative mx-auto h-32 w-full overflow-hidden rounded-lg bg-gray-50 dark:bg-gray-800">
        {item.image ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            className="object-contain"
            sizes="(max-width: 768px) 33vw, 200px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package className="h-8 w-8 text-gray-300 dark:text-gray-600" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Nombre */}
      <p className="line-clamp-2 text-xs font-semibold leading-snug text-gray-900 dark:text-gray-100">
        {item.name}
      </p>

      {/* Precio */}
      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
        {fmt(item.price)}
      </p>

      {/* Tienda */}
      <Link
        href={`/marketplace/${item.storeSlug}`}
        className="truncate text-xs text-gray-500 underline-offset-2 hover:underline dark:text-gray-400"
        aria-label={`Ver tienda ${item.storeSlug}`}
      >
        {item.storeSlug}
      </Link>

      {/* Rating */}
      <div className="min-h-[20px]">
        {item.rating !== undefined && item.rating > 0 ? (
          <StarRating rating={item.rating} />
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-600">Sin valoraciones</span>
        )}
      </div>

      {/* Stock */}
      <div className="min-h-[20px]">
        {item.stock !== undefined ? (
          <span
            className={cn(
              "text-xs font-medium",
              item.stock === 0
                ? "text-red-500"
                : item.stock <= 5
                  ? "text-amber-500"
                  : "text-green-600 dark:text-green-400"
            )}
          >
            {item.stock === 0
              ? "Agotado"
              : item.stock <= 5
                ? `Solo ${item.stock} disponibles`
                : `${item.stock} en stock`}
          </span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-600">—</span>
        )}
      </div>

      {/* Boton quitar */}
      <button
        onClick={onRemove}
        aria-label={`Quitar ${item.name} de la comparacion`}
        className="mt-auto rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
      >
        Quitar
      </button>
    </div>
  );
}

/* ── EmptyState ──────────────────────────────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <GitCompareArrows className="h-10 w-10 text-gray-300 dark:text-gray-600" aria-hidden="true" />
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
        Agrega productos desde las tarjetas para compararlos
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Puedes comparar hasta 3 productos a la vez
      </p>
    </div>
  );
}

/* ── Componente principal ────────────────────────────────────────────────────── */

export default function ProductCompareDrawer() {
  const { items, remove, clear, open, setOpen } = useCompare();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap: enfocar el boton X al abrir
  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus();
    }
  }, [open]);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, setOpen]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            key="compare-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Panel lateral derecho */}
          <motion.div
            key="compare-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Comparar productos"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <GitCompareArrows className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Comparar productos
                  <span className="ml-1.5 text-gray-400 dark:text-gray-500">
                    ({items.length}/3)
                  </span>
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                onClick={() => setOpen(false)}
                aria-label="Cerrar comparador"
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Contenido */}
            <div className="flex flex-1 flex-col overflow-y-auto px-5 py-4">
              {items.length === 0 ? (
                <EmptyState />
              ) : (
                <>
                  {/* Filas de etiqueta */}
                  <div className="mb-3 grid grid-cols-[80px_1fr] gap-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-600">
                    <span />
                    <div
                      className="grid gap-3"
                      style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}
                    >
                      {items.map((item) => (
                        <span key={item.productId} className="truncate">{item.name}</span>
                      ))}
                    </div>
                  </div>

                  {/* Columnas de productos */}
                  <div className="flex gap-3">
                    {/* Etiquetas de fila */}
                    <div className="flex w-20 shrink-0 flex-col gap-3 pt-[136px] text-[10px] font-medium text-gray-400 dark:text-gray-600">
                      <div className="h-[52px] leading-[1.4] flex items-start">Nombre</div>
                      <div className="h-5 flex items-center">Precio</div>
                      <div className="h-5 flex items-center">Tienda</div>
                      <div className="h-5 flex items-center">Rating</div>
                      <div className="h-5 flex items-center">Stock</div>
                    </div>

                    {/* Columnas de datos */}
                    <div
                      className="grid flex-1 gap-3"
                      style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}
                    >
                      {items.map((item) => (
                        <ProductColumn
                          key={item.productId}
                          item={item}
                          onRemove={() => remove(item.productId)}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-between border-t border-gray-100 px-5 py-4 dark:border-gray-800">
              <button
                onClick={clear}
                disabled={items.length === 0}
                aria-label="Vaciar lista de comparacion"
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-900"
              >
                Vaciar lista
              </button>
              <Link
                href="/marketplace"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
              >
                Ir al marketplace
              </Link>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
