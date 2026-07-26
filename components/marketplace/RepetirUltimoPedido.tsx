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
  Minus,
  Plus,
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
/** Dismiss por sesión: oculta la franja del pedido X hasta recargar/nuevo pedido. */
const DISMISS_KEY = "buleje:last-order-dismissed";
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

export default function RepetirUltimoPedido({
  variant = "card",
}: {
  /** "card" = franja inline ancha (legacy). "chip" = pastilla compacta para
   *  la barra de filtros (Brandon 2026-06-10) — abre el mismo modal. */
  variant?: "card" | "chip";
} = {}) {
  const [order, setOrder] = useState<LastOrder | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [dismissed, setDismissed] = useState(false);
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
        // Respetar dismiss de esta sesión para ESTE pedido.
        const dq = sessionStorage.getItem(DISMISS_KEY);
        if (dq && dq === o.orderId) setDismissed(true);
        setOrder(o);
      }
    } catch {
      /* silent */
    }
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      if (order) sessionStorage.setItem(DISMISS_KEY, order.orderId);
    } catch {
      /* silent */
    }
  }, [order]);

  if (!hydrated || !order || dismissed) return null;

  // Items utiles: los que tienen los campos minimos para addItem.
  const validItems = (order.items ?? []).filter(
    (i) => typeof i.productId === "number" && typeof i.price === "number",
  );
  const hasUsableItems = validItems.length > 0;

  // Miniaturas de productos del pedido (stack solapado) para dar contexto visual.
  const thumbs = validItems.filter((i) => i.imageUrl).slice(0, 3);
  const extraThumbs = Math.max(0, order.itemsCount - thumbs.length);

  // Contenido interno de la franja (compartido por el botón y el link).
  const barInner = (
    <span className="flex w-full items-center gap-2.5 sm:gap-3">
      <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-sm">
        <Repeat className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm">
          <span className="font-extrabold text-[var(--accent)]">Tu último pedido</span>
          <span className="text-[var(--text-secondary)]"> · {order.storeName}</span>
        </span>
        <span className="block truncate text-xs text-[var(--text-tertiary)]">
          <span className="font-bold tabular-nums text-[var(--text-secondary)]">{fmtCurrency(order.total)}</span>
          {" · "}{order.itemsCount} {order.itemsCount === 1 ? "ítem" : "ítems"}
          <span className="hidden sm:inline"> · {timeAgo(order.ts)}</span>
        </span>
      </span>
      {thumbs.length > 0 && (
        <span className="hidden sm:flex shrink-0 items-center -space-x-2" aria-hidden>
          {thumbs.map((it, i) => (
            <span
              key={i}
              className="relative h-8 w-8 overflow-hidden rounded-full bg-[var(--surface-sunken)] ring-2 ring-[var(--surface-canvas)]"
            >
              <Image src={it.imageUrl as string} alt="" fill sizes="32px" className="object-cover" />
            </span>
          ))}
          {extraThumbs > 0 && (
            <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-[10px] font-black text-[var(--accent)] ring-2 ring-[var(--surface-canvas)]">
              +{extraThumbs}
            </span>
          )}
        </span>
      )}
      <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] text-white px-3.5 sm:px-4 h-9 text-xs font-bold group-hover:gap-2 transition-all">
        Repetir
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      </span>
    </span>
  );

  // Modal compartido por la card y el chip — misma lógica de re-agregar.
  const modalEl = (
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
  );

  // ── Variante CHIP — pastilla compacta para la barra de filtros de /tiendas.
  if (variant === "chip") {
    // Rediseño minimalista (Brandon 2026-06-10): pastilla plana w-full, radio
    // sutil, borde accent + texto accent (sin fondo difuminado), hover sólido.
    // Alinea con los controles del sidebar de filtros (h-10, rounded-md).
    const chipClass =
      "inline-flex w-full items-center justify-center gap-2 rounded-md border border-[var(--accent)] bg-transparent text-[var(--accent)] px-3.5 h-10 text-sm font-bold whitespace-nowrap transition-colors hover:bg-[var(--accent)] hover:text-white";
    const chipInner = (
      <>
        <Repeat className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        Repetir pedido
      </>
    );
    return (
      <>
        {hasUsableItems ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            aria-label={`Repetir tu último pedido de ${order.storeName}`}
            className={chipClass}
          >
            {chipInner}
          </button>
        ) : (
          <Link
            href={`/marketplace/${order.storeSlug}?repeat=${order.orderId}`}
            aria-label={`Repetir tu último pedido de ${order.storeName}`}
            className={chipClass}
          >
            {chipInner}
          </Link>
        )}
        {modalEl}
      </>
    );
  }

  return (
    <>
      {/* Card inline (Brandon 2026-06-08) — antes era una franja sticky z-40 que
          tapaba el rail lateral (overlap con "Explorar"). Ahora vive en el flujo
          del contenido: prominente al entrar, se va al scrollear, sin overlap ni
          robo de z-index. */}
      <div className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <div className="relative flex items-center gap-2 rounded-2xl border border-[var(--accent)]/20 bg-primary/10/50 p-3 sm:p-3.5 shadow-[var(--shadow-sm)]">
          {hasUsableItems ? (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              aria-label={`Repetir tu último pedido de ${order.storeName}`}
              className="group flex min-w-0 flex-1 items-center text-left rounded-xl transition-opacity hover:opacity-90"
            >
              {barInner}
            </button>
          ) : (
            <Link
              href={`/marketplace/${order.storeSlug}?repeat=${order.orderId}`}
              aria-label={`Repetir tu último pedido de ${order.storeName}`}
              className="group flex min-w-0 flex-1 items-center rounded-xl transition-opacity hover:opacity-90"
            >
              {barInner}
            </Link>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Ocultar tu último pedido"
            className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </div>

      {modalEl}
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
  // Por default todos seleccionados; cantidades = las del pedido original.
  // Brandon 2026-06-08: el cliente puede AJUSTAR cantidades (stepper) antes de
  // repetir, no solo marcar/desmarcar.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open) {
      const keys = new Set<string>();
      const qty: Record<string, number> = {};
      items.forEach((it, i) => {
        const k = itemKey(it, i);
        keys.add(k);
        qty[k] = Math.max(1, it.quantity ?? 1);
      });
      setSelectedKeys(keys);
      setQuantities(qty);
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

  const setQty = useCallback((key: string, delta: number) => {
    setQuantities((prev) => ({ ...prev, [key]: Math.max(1, (prev[key] ?? 1) + delta) }));
  }, []);

  const allSelected = items.length > 0 && selectedKeys.size === items.length;
  const toggleAll = useCallback(() => {
    setSelectedKeys((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((it, i) => itemKey(it, i))),
    );
  }, [items]);

  // Items seleccionados con la cantidad ajustada → onConfirm.
  const selectedList = useMemo(
    () =>
      items
        .map((it, i) => ({ it, key: itemKey(it, i) }))
        .filter(({ key }) => selectedKeys.has(key))
        .map(({ it, key }) => ({ ...it, quantity: quantities[key] ?? it.quantity ?? 1 })),
    [items, selectedKeys, quantities],
  );

  const selectedCount = selectedList.length;
  const totalSelected = selectedList.reduce(
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

            {/* Body: barra seleccionar-todos + filas compactas con stepper */}
            <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-3">
              <div className="flex items-center justify-between gap-2 px-1 pb-2.5">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Ajustá lo que querés repetir
                </span>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-[length:var(--ts-xs)] font-bold text-[var(--accent)] transition-opacity hover:opacity-70"
                >
                  {allSelected ? "Quitar todos" : "Marcar todos"}
                </button>
              </div>

              <ul className="space-y-2">
                {items.map((it, i) => {
                  const key = itemKey(it, i);
                  const selected = selectedKeys.has(key);
                  const qty = quantities[key] ?? it.quantity ?? 1;
                  const lineTotal = (it.price ?? 0) * qty;
                  return (
                    <li
                      key={key}
                      className={cn(
                        "flex items-center gap-2.5 sm:gap-3 rounded-2xl border p-2 sm:p-2.5 transition-all",
                        selected
                          ? "border-[var(--accent)]/45 bg-primary/10/40"
                          : "border-[var(--rule-soft)] bg-[var(--surface-canvas)] opacity-55",
                      )}
                    >
                      {/* Check de selección */}
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        aria-pressed={selected}
                        aria-label={selected ? `Quitar ${it.name}` : `Incluir ${it.name}`}
                        className={cn(
                          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                          selected
                            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                            : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)]/50",
                        )}
                      >
                        {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
                      </button>

                      {/* Thumbnail */}
                      <div className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 rounded-xl overflow-hidden bg-[var(--surface-sunken)] grid place-items-center">
                        {it.imageUrl ? (
                          <Image src={it.imageUrl} alt={it.name} width={48} height={48} className="object-cover w-full h-full" />
                        ) : (
                          <StoreIcon className="h-5 w-5 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
                        )}
                      </div>

                      {/* Nombre + precio unitario */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[var(--text-primary)] line-clamp-1">{it.name}</p>
                        <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] tabular-nums">
                          {fmtCurrency(it.price ?? 0)}{it.unit ? ` · ${it.unit}` : ""}
                        </p>
                      </div>

                      {/* Stepper de cantidad */}
                      <div className="flex items-center gap-0.5 shrink-0 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] p-0.5">
                        <button
                          type="button"
                          onClick={() => setQty(key, -1)}
                          disabled={qty <= 1}
                          aria-label={`Menos ${it.name}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Minus className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
                        </button>
                        <span className="w-5 text-center text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{qty}</span>
                        <button
                          type="button"
                          onClick={() => setQty(key, 1)}
                          aria-label={`Más ${it.name}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
                        </button>
                      </div>

                      {/* Total de línea */}
                      <p className="w-[58px] sm:w-16 text-right text-sm font-extrabold tabular-nums text-[var(--text-primary)] shrink-0">
                        {fmtCurrency(lineTotal)}
                      </p>
                    </li>
                  );
                })}
              </ul>

              {selectedKeys.size === 0 && (
                <p className="mt-3 text-center text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                  Seleccioná al menos un producto para agregar al carrito.
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] px-4 sm:px-6 py-3.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-tight">
                  {selectedCount} de {items.length} seleccionados
                </p>
                <p className="text-base font-black tabular-nums text-[var(--text-primary)] leading-tight">
                  {fmtCurrency(totalSelected)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onConfirm(selectedList)}
                disabled={selectedCount === 0}
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
