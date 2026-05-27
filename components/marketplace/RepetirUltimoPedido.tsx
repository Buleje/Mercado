"use client";

/**
 * RepetirUltimoPedido — Hero card que aparece arriba en /tiendas si el
 * cliente tiene un pedido reciente.
 *
 * Brandon, mayo 14 2026: el card ya no navega directamente. Al tocarlo abre
 * un modal con los items del pedido anterior — el cliente marca/desmarca lo
 * que quiere y los agrega al carrito de un saque. Si los items del pedido
 * no estan guardados (pedidos viejos), fallback: navegamos al storefront
 * con ?repeat=orderId para que el flujo cliente-server resuelva.
 *
 * Storage: lee `buleje:last-order` de localStorage (escrito post-checkout
 * por el flujo de carrito). Sin schema. Helper `setLastOrder(...)` exportado
 * para que checkout lo grabe — recomendado guardar items completos para
 * que el modal funcione sin un round trip.
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, m as motion } from "framer-motion";
import {
  Repeat,
  ArrowRight,
  X,
  Check,
  ShoppingCart,
  Store as StoreIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

export interface LastOrderItem {
  /** ID numérico del producto en DB (requerido para addItem). */
  productId?: number;
  /** ID del StoreProduct (la unidad del catálogo de la tienda). */
  storeProductId?: string;
  name: string;
  imageUrl?: string | null;
  unit?: string | null;
  price?: number;
  quantity?: number;
  category?: string | null;
}

export interface LastOrder {
  orderId: string;
  storeId?: string;
  storeSlug: string;
  storeName: string;
  total: number;
  itemsCount: number;
  items?: LastOrderItem[];
  ts: number;
}

