"use client";

/**
 * QuickAddModal — Modal centrado de "agregar al carrito" para la tienda
 * individual `/t/[slug]/...`.
 *
 * Soporta:
 *   - Modificadores opcionales (cremas, adicionales, talla, etc.) cargados
 *     desde GET /api/products/{id}/modifiers.
 *   - Nota libre del cliente (max 100 chars).
 *   - Cálculo de total con priceDelta de modifiers.
 *
 * El note final se construye como un string legible que incluye los modifiers
 * elegidos para que el carrito muestre el detalle al merchant. Esto evita
 * tocar el schema del CartItem (zona de peligro).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, m as motion } from "framer-motion";
import { X, Minus, Plus, ShoppingCart } from "lucide-react";
import { useQuickAdd } from "@/contexts/quick-add-context";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

const MAX_QTY = 20;
const NOTE_MAX = 100;

type ModifierOption = {
  id: string;
  name: string;
  priceDelta: number;
  isDefault?: boolean;
};
type ModifierGroup = {
  id: string;
  name: string;
  description?: string | null;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
};

/**
 * Meta inyectada por CategoryProductGrid cuando el product viene del
 * marketplace multi-store. Mismo contrato que `QuickAddDrawer`.
 */
type WithStoreMeta = {
  _bulejeStoreMeta?: {
    storeId: string;
    storeName: string;
    storeSlug: string;
    storeProductId: string;
  };
};

