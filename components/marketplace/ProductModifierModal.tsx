"use client";

/**
 * ProductModifierModal — selector de adicionales que se abre antes de
 * agregar el producto al carrito.
 *
 * Soporta 2 tipos de control por grupo:
 *   - Single (maxSelect === 1): radio cards.
 *   - Multi  (maxSelect > 1):   checkbox cards con limite.
 *
 * Validacion en cliente: required + minSelect/maxSelect. El boton de
 * "Agregar" se desactiva hasta que pase la validacion.
 *
 * Diseño 2026-05: hero compacto + grid responsive (cards con imagen,
 * rows sin imagen), price breakdown vivo en el footer, animaciones de
 * selección, sticky footer prominente.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { m as motion, AnimatePresence } from "framer-motion";
import {
  X, Check, Minus, Plus, ShoppingCart, Sparkles, Star, AlertCircle,
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
  initialSelection?: Record<string, string[]>;
  onConfirm: (args: {
    quantity: number;
    modifiers: SelectedModifier[];
    finalUnitPrice: number;
  }) => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

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
  open, onClose, product, groups, initialSelection, onConfirm,
}: ProductModifierModalProps) {
  const [selection, setSelection] = useState<SelectionState>(() =>
    initialSelection ?? defaultSelectionFor(groups),
  );
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [showNoteField, setShowNoteField] = useState(false);

  useEffect(() => {
    if (open) {
      setSelection(initialSelection ?? defaultSelectionFor(groups));
      setQuantity(1);
      setNote("");
      setShowNoteField(false);
    }
  }, [open, groups, initialSelection]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
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
          groupId: g.id, groupName: g.name,
          optionId: opt.id, optionName: opt.name,
          priceDelta: opt.priceDelta,
        });
      }
    }
    return out;
  }, [selection, groups]);

  const priceDeltaTotal = flatSelected.reduce((sum, m) => sum + m.priceDelta, 0);
  const unitPrice = product.price + priceDeltaTotal;
  const totalPrice = unitPrice * quantity;

  const validation = useMemo(() => {
    const errors: Array<{ groupId: string; message: string }> = [];
    for (const g of groups) {
      const count = (selection[g.id] ?? []).length;
      if (g.required && count === 0) {
        errors.push({ groupId: g.id, message: `Elegí ${g.name.toLowerCase()}` });
      }
      if (g.minSelect > 0 && count < g.minSelect) {
        errors.push({ groupId: g.id, message: `Mínimo ${g.minSelect} en ${g.name}` });
      }
      if (count > g.maxSelect) {
        errors.push({ groupId: g.id, message: `Máximo ${g.maxSelect} en ${g.name}` });
      }
    }
    return errors;
  }, [selection, groups]);

  const isValid = validation.length === 0;
  const totalSelectedCount = flatSelected.length;

  const toggle = (group: DbStoreProductModifierGroup, optionId: string) => {
    setSelection((prev) => {
      const current = prev[group.id] ?? [];
      const has = current.includes(optionId);
      let next: string[];
      if (group.maxSelect === 1) {
        next = has ? [] : [optionId];
      } else {
        if (has) next = current.filter((id) => id !== optionId);
        else if (current.length >= group.maxSelect) return prev;
        else next = [...current, optionId];
      }
      return { ...prev, [group.id]: next };
    });
  };

  const handleConfirm = () => {
    if (!isValid) return;
    const withNote: SelectedModifier[] = note.trim()
      ? [...flatSelected, {
          groupId: "__note", groupName: "Nota",
          optionId: "__note", optionName: note.trim().slice(0, 100),
          priceDelta: 0,
        }]
      : flatSelected;
    onConfirm({ quantity, modifiers: withNote, finalUnitPrice: unitPrice });
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog" aria-modal="true"
          aria-label={`Personalizar ${product.name}`}
        >
          {/* Backdrop con blur fuerte */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: 100, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 100, opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="relative z-10 w-full sm:max-w-lg max-h-[94vh] flex flex-col bg-[var(--surface-canvas)] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border border-[var(--rule-soft)]"
          >
            {/* ── Hero compacto con imagen + título ─────────────────────── */}
            <div className="relative shrink-0">
              {product.image ? (
                <div className="relative h-32 sm:h-36 w-full overflow-hidden">
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    sizes="(max-width: 640px) 100vw, 512px"
                    className="object-cover"
                    priority
                  />
                  {/* Gradient WCAG AA: 0/85 abajo → transparent arriba para garantizar
                      contraste sobre fotos de comida (el texto blanco sobre arroz
                      claro se perdía con el gradiente anterior). */}
                  <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/45 to-black/15" />
                  {/* Mesh teal sutil — textura sin sobrecargar */}
                  <div
                    aria-hidden
                    className="absolute inset-0 opacity-25 mix-blend-overlay pointer-events-none"
                    style={{
                      background: "radial-gradient(at 20% 0%, rgba(0,180,166,0.5) 0px, transparent 55%)",
                    }}
                  />
                </div>
              ) : (
                <div className="h-24 w-full bg-linear-to-br from-[var(--accent)] via-[var(--accent)]/80 to-[var(--data-success)] flex items-center justify-center">
                  <Sparkles className="h-8 w-8 text-white/90" aria-hidden />
                </div>
              )}

              {/* Drag handle visual (mobile bottom sheet feel) */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 h-1 w-10 rounded-full bg-white/50 sm:hidden" aria-hidden />

              {/* Close — sólido para tener contraste garantizado sobre cualquier foto */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute top-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/65 hover:bg-black text-white shadow-lg transition-all hover:scale-105 active:scale-95"
              >
                <X className="h-4 w-4" strokeWidth={2.75} aria-hidden />
              </button>

              {/* Title overlay con descripción + precio base */}
              <div className="absolute bottom-3 left-4 right-16">
                <p className="text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)] text-white/90 mb-0.5">
                  Armá tu pedido
                </p>
                <h2 className="font-display text-xl sm:text-[22px] font-black tracking-tight text-white drop-shadow-lg leading-tight line-clamp-2">
                  {product.name}
                </h2>
                <p className="mt-0.5 text-[length:var(--ts-xs)] font-bold text-white/85">
                  Desde {fmt(product.price)}
                  {product.unit && <span className="font-medium text-white/70"> · {product.unit}</span>}
                </p>
              </div>
            </div>

            {/* ── Body — grupos ─────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-5 space-y-6">
              {/* Indicador de progreso */}
              {groups.length > 0 && (
                <div className="flex items-center gap-2 text-[length:var(--ts-xs)]">
                  <span className="font-bold text-[var(--text-tertiary)]">
                    {totalSelectedCount > 0
                      ? `${totalSelectedCount} agregado${totalSelectedCount === 1 ? "" : "s"} a tu pedido`
                      : "Armá tu pedido a tu gusto"}
                  </span>
                  <span className="flex-1 h-px bg-[var(--rule-soft)]" />
                  {priceDeltaTotal > 0 && (
                    <span className="font-mono font-bold text-[var(--accent)]">
                      +{fmt(priceDeltaTotal)}
                    </span>
                  )}
                </div>
              )}

              {groups.length === 0 ? (
                <div className="text-center py-10">
                  <Sparkles className="h-10 w-10 mx-auto text-[var(--text-tertiary)] mb-3" />
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    Este producto no tiene adicionales
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    Solo elegí la cantidad y agregá al carrito.
                  </p>
                </div>
              ) : (
                groups.map((g) => {
                  const selected = selection[g.id] ?? [];
                  const count = selected.length;
                  const isMulti = g.maxSelect > 1;
                  const isFull = isMulti && count >= g.maxSelect;
                  const groupErr = validation.find((v) => v.groupId === g.id);
                  // Counter conversacional: "Hasta 4 — elegiste 0" en vez de "0/4"
                  const counterLabel = isMulti
                    ? count === 0
                      ? `Hasta ${g.maxSelect}`
                      : isFull
                        ? "Listo, llegaste al máximo"
                        : `Elegiste ${count} de ${g.maxSelect}`
                    : count > 0 ? "Listo" : "";

                  return (
                    <section key={g.id} aria-labelledby={`group-${g.id}`}>
                      {/* Group header */}
                      <header className="mb-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <h3
                              id={`group-${g.id}`}
                              className="font-display text-[length:var(--ts-lg)] font-black text-[var(--text-primary)] tracking-tight"
                            >
                              {g.name}
                            </h3>
                            {g.required && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[length:var(--ts-2xs)] font-black uppercase tracking-wider bg-[var(--data-error)] text-white">
                                <span className="h-1 w-1 rounded-full bg-white animate-pulse" />
                                Obligatorio
                              </span>
                            )}
                          </div>
                          {counterLabel && (
                            <span className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-black transition-colors whitespace-nowrap",
                              isFull
                                ? "bg-[var(--data-warning)]/15 text-[var(--data-warning)]"
                                : count > 0
                                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                                  : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                            )}>
                              {count > 0 && !isFull && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                              {counterLabel}
                            </span>
                          )}
                        </div>
                        {g.description && (
                          <p className="mt-1 text-[length:var(--ts-xs)] text-[var(--text-secondary)] leading-snug">
                            {g.description}
                          </p>
                        )}
                      </header>

                      {/* Options — UN SOLO PATRÓN unificado */}
                      <ul className="space-y-1.5" role="listbox" aria-multiselectable={isMulti}>
                        {g.options.map((opt) => (
                          <li key={opt.id}>
                            <OptionRow
                              option={opt}
                              isSelected={selected.includes(opt.id)}
                              isDisabled={!selected.includes(opt.id) && isFull}
                              isMulti={isMulti}
                              onClick={() => toggle(g, opt.id)}
                            />
                          </li>
                        ))}
                      </ul>

                      {groupErr && (
                        <p
                          role="alert"
                          className="mt-2 inline-flex items-center gap-1.5 text-[length:var(--ts-sm)] font-bold text-[var(--data-error)]"
                        >
                          <AlertCircle className="h-3.5 w-3.5" />
                          {groupErr.message}
                        </p>
                      )}
                    </section>
                  );
                })
              )}

              {/* Notas — colapsable para no abrumar */}
              {groups.length > 0 && (
                <div className="pt-2">
                  {showNoteField ? (
                    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
                      <div className="flex items-center justify-between mb-2">
                        <label
                          htmlFor="modifier-note"
                          className="text-[length:var(--ts-sm)] font-black text-[var(--text-primary)]"
                        >
                          Mensaje al cocinero
                        </label>
                        <button
                          type="button"
                          onClick={() => { setShowNoteField(false); setNote(""); }}
                          className="text-[length:var(--ts-xs)] font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                        >
                          Quitar
                        </button>
                      </div>
                      <textarea
                        id="modifier-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value.slice(0, 100))}
                        placeholder="Ej: bien doradito, sin cebolla, papas extra crocantes…"
                        rows={2}
                        autoFocus
                        className="block w-full resize-none rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-[length:var(--ts-sm)] font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                      />
                      <div className="mt-1 text-right text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] tabular-nums">
                        {note.length} / 100
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowNoteField(true)}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5 text-[length:var(--ts-sm)] font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-all"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Dejale un mensaje al cocinero
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── Footer sticky con price breakdown ──────────────────────── */}
            <div className="shrink-0 border-t border-[var(--rule-base)] bg-[var(--surface-raised)]">
              {/* Price breakdown vivo cuando hay adicionales */}
              {priceDeltaTotal > 0 && (
                <div className="px-4 sm:px-5 pt-3 pb-1 flex items-center justify-between text-[length:var(--ts-xs)]">
                  <span className="font-bold text-[var(--text-tertiary)]">
                    {fmt(product.price)} base + <span className="text-[var(--accent)]">{fmt(priceDeltaTotal)} extras</span>
                    {quantity > 1 && <span className="text-[var(--text-tertiary)]"> × {quantity}</span>}
                  </span>
                  <span className="font-mono font-bold text-[var(--text-secondary)] tabular-nums">
                    {fmt(unitPrice)}/u
                  </span>
                </div>
              )}

              <div className="px-4 sm:px-5 py-3 flex items-center gap-2.5">
                {/* Quantity stepper */}
                <div className="flex items-center rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] overflow-hidden shrink-0 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    aria-label="Disminuir cantidad"
                    disabled={quantity <= 1}
                    className="inline-flex h-12 w-11 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Minus className="h-4 w-4" strokeWidth={2.75} aria-hidden />
                  </button>
                  <span className="min-w-[2.5rem] text-center text-[length:var(--ts-base)] font-black tabular-nums text-[var(--text-primary)]">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                    aria-label="Aumentar cantidad"
                    className="inline-flex h-12 w-11 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] active:scale-95 transition-all"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.75} aria-hidden />
                  </button>
                </div>

                {/* CTA principal */}
                <motion.button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!isValid}
                  whileTap={isValid ? { scale: 0.98 } : {}}
                  className={cn(
                    "flex-1 inline-flex items-center justify-center gap-2 rounded-2xl h-12 px-3 text-[length:var(--ts-base)] font-black transition-all",
                    isValid
                      ? "bg-linear-to-r from-[var(--accent)] to-[var(--data-success)] text-white shadow-lg shadow-[var(--accent)]/35 hover:shadow-xl hover:shadow-[var(--accent)]/40"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed",
                  )}
                >
                  <ShoppingCart className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
                  {isValid ? (
                    <>
                      <span className="truncate">Agregar</span>
                      <span className="tabular-nums opacity-95 ml-auto">{fmt(totalPrice)}</span>
                    </>
                  ) : (
                    <span className="truncate">{validation[0]?.message ?? "Elegí las opciones"}</span>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── OptionRow — patrón ÚNICO horizontal para todas las opciones ────────────
// Diseño: card 72px alto. Thumb 56x56 a la izq (placeholder elegante si no hay
// imagen), nombre + badge "recomendado" en el medio, precio + selector a la
// derecha. Selected state: border 2px accent + ring ext + tint accent-soft.

interface OptionLike {
  id: string;
  name: string;
  imageUrl: string | null;
  priceDelta: number;
  isDefault: boolean;
}

function OptionRow({
  option, isSelected, isDisabled, isMulti, onClick,
}: {
  option: OptionLike;
  isSelected: boolean;
  isDisabled: boolean;
  isMulti: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      whileTap={!isDisabled ? { scale: 0.985 } : {}}
      role="option"
      aria-selected={isSelected}
      className={cn(
        "w-full flex items-center gap-3 rounded-2xl border-2 p-2.5 text-left transition-all",
        isSelected
          ? "border-[var(--accent)] bg-[var(--accent-soft)] ring-4 ring-[var(--accent)]/15 shadow-md"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface-sunken)]",
        isDisabled && "opacity-40 cursor-not-allowed",
      )}
    >
      {/* Thumbnail — siempre presente para uniformidad */}
      <span className={cn(
        "shrink-0 h-14 w-14 rounded-xl overflow-hidden border transition-colors",
        isSelected ? "border-[var(--accent)]/30" : "border-[var(--rule-soft)]",
        option.imageUrl ? "bg-[var(--surface-sunken)]" : "bg-[var(--accent-soft)]/40 flex items-center justify-center"
      )}>
        {option.imageUrl ? (
          <Image
            src={option.imageUrl}
            alt={option.name}
            width={56}
            height={56}
            className="object-cover w-full h-full"
          />
        ) : (
          <Sparkles className="h-5 w-5 text-[var(--accent)]/60" aria-hidden />
        )}
      </span>

      {/* Name + meta */}
      <span className="flex-1 min-w-0">
        <span className={cn(
          "block text-[length:var(--ts-sm)] font-extrabold leading-tight",
          isSelected ? "text-[var(--accent)]" : "text-[var(--text-primary)]"
        )}>
          {option.name}
        </span>
        {option.isDefault && (
          <span className="inline-flex items-center gap-0.5 mt-0.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider text-[var(--data-warning)]">
            <Star className="h-2.5 w-2.5 fill-current" /> Recomendado
          </span>
        )}
        {option.priceDelta !== 0 && (
          <span
            className={cn(
              "block mt-0.5 text-[length:var(--ts-xs)] font-black tabular-nums",
              option.priceDelta > 0
                ? "text-[var(--accent)]"
                : "text-[var(--data-success)]",
            )}
          >
            {option.priceDelta > 0 ? "+" : ""}{fmt(option.priceDelta)}
          </span>
        )}
      </span>

      {/* Selector — siempre visible, anima al cambiar estado */}
      <motion.span
        aria-hidden
        animate={{ scale: isSelected ? 1 : 0.92 }}
        transition={{ type: "spring", stiffness: 600, damping: 20 }}
        className={cn(
          "shrink-0 inline-flex h-7 w-7 items-center justify-center transition-colors",
          isMulti ? "rounded-lg" : "rounded-full",
          isSelected
            ? "bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/40"
            : "border-2 border-[var(--rule-strong)] bg-[var(--surface-canvas)]",
        )}
      >
        {isSelected && <Check className="h-4 w-4" strokeWidth={3.5} />}
      </motion.span>
    </motion.button>
  );
}