const KEY = "buleje:last-order";
/** Máx 30 días — pedidos más viejos no son útiles para repetir */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(n);
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days >= 1) return `hace ${days} ${days === 1 ? "día" : "días"}`;
  const hours = Math.floor(diff / (60 * 60 * 1000));
  if (hours >= 1) return `hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
  return "hace minutos";
}

export default function RepetirUltimoPedido() {
  const [order, setOrder] = useState<LastOrder | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const { addItem } = useMarketplaceCart();

  useEffect(() => {
    setHydrated(true);
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const o = JSON.parse(raw) as LastOrder;
      if (
        typeof o?.orderId === "string" &&
        typeof o?.storeSlug === "string" &&
        Date.now() - o.ts < MAX_AGE_MS
      ) {
        setOrder(o);
      }
    } catch {
      /* silent */
    }
  }, []);

  if (!hydrated || !order) return null;

  // Items utiles: los que tienen los campos minimos para addItem.
  const validItems = (order.items ?? []).filter(
    (i) => typeof i.productId === "number" && typeof i.price === "number",
  );
  const hasUsableItems = validItems.length > 0;

  // Contenido interno de la franja (compartido por el botón y el link).
  const barInner = (
    <span className="flex w-full items-center gap-2.5">
      <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white">
        <Repeat className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-extrabold text-[var(--accent)]">Tu último pedido</span>
        <span className="text-[var(--text-secondary)]">
          {" · "}{order.storeName}{" · "}
          <span className="font-bold tabular-nums text-[var(--text-primary)]">{fmtCurrency(order.total)}</span>
          {" · "}{order.itemsCount} {order.itemsCount === 1 ? "item" : "items"}
          <span className="hidden md:inline text-[var(--text-tertiary)]"> · {timeAgo(order.ts)}</span>
        </span>
      </span>
      <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-3.5 h-8 text-xs font-bold group-hover:gap-2 transition-all">
        Repetir
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      </span>
    </span>
  );

  return (
    <>
      {/* Franja slim sticky bajo el nav (sticky top-16 = altura del nav md).
          Discreta, siempre a mano, sin robarle espacio al catálogo. */}
      <div className="sticky top-14 md:top-16 z-40 border-b border-[var(--accent)]/20 bg-[var(--accent-soft)]/95 backdrop-blur">
        <div className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8">
          {hasUsableItems ? (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              aria-label={`Repetir tu último pedido de ${order.storeName}`}
              className="group flex w-full items-center py-2 text-left transition-opacity hover:opacity-90"
            >
              {barInner}
            </button>
          ) : (
            <Link
              href={`/marketplace/${order.storeSlug}?repeat=${order.orderId}`}
              aria-label={`Repetir tu último pedido de ${order.storeName}`}
              className="group flex w-full items-center py-2 transition-opacity hover:opacity-90"
            >
              {barInner}
            </Link>
          )}
        </div>
      </div>

      <RepetirPedidoModal
        open={modalOpen}
        order={order}
        items={validItems}
        onClose={() => setModalOpen(false)}
        onConfirm={(selected) => {
          for (const it of selected) {
            if (typeof it.productId !== "number" || typeof it.price !== "number") continue;
            addItem({
              productId: it.productId,
              storeProductId: it.storeProductId ?? `${order.storeId ?? order.storeSlug}-${it.productId}`,
              name: it.name,
              price: it.price,
              image: it.imageUrl ?? null,
              unit: it.unit ?? null,
              storeId: order.storeId ?? order.storeSlug,
              storeName: order.storeName,
              storeSlug: order.storeSlug,
              quantity: it.quantity ?? 1,
              category: it.category ?? null,
            });
          }
          setModalOpen(false);
        }}
      />
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RepetirPedidoModal({
  open,
  order,
  items,
  onClose,
  onConfirm,
}: {
  open: boolean;
  order: LastOrder;
  items: LastOrderItem[];
  onClose: () => void;
  onConfirm: (selected: LastOrderItem[]) => void;
}) {
  // Por default todos seleccionados. Brandon mayo 14: el cliente entra a
  // "Repetir" y quita los items que ya no quiere.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      const next = new Set<string>();
      items.forEach((it, i) => next.add(itemKey(it, i)));
      setSelectedKeys(next);
    }
  }, [open, items]);

  const toggle = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectedItems = useMemo(
    () => items.filter((it, i) => selectedKeys.has(itemKey(it, i))),
    [items, selectedKeys],
  );

  const totalSelected = selectedItems.reduce(
    (acc, it) => acc + (it.price ?? 0) * (it.quantity ?? 1),
    0,
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="repetir-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-6 backdrop-blur-md bg-slate-950/65"
          style={{ zIndex: 2147483647 }}
          onClick={onClose}
        >
          <motion.div
            key="repetir-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Repetir último pedido"
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full sm:max-w-lg max-h-[92svh] flex flex-col rounded-t-3xl sm:rounded-[28px] bg-[var(--surface-raised)] overflow-hidden"
            style={{ boxShadow: "0 30px 70px -15px rgba(0,0,0,0.45)" }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 sm:py-5 border-b border-[var(--rule-soft)] bg-linear-to-b from-[var(--accent-soft)]/40 to-transparent">
              <div className="flex items-start gap-3 min-w-0">
                <span className="h-11 w-11 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-md bg-linear-to-br from-[var(--accent-600,var(--accent))] to-[var(--accent)]">
                  <Repeat className="h-5 w-5" strokeWidth={2.25} />
                </span>
                <div className="min-w-0">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] leading-tight">
                    Repetir pedido
                  </p>
                  <h3 className="text-lg font-extrabold text-[var(--text-primary)] tracking-tight leading-tight truncate">
                    {order.storeName}
                  </h3>
                  <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] leading-snug">
                    {items.length} items · {timeAgo(order.ts)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-sunken)] hover:bg-[var(--rule-base)] text-[var(--text-primary)] transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            {/* Body: lista items con check */}
            <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-3">
              <ul className="space-y-2">
                {items.map((it, i) => {
                  const key = itemKey(it, i);
                  const selected = selectedKeys.has(key);
                  const lineTotal = (it.price ?? 0) * (it.quantity ?? 1);
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        aria-pressed={selected}
                        className={cn(
                          "w-full flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all",
                          selected
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]/60 shadow-[0_4px_16px_-8px_var(--accent)]"
                            : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)]/40 opacity-70",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                            selected
                              ? "border-[var(--accent)] bg-[var(--accent-600,var(--accent))] text-white"
                              : "border-[var(--rule-base)] bg-[var(--surface-canvas)]",
                          )}
                          aria-hidden
                        >
                          {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                        </span>
                        <div className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 rounded-xl overflow-hidden bg-[var(--surface-sunken)] grid place-items-center">
                          {it.imageUrl ? (
                            <Image
                              src={it.imageUrl}
                              alt={it.name}
                              width={56}
                              height={56}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <StoreIcon className="h-5 w-5 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm sm:text-base font-bold text-[var(--text-primary)] line-clamp-2">
                            {it.name}
                          </p>
                          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] tabular-nums">
                            {it.quantity ?? 1} × {fmtCurrency(it.price ?? 0)}
                            {it.unit ? ` · ${it.unit}` : ""}
                          </p>
                        </div>
                        <p className="text-sm font-extrabold tabular-nums text-[var(--text-primary)] shrink-0">
                          {fmtCurrency(lineTotal)}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {selectedKeys.size === 0 && (
                <p className="mt-3 text-center text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                  Marcá al menos un producto para agregar al carrito.
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] px-4 sm:px-6 py-3.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-tight">
                  {selectedItems.length} de {items.length} seleccionados
                </p>
                <p className="text-base font-black tabular-nums text-[var(--text-primary)] leading-tight">
                  {fmtCurrency(totalSelected)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onConfirm(selectedItems)}
                disabled={selectedItems.length === 0}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-full h-12 px-5 text-sm font-extrabold text-white transition-all shrink-0",
                  "bg-linear-to-br from-[var(--accent-600,var(--accent))] to-[var(--accent)] hover:brightness-110 shadow-[0_8px_20px_-8px_var(--accent)]",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                <ShoppingCart className="h-4 w-4" strokeWidth={2.25} />
                Agregar al carrito
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function itemKey(it: LastOrderItem, i: number): string {
  return `${it.productId ?? "no"}-${it.storeProductId ?? i}-${i}`;
}

// ─── Public helpers ──────────────────────────────────────────────────────────

/**
 * Helper para que el flujo de checkout grabe el último pedido.
 * Llamar después del éxito del POST /orders.
 */
export function setLastOrder(o: LastOrder): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
    // Disparamos evento para que el strip se refresque sin reload
    window.dispatchEvent(
      new CustomEvent("buleje:last-order-updated", { detail: o }),
    );
  } catch {
    /* silent */
  }
}

export function clearLastOrder(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* silent */
  }
}
