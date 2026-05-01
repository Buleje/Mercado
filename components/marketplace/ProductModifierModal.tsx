"use client";

/**
 * ProductModifierModal — selector de variaciones que se abre antes de
 * agregar el producto al carrito.
 *
 * Soporta 2 tipos de control por grupo:
 *   - Single (maxSelect === 1): radio cards.
 *   - Multi  (maxSelect > 1):   checkbox cards con limite.
 *
 * Validacion en cliente: required + minSelect/maxSelect. El boton de
 * "Agregar" se desactiva hasta que pase la validacion.
 *
 * Estilo: framer-motion slide-up bottom en mobile, modal centrado
 * desktop. Foco trapped, Escape cierra. UX inspirado en Rappi/Uber Eats.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { m as motion, AnimatePresence } from "framer-motion";
import {
  X,
  Check,
  Minus,
  Plus,
  ShoppingCart,
  Sparkles,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbStoreProductModifierGroup } from "@/lib/db/marketplace.db";
import type { SelectedModifier } from "@/hooks/use-marketplace-cart";

interface ProductModifierModalProps {
  open: boolean;
  onClose: () => void;
  product: {
    id: number;
    name: string;
    price: number;
    image: string | null;
    unit: string | null;
    category?: string | null;
    storeId: string;
    storeName: string;
    storeSlug: string;
    storeProductId: string;
    description?: string | null;
  };
  groups: DbStoreProductModifierGroup[];
  /**
   * Selección inicial para reabrir el modal en modo "edit" (re-edit
   * desde el AddedToCartDrawer). Map groupId → array de optionIds.
   */
  initialSelection?: Record<string, string[]>;
  /** Llamado cuando el cliente confirma la seleccion. */
  onConfirm: (args: {
    quantity: number;
    modifiers: SelectedModifier[];
    finalUnitPrice: number;
  }) => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

/** Estado de seleccion: groupId → array de optionIds elegidos. */
type SelectionState = Record<string, string[]>;

function defaultSelectionFor(groups: DbStoreProductModifierGroup[]): SelectionState {
  const out: SelectionState = {};
  for (const g of groups) {
    const defaults = g.options.filter((o) => o.isDefault).map((o) => o.id);
    out[g.id] = defaults.slice(0, g.maxSelect);
  }
  return out;
}

