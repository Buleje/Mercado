"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useMarketplaceCart, type CartItem } from "@/hooks/use-marketplace-cart";

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
    <div className="flex items-center gap-3 py-3">
      {/* imagen */}
      <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
        {item.image ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            className="object-cover"
            sizes="48px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
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
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
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
        <p className="text-xs font-bold text-teal-700 dark:text-teal-400">
          {fmt(item.price)}
          {item.unit ? ` / ${item.unit}` : ""}
        </p>
      </div>

      {/* controles cantidad */}
      <div className="flex items-center gap-1">
        <button
          onClick={onDecrease}
          aria-label={`Reducir cantidad de ${item.name}`}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
          </svg>
        </button>
        <span className="w-6 text-center text-sm font-bold text-gray-900 dark:text-white">
          {item.quantity}
        </span>
        <button
          onClick={onIncrease}
          aria-label={`Aumentar cantidad de ${item.name}`}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
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
        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
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
  const { itemCount } = useMarketplaceCart();
  return (
    <button
      onClick={onClick}
      aria-label={`Carrito — ${itemCount} ${itemCount === 1 ? "producto" : "productos"}`}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
    >
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
      <AnimatePresence>
        {itemCount > 0 && (
          <motion.span
            key="badge"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-black text-white"
          >
            {itemCount > 99 ? "99+" : itemCount}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

// ---------- drawer principal ----------

export default function MarketplaceCart({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const {
    byStore,
    totalByStore,
    grandTotal,
    itemCount,
    updateQuantity,
    removeItem,
    clearAll,
  } = useMarketplaceCart();

  const [isOrdering, setIsOrdering] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState(false);

  const handleOrder = useCallback(async () => {
    if (itemCount === 0) return;
    setIsOrdering(true);
    setOrderError(null);
    setOrderSuccess(false);

    const storeIds = Object.keys(byStore);
    const results = await Promise.allSettled(
      storeIds.map((storeId) => {
        const group = byStore[storeId];
        const lines = group.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          price: i.price,
        }));
        return fetch("/api/wholesale/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId,
            lines,
            channel: "marketplace",
          }),
        }).then((r) => {
          if (!r.ok) throw new Error(`Error ${r.status} al crear orden en ${group.storeName}`);
          return r.json();
        });
      })
    );

    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    if (failed.length > 0) {
      setOrderError(
        `${failed.length} ${failed.length === 1 ? "pedido falló" : "pedidos fallaron"}. Intenta de nuevo.`
      );
    } else {
      setOrderSuccess(true);
      clearAll();
      setTimeout(() => {
        setOrderSuccess(false);
        onClose();
      }, 2000);
    }
    setIsOrdering(false);
  }, [byStore, itemCount, clearAll, onClose]);

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
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-white shadow-2xl dark:bg-gray-900 sm:w-96"
            role="dialog"
            aria-modal="true"
            aria-label="Carrito de compras"
          >
            {/* header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <svg aria-hidden="true" className="h-5 w-5 text-teal-700 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  Mi carrito
                </h2>
                {itemCount > 0 && (
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-800 dark:bg-teal-900/30 dark:text-teal-300">
                    {itemCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isEmpty && (
                  <button
                    onClick={clearAll}
                    className="text-xs text-gray-400 underline-offset-2 hover:text-red-500 hover:underline dark:text-gray-500 dark:hover:text-red-400"
                  >
                    Vaciar todo
                  </button>
                )}
                <button
                  onClick={onClose}
                  aria-label="Cerrar carrito"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* contenido */}
            <div className="flex-1 overflow-y-auto">
              {orderSuccess ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <svg aria-hidden="true" className="h-8 w-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-base font-bold text-gray-900 dark:text-white">
                    Pedidos enviados
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Recibirás confirmacion de cada tienda pronto.
                  </p>
                </div>
              ) : isEmpty ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <svg aria-hidden="true" className="h-8 w-8 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Tu carrito esta vacio
                  </p>
                  <button
                    onClick={onClose}
                    className="min-h-[44px] rounded-xl bg-teal-700 px-6 text-sm font-bold text-white transition-colors hover:bg-teal-800"
                  >
                    Ver tiendas
                  </button>
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
                              style={{ background: "linear-gradient(135deg,#0f766e,#134e4a)" }}
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
                      </section>
                    );
                  })}
                </div>
              )}
            </div>

            {/* footer con total y CTA */}
            {!isEmpty && !orderSuccess && (
              <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800">
                {orderError && (
                  <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
                    {orderError}
                  </p>
                )}
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Total
                  </span>
                  <span className="font-mono text-xl font-black text-teal-700 dark:text-teal-400">
                    {fmt(grandTotal)}
                  </span>
                </div>
                <button
                  onClick={handleOrder}
                  disabled={isOrdering}
                  className="min-h-[48px] w-full rounded-2xl bg-teal-700 text-sm font-bold text-white transition-all hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-60"
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
                      Enviando pedidos…
                    </span>
                  ) : (
                    `Hacer pedido · ${storeIds.length} ${storeIds.length === 1 ? "tienda" : "tiendas"}`
                  )}
                </button>
                <p className="mt-2 text-center text-xs text-gray-400 dark:text-gray-500">
                  Se crea un pedido por cada tienda
                </p>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