export default function QuickAddModal() {
  const { product, isOpen, close } = useQuickAdd();
  const { addItem } = useCart();
  const { addItem: addMarketplaceItem } = useMarketplaceCart();
  const { showToast } = useToast();
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState("");
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  /** selected[groupId] = Set<optionId> */
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQty(1);
      setAdding(false);
      setNote("");
      setGroups([]);
      setSelected({});
      // Pequeño delay para asegurar que el DOM esté listo y el focus visible.
      requestAnimationFrame(() => closeButtonRef.current?.focus());
    }
  }, [isOpen, product?.id]);

  // Carga modifiers cuando se abre el modal con un product nuevo.
  useEffect(() => {
    if (!isOpen || !product?.id) return;
    let cancelled = false;
    setGroupsLoading(true);
    fetch(`/api/products/${product.id}/modifiers`)
      .then((r) => (r.ok ? r.json() : { groups: [] }))
      .then((data) => {
        if (cancelled) return;
        const fetched: ModifierGroup[] = data?.groups ?? [];
        setGroups(fetched);
        // Pre-selecciona defaults.
        const initial: Record<string, Set<string>> = {};
        for (const g of fetched) {
          const def = g.options.filter((o) => o.isDefault).map((o) => o.id);
          if (def.length > 0) initial[g.id] = new Set(def);
        }
        setSelected(initial);
      })
      .catch(() => setGroups([]))
      .finally(() => {
        if (!cancelled) setGroupsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, product?.id]);

  const toggleOption = (group: ModifierGroup, optionId: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      const cur = new Set(next[group.id] ?? []);
      if (group.maxSelect <= 1) {
        // Single-select: clear other options in this group, toggle this one.
        if (cur.has(optionId)) cur.clear();
        else {
          cur.clear();
          cur.add(optionId);
        }
      } else {
        if (cur.has(optionId)) cur.delete(optionId);
        else if (cur.size < group.maxSelect) cur.add(optionId);
      }
      next[group.id] = cur;
      return next;
    });
  };

  const modifiersTotal = useMemo(() => {
    let sum = 0;
    for (const g of groups) {
      const chosen = selected[g.id];
      if (!chosen) continue;
      for (const o of g.options) {
        if (chosen.has(o.id)) sum += o.priceDelta;
      }
    }
    return sum;
  }, [groups, selected]);

  const missingRequired = useMemo(() => {
    for (const g of groups) {
      if (!g.required) continue;
      const chosen = selected[g.id];
      const count = chosen?.size ?? 0;
      if (count < Math.max(1, g.minSelect)) return g.name;
    }
    return null;
  }, [groups, selected]);

  const buildNote = (): string => {
    const lines: string[] = [];
    for (const g of groups) {
      const chosen = selected[g.id];
      if (!chosen || chosen.size === 0) continue;
      const picked = g.options.filter((o) => chosen.has(o.id));
      const text = picked
        .map((o) => (o.priceDelta > 0 ? `${o.name} (+S/${Number(o.priceDelta).toFixed(2)})` : o.name))
        .join(", ");
      lines.push(`${g.name}: ${text}`);
    }
    if (note.trim()) lines.push(`Comentario: ${note.trim()}`);
    return lines.join(" · ").slice(0, 250);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  // Bloquea scroll del body mientras el modal está abierto — UX estándar.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const handleAdd = () => {
    if (!product || adding) return;
    if (missingRequired) {
      showToast(`Falta elegir: ${missingRequired}`, product.image ?? "");
      return;
    }
    setAdding(true);
    const noteText = buildNote();
    const effectivePrice = product.price + modifiersTotal;
    const enriched = noteText
      ? { ...product, price: effectivePrice, note: noteText }
      : { ...product, price: effectivePrice };
    const meta = (product as WithStoreMeta)._bulejeStoreMeta;
    if (meta) {
      addMarketplaceItem({
        storeId: meta.storeId,
        storeName: meta.storeName,
        storeSlug: meta.storeSlug,
        storeProductId: meta.storeProductId,
        productId: product.id,
        name: product.name + (noteText ? ` (personalizado)` : ""),
        price: effectivePrice,
        quantity: qty,
        image: product.image ?? null,
        unit: product.unit ?? null,
      });
    } else {
      for (let i = 0; i < qty; i++) addItem(enriched);
    }
    showToast(`${qty}× ${product.name}`, product.image);
    setTimeout(() => {
      close();
    }, 350);
  };

  const stock = product?.stock;
  const outOfStock = stock === 0;
  const maxQty = Math.min(MAX_QTY, stock ?? MAX_QTY);

  return (
    <AnimatePresence>
      {isOpen && product && (
        <motion.div
          key="quickadd-modal-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[8000] flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-md"
          onClick={close}
        >
          <motion.div
            key="quickadd-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label={`Agregar ${product.name}`}
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl mx-0 sm:mx-4 max-h-[94vh] flex flex-col overflow-hidden rounded-t-3xl sm:rounded-[28px] bg-white shadow-[var(--shadow-xl)] dark:bg-[var(--surface-raised)] border border-[var(--rule-base)]"
          >
            {/* Botón cerrar flotante (sobre la imagen) */}
            <button
              ref={closeButtonRef}
              onClick={close}
              aria-label="Cerrar"
              className="absolute right-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-[var(--text-primary)] shadow-lg backdrop-blur transition-all hover:scale-105 hover:bg-white"
            >
              <X className="h-4.5 w-4.5" strokeWidth={2.5} aria-hidden="true" />
            </button>

            {/* Body con scroll — layout 2-col en desktop (imagen + info) */}
            <div className="flex flex-1 flex-col overflow-y-auto sm:flex-row">
              {/* Columna IMAGEN (40% en desktop, 100% mobile) */}
              <div className="relative shrink-0 w-full sm:w-[44%] aspect-[4/3] sm:aspect-auto sm:min-h-[420px] bg-linear-to-br from-[var(--surface-sunken)] to-[var(--surface-canvas)]">
                {product.image ? (
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    sizes="(max-width: 640px) 100vw, 50vw"
                    className="object-cover"
                    priority
                    quality={92}
                    placeholder="blur"
                    blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNCIgaGVpZ2h0PSI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmM2Y0ZjYiLz48L3N2Zz4="
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--text-tertiary)]">
                    <svg
                      className="h-14 w-14 opacity-40"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect width={18} height={18} x={3} y={3} rx={2} />
                      <circle cx={9} cy={9} r={2} />
                      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                    </svg>
                    <span className="text-sm font-semibold">Sin imagen</span>
                  </div>
                )}

                {/* Badge de categoría flotante */}
                {product.category && (
                  <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-primary)] shadow-md backdrop-blur">
                    {product.category}
                  </div>
                )}

                {/* Badge agotado overlay */}
                {outOfStock && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
                    <span className="px-4 py-2 rounded-full bg-white text-sm font-extrabold text-[var(--text-primary)] shadow-lg">
                      AGOTADO
                    </span>
                  </div>
                )}

                {/* Stock low indicator */}
                {!outOfStock && product.stock != null && product.stock > 0 && product.stock <= 5 && (
                  <div className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-white shadow-md">
                    Solo quedan {product.stock}
                  </div>
                )}
              </div>

              {/* Columna INFO (resto en desktop) */}
              <div className="flex flex-1 flex-col px-5 sm:px-7 py-5 sm:py-6">
                {/* Nombre + unidad */}
                <h3 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] leading-tight tracking-tight pr-12 sm:pr-0">
                  {product.name}
                </h3>
                {product.unit && (
                  <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                    Por {product.unit}
                  </p>
                )}

                {/* Precio destacado */}
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-extrabold text-[var(--color-primary)] tracking-tight">
                    S/ {Number(product.price).toFixed(2)}
                  </span>
                  {product.unit && (
                    <span className="text-sm text-[var(--text-tertiary)]">
                      / {product.unit}
                    </span>
                  )}
                </div>

                {/* Línea con detalle delivery + pago */}
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  <span className="inline-flex items-center gap-1">
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    25 min
                  </span>
                  <span className="h-1 w-1 rounded-full bg-[var(--text-tertiary)]/40" />
                  <span>Yape · Plin · Efectivo</span>
                  {!outOfStock && product.stock != null && product.stock > 5 && (
                    <>
                      <span className="h-1 w-1 rounded-full bg-[var(--text-tertiary)]/40" />
                      <span className="text-[var(--data-success-600)]">En stock</span>
                    </>
                  )}
                </div>

                {/* Descripción con borde sutil */}
                {product.description && (
                  <div className="mt-5 rounded-2xl bg-[var(--surface-sunken)] px-4 py-3.5 border border-[var(--rule-soft)]">
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
                      Descripción
                    </p>
                    <p className="text-sm leading-relaxed text-[var(--text-primary)]">
                      {product.description}
                    </p>
                  </div>
                )}

              {outOfStock && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[length:var(--ts-sm)] text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200">
                  Producto agotado por ahora.
                </div>
              )}

              {groupsLoading && (
                <div className="mt-5 space-y-2" aria-hidden="true">
                  <div className="h-4 w-32 animate-pulse rounded bg-[var(--surface-sunken)]" />
                  <div className="h-10 animate-pulse rounded-lg bg-[var(--surface-sunken)]" />
                </div>
              )}

              {!groupsLoading &&
                groups.map((g) => {
                  const chosen = selected[g.id] ?? new Set<string>();
                  const isMulti = g.maxSelect > 1;
                  return (
                    <fieldset
                      key={g.id}
                      className="mt-5 rounded-2xl border border-[var(--rule-soft)]"
                    >
                      <legend className="px-4 pt-3 flex w-full items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[var(--text-primary)]">
                          {g.name}
                        </span>
                        <span
                          className={
                            g.required
                              ? "shrink-0 rounded-full bg-rose-100 px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)] dark:bg-rose-950/30 dark:text-[var(--text-tertiary)]"
                              : "shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)] dark:bg-emerald-950/30 dark:text-emerald-300"
                          }
                        >
                          {g.required ? "Obligatorio" : "Opcional"}
                        </span>
                      </legend>
                      {g.description && (
                        <p className="px-4 pt-1 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                          {g.description}
                          {isMulti ? ` · Hasta ${g.maxSelect}` : ""}
                        </p>
                      )}
                      <div className="mt-2 divide-y divide-[var(--rule-soft)]">
                        {g.options.map((o) => {
                          const isChecked = chosen.has(o.id);
                          return (
                            <label
                              key={o.id}
                              className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-sunken)]"
                            >
                              <span className="flex items-center gap-3">
                                <input
                                  type={isMulti ? "checkbox" : "radio"}
                                  name={`mod-${g.id}`}
                                  checked={isChecked}
                                  onChange={() => toggleOption(g, o.id)}
                                  className="h-4 w-4 accent-[var(--accent)]"
                                />
                                <span className="text-sm text-[var(--text-primary)]">{o.name}</span>
                              </span>
                              {o.priceDelta > 0 && (
                                <span className="text-sm font-semibold text-[var(--text-secondary)]">
                                  +S/{Number(o.priceDelta).toFixed(2)}
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                })}

              {/* Notas para este producto */}
              <div className="mt-5">
                <label
                  htmlFor="quickadd-note"
                  className="text-sm font-bold text-[var(--text-primary)]"
                >
                  Notas para este producto
                </label>
                <textarea
                  id="quickadd-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                  placeholder="Comentarios sobre tu pedido"
                  rows={3}
                  className="mt-1.5 block w-full resize-none rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                />
                <div className="mt-1 text-right text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  {note.length} / {NOTE_MAX}
                </div>
              </div>
              </div>{/* /info col */}
            </div>{/* /body row */}

            {/* Footer sticky con stepper + total + CTA */}
            <div className="shrink-0 border-t border-[var(--rule-soft)] bg-white px-5 py-4 dark:bg-[var(--surface-raised)]">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center rounded-xl border border-[var(--rule-base)]">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1 || outOfStock}
                    aria-label="Disminuir cantidad"
                    className="flex h-10 w-10 items-center justify-center text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span
                    aria-live="polite"
                    className="min-w-[2.5rem] text-center text-sm font-bold text-[var(--text-primary)]"
                  >
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                    disabled={qty >= maxQty || outOfStock}
                    aria-label="Aumentar cantidad"
                    className="flex h-10 w-10 items-center justify-center text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="text-right">
                  <div className="text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)]">
                    Subtotal
                  </div>
                  <div className="text-base font-extrabold text-[var(--text-primary)]">
                    S/ {((product.price + modifiersTotal) * qty).toFixed(2)}
                  </div>
                  {modifiersTotal > 0 && (
                    <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                      incl. +S/{(modifiersTotal * qty).toFixed(2)} adicionales
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleAdd}
                disabled={outOfStock || adding}
                className="mt-3 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] text-base font-bold text-white shadow-lg shadow-[var(--color-primary)]/25 transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                {outOfStock
                  ? "Agotado"
                  : adding
                  ? "Agregando…"
                  : `Agregar S/${((product.price + modifiersTotal) * qty).toFixed(2)}`}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