export default function ProductModifierModal({
  open,
  onClose,
  product,
  groups,
  initialSelection,
  onConfirm,
}: ProductModifierModalProps) {
  const [selection, setSelection] = useState<SelectionState>(() =>
    initialSelection ?? defaultSelectionFor(groups),
  );
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  // Resetear seleccion cuando el modal se abre / cambian los grupos.
  // Si hay initialSelection (modo re-edit), usar ese; sino, defaults.
  useEffect(() => {
    if (open) {
      setSelection(initialSelection ?? defaultSelectionFor(groups));
      setQuantity(1);
      setNote("");
    }
  }, [open, groups, initialSelection]);

  // Escape cierra
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const flatSelected: SelectedModifier[] = useMemo(() => {
    const out: SelectedModifier[] = [];
    for (const g of groups) {
      const selectedIds = selection[g.id] ?? [];
      for (const id of selectedIds) {
        const opt = g.options.find((o) => o.id === id);
        if (!opt) continue;
        out.push({
          groupId: g.id,
          groupName: g.name,
          optionId: opt.id,
          optionName: opt.name,
          priceDelta: opt.priceDelta,
        });
      }
    }
    return out;
  }, [selection, groups]);

  const priceDeltaTotal = flatSelected.reduce((sum, m) => sum + m.priceDelta, 0);
  const unitPrice = product.price + priceDeltaTotal;
  const totalPrice = unitPrice * quantity;

  // Validacion
  const validation = useMemo(() => {
    const errors: Array<{ groupId: string; message: string }> = [];
    for (const g of groups) {
      const count = (selection[g.id] ?? []).length;
      if (g.required && count === 0) {
        errors.push({ groupId: g.id, message: `Elegí ${g.name.toLowerCase()}` });
      }
      if (g.minSelect > 0 && count < g.minSelect) {
        errors.push({
          groupId: g.id,
          message: `Mínimo ${g.minSelect} en ${g.name}`,
        });
      }
      if (count > g.maxSelect) {
        errors.push({
          groupId: g.id,
          message: `Máximo ${g.maxSelect} en ${g.name}`,
        });
      }
    }
    return errors;
  }, [selection, groups]);

  const isValid = validation.length === 0;

  const toggle = (group: DbStoreProductModifierGroup, optionId: string) => {
    setSelection((prev) => {
      const current = prev[group.id] ?? [];
      const has = current.includes(optionId);
      let next: string[];
      if (group.maxSelect === 1) {
        // Single — replace
        next = has ? [] : [optionId];
      } else {
        // Multi — toggle con limite
        if (has) {
          next = current.filter((id) => id !== optionId);
        } else if (current.length >= group.maxSelect) {
          // Tope alcanzado — no agregar
          return prev;
        } else {
          next = [...current, optionId];
        }
      }
      return { ...prev, [group.id]: next };
    });
  };

  const handleConfirm = () => {
    if (!isValid) return;
    // Inyectamos el note como un modifier "virtual" con priceDelta=0 para
    // que el carrito y el order route lo persistan sin tocar contratos.
    const withNote: SelectedModifier[] = note.trim()
      ? [
          ...flatSelected,
          {
            groupId: "__note",
            groupName: "Nota",
            optionId: "__note",
            optionName: note.trim().slice(0, 100),
            priceDelta: 0,
          },
        ]
      : flatSelected;
    onConfirm({
      quantity,
      modifiers: withNote,
      finalUnitPrice: unitPrice,
    });
  };

  // Portal a document.body para escapar stacking contexts del catalogo
  // (sticky categorias z-20, motion.article whileHover transforms, etc.).
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-label={`Personalizar ${product.name}`}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="relative z-10 w-full sm:max-w-lg max-h-[92vh] flex flex-col bg-[var(--surface-canvas)] rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="relative">
              {product.image ? (
                <div className="relative h-40 sm:h-48 w-full">
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    sizes="(max-width: 640px) 100vw, 512px"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
                </div>
              ) : (
                <div className="h-32 w-full bg-linear-to-br from-[var(--accent)] to-[var(--accent)]/70 flex items-center justify-center">
                  <Sparkles className="h-10 w-10 text-white/80" aria-hidden />
                </div>
              )}

              {/* Close */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              </button>

              {/* Title */}
              <div className="absolute bottom-3 left-4 right-4">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/85">
                  Personalizar
                </p>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white drop-shadow-md">
                  {product.name}
                </h2>
                <p className="text-sm font-bold text-white/90 mt-0.5">
                  Desde {fmt(product.price)}
                  {product.unit && (
                    <span className="font-medium text-white/70"> / {product.unit}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Grupos */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-5">
              {groups.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)] text-center py-8">
                  Este producto no tiene variaciones configuradas.
                </p>
              ) : (
                groups.map((g) => {
                  const selected = selection[g.id] ?? [];
                  const count = selected.length;
                  const isMulti = g.maxSelect > 1;
                  const isFull = isMulti && count >= g.maxSelect;
                  const groupErr = validation.find((v) => v.groupId === g.id);
                  return (
                    <section key={g.id} aria-labelledby={`group-${g.id}`}>
                      <header className="flex items-center justify-between gap-3 mb-2">
                        <h3
                          id={`group-${g.id}`}
                          className="text-base font-bold text-[var(--text-primary)]"
                        >
                          {g.name}
                        </h3>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {g.required && (
                            <span className="inline-flex items-center rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error)] dark:text-[var(--data-error)]">
                              Obligatorio
                            </span>
                          )}
                          {isMulti && (
                            <span className="inline-flex items-center rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] tabular-nums">
                              {count}/{g.maxSelect}
                            </span>
                          )}
                        </div>
                      </header>

                      <ul className="space-y-1.5" role="listbox" aria-multiselectable={isMulti}>
                        {g.options.map((opt) => {
                          const isSel = selected.includes(opt.id);
                          const disabled = !isSel && isFull;
                          return (
                            <li key={opt.id}>
                              <button
                                type="button"
                                onClick={() => toggle(g, opt.id)}
                                disabled={disabled}
                                aria-selected={isSel}
                                role="option"
                                className={cn(
                                  "w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                                  isSel
                                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                                    : "border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40",
                                  disabled && "opacity-40 cursor-not-allowed",
                                )}
                              >
                                {/* Selector visual */}
                                <span
                                  aria-hidden
                                  className={cn(
                                    "shrink-0 inline-flex h-6 w-6 items-center justify-center transition-all",
                                    isMulti ? "rounded-md" : "rounded-full",
                                    isSel
                                      ? "bg-[var(--accent)] text-white"
                                      : "border-2 border-[var(--rule-base)]",
                                  )}
                                >
                                  {isSel && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                                </span>

                                {/* Image */}
                                {opt.imageUrl && (
                                  <span className="shrink-0 h-10 w-10 rounded-lg overflow-hidden bg-[var(--surface-sunken)]">
                                    <Image
                                      src={opt.imageUrl}
                                      alt={opt.name}
                                      width={40}
                                      height={40}
                                      className="object-cover w-full h-full"
                                    />
                                  </span>
                                )}

                                <span className="flex-1 min-w-0">
                                  <span className="block text-sm font-bold text-[var(--text-primary)]">
                                    {opt.name}
                                  </span>
                                  {opt.priceDelta !== 0 && (
                                    <span
                                      className={cn(
                                        "block text-[length:var(--ts-xs)] font-bold tabular-nums",
                                        opt.priceDelta > 0
                                          ? "text-[var(--accent)]"
                                          : "text-emerald-600 dark:text-emerald-400",
                                      )}
                                    >
                                      {opt.priceDelta > 0 ? "+" : ""}
                                      {fmt(opt.priceDelta)}
                                    </span>
                                  )}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>

                      {groupErr && (
                        <p
                          role="alert"
                          className="mt-2 text-[length:var(--ts-xs)] font-semibold text-[var(--data-error)] dark:text-[var(--data-error)]"
                        >
                          {groupErr.message}
                        </p>
                      )}
                    </section>
                  );
                })
              )}
            </div>

            {/* Notas para este producto */}
            <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 sm:px-6 py-3">
              <label
                htmlFor="modifier-note"
                className="text-sm font-bold text-[var(--text-primary)]"
              >
                Notas para este producto
              </label>
              <textarea
                id="modifier-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 100))}
                placeholder="Comentarios sobre tu pedido"
                rows={2}
                className="mt-1.5 block w-full resize-none rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              />
              <div className="mt-1 text-right text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                {note.length} / 100
              </div>
            </div>

            {/* Footer fijo */}
            <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] px-4 sm:px-6 py-3 flex items-center gap-3">
              {/* Quantity stepper */}
              <div className="flex items-center gap-1 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Disminuir cantidad"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <Minus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                </button>
                <span className="min-w-[2rem] text-center text-base font-black tabular-nums text-[var(--text-primary)]">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                  aria-label="Aumentar cantidad"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                </button>
              </div>

              <button
                type="button"
                onClick={handleConfirm}
                disabled={!isValid}
                className={cn(
                  "flex-1 inline-flex items-center justify-center gap-2 rounded-full py-3 text-sm font-black transition-all",
                  isValid
                    ? "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 active:scale-[0.99] shadow-md"
                    : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed",
                )}
              >
                <ShoppingCart className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                {isValid ? `Agregar · ${fmt(totalPrice)}` : "Completá las opciones"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
