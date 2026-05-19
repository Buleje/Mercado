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
          {/* Brandon 2026-05-18 v4: backdrop con tokens DS (alineado con
              FirstVisitCouponModal y MarketplaceFilters drawer) — coherencia
              visual entre todos los modals del marketplace. */}
          <motion.div
            className="absolute inset-0 bg-[var(--text-primary)]/55 backdrop-blur-md"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet — vertical en mobile, split 2-col en lg+ */}
          <motion.div
            initial={{ y: 100, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 100, opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className={cn(
              "relative z-10 w-full bg-[var(--surface-canvas)] rounded-t-3xl shadow-2xl overflow-hidden border border-[var(--rule-soft)]",
              "sm:max-w-lg sm:rounded-3xl max-h-[94vh] flex flex-col",
              // Desktop: split-view 2-col, modal más ancho.
              "lg:max-w-5xl lg:max-h-[88vh] lg:flex-row lg:items-stretch",
            )}
          >
            {/* ═══ COLUMNA IZQUIERDA — hero + meta + qty + CTA ═══════════════
                Mobile: hero compacto con título overlay (forma actual).
                Desktop: hero más alto + bloque meta debajo + spacer + qty/CTA
                anclado al fondo. Sticky por flex-col interno. */}
            <div className="shrink-0 lg:flex lg:flex-col lg:w-[420px] lg:border-r lg:border-[var(--rule-soft)] lg:overflow-y-auto">
              {/* Hero image — Brandon 2026-05-18 v4: imagen MÁS GRANDE en mobile
                  (h-44 sm:h-52 vs h-32/36 anterior) para que el cliente vea
                  bien el producto. Gradient sutil solo en la base (no oscurece
                  el centro de la imagen). */}
              <div className="relative shrink-0">
                {product.image ? (
                  <div className="relative h-44 sm:h-52 lg:h-auto lg:aspect-[4/3] w-full overflow-hidden">
                    <Image
                      src={product.image}
                      alt={product.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 512px, 420px"
                      className="object-cover"
                      priority
                    />
                    {/* Gradient base — solo donde va el título (bottom 1/3),
                        deja el centro de la imagen limpio para que el producto
                        se vea bien. */}
                    <div className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-black/85 via-black/50 to-transparent lg:hidden" />
                  </div>
                ) : (
                  <div className="h-32 sm:h-40 lg:h-56 w-full bg-linear-to-br from-[var(--accent)] via-[var(--accent)]/80 to-[var(--data-success-500)] flex items-center justify-center">
                    <Sparkles className="h-10 lg:h-12 w-10 lg:w-12 text-white/90" aria-hidden />
                  </div>
                )}

                {/* Drag handle solo mobile */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 h-1 w-10 rounded-full bg-white/50 sm:hidden" aria-hidden />

                {/* Close button — siempre visible */}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="absolute top-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/65 hover:bg-black text-white shadow-lg transition-all hover:scale-105 active:scale-95 z-10"
                >
                  <X className="h-4 w-4" strokeWidth={2.75} aria-hidden />
                </button>

                {/* Title overlay — SOLO mobile/tablet. Brandon 2026-05-18 v4:
                    diseño más limpio, eyebrow accent en lugar de "Armá tu
                    pedido" genérico (queda el eyebrow del progreso abajo).
                    Pricing más prominente. */}
                <div className="absolute bottom-3 left-4 right-16 lg:hidden">
                  <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white drop-shadow-lg leading-[1.1] line-clamp-2">
                    {product.name}
                  </h2>
                  <p className="mt-1.5 text-sm font-extrabold text-white tabular-nums">
                    Desde {fmt(product.price)}
                    {product.unit && <span className="font-medium text-white/75"> / {product.unit}</span>}
                  </p>
                </div>
              </div>

              {/* Desktop meta block — bloque de info debajo de la imagen */}
              <div className="hidden lg:block px-5 pt-5 pb-3 border-b border-[var(--rule-soft)]">
                <p className="text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                  Armá tu pedido
                </p>
                <h2 className="mt-1 font-display text-[26px] font-black tracking-tight text-[var(--text-primary)] leading-[1.1]">
                  {product.name}
                </h2>
                {product.description && (
                  <p className="mt-2 text-sm text-[var(--text-secondary)] leading-snug line-clamp-3">
                    {product.description}
                  </p>
                )}
                <p className="mt-3 text-sm font-bold text-[var(--text-secondary)]">
                  Desde <span className="text-[var(--text-primary)] font-black tabular-nums">{fmt(product.price)}</span>
                  {product.unit && <span className="font-medium text-[var(--text-tertiary)]"> · {product.unit}</span>}
                </p>
              </div>

              {/* Spacer desktop — empuja el resumen al fondo */}
              <div className="hidden lg:block lg:flex-1" />

              {/* Quantity + breakdown + CTA — DESKTOP solamente (mobile lo ve abajo) */}
              <div className="hidden lg:block border-t border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 space-y-3">
                {/* Cantidad */}
                <div className="flex items-center justify-between">
                  <span className="text-[length:var(--ts-xs)] font-black uppercase tracking-wider text-[var(--text-tertiary)]">
                    Cantidad
                  </span>
                  <div className="flex items-center rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] overflow-hidden shadow-sm">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      aria-label="Disminuir cantidad"
                      disabled={quantity <= 1}
                      className="inline-flex h-12 w-11 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Minus className="h-4 w-4" strokeWidth={2.75} aria-hidden />
                    </button>
                    <span className="min-w-[2.75rem] text-center text-lg font-black tabular-nums text-[var(--text-primary)]">
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
                </div>

                {/* Breakdown vertical */}
                <div className="space-y-1 pt-2 border-t border-[var(--rule-soft)]">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-tertiary)] font-medium">Base</span>
                    <span className="tabular-nums font-bold text-[var(--text-secondary)]">{fmt(product.price)}</span>
                  </div>
                  {priceDeltaTotal > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-tertiary)] font-medium">Adicionales</span>
                      <span className="tabular-nums font-bold text-[var(--accent)]">+{fmt(priceDeltaTotal)}</span>
                    </div>
                  )}
                  {quantity > 1 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-tertiary)] font-medium">Cantidad</span>
                      <span className="tabular-nums font-bold text-[var(--text-secondary)]">× {quantity}</span>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between pt-1.5 border-t border-[var(--rule-soft)]">
                    <span className="text-[length:var(--ts-2xs)] font-black uppercase tracking-wider text-[var(--text-tertiary)]">
                      Total
                    </span>
                    <span className="font-display text-2xl font-black tabular-nums text-[var(--text-primary)]">
                      {fmt(totalPrice)}
                    </span>
                  </div>
                </div>

                {/* CTA */}
                <motion.button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!isValid}
                  whileTap={isValid ? { scale: 0.98 } : {}}
                  className={cn(
                    "w-full inline-flex items-center justify-center gap-2 rounded-2xl h-14 px-4 text-base font-black transition-all",
                    isValid
                      ? "bg-linear-to-r from-[var(--accent)] to-[var(--data-success-500)] text-white shadow-lg shadow-[var(--accent)]/35 hover:shadow-xl hover:shadow-[var(--accent)]/40"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed",
                  )}
                >
                  <ShoppingCart className="h-5 w-5 shrink-0" strokeWidth={2.5} aria-hidden />
                  {isValid ? (
                    <span>Agregar al carrito</span>
                  ) : (
                    <span className="truncate">{validation[0]?.message ?? "Elegí las opciones"}</span>
                  )}
                </motion.button>
              </div>
            </div>

            {/* ═══ COLUMNA DERECHA — grupos + notas (scroll interno desktop) ═══ */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-5 lg:px-6 py-5 lg:py-6 space-y-6 lg:max-h-[88vh]">
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
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[length:var(--ts-2xs)] font-black uppercase tracking-wider bg-[var(--data-error-500)] text-white">
                                <span className="h-1 w-1 rounded-full bg-white animate-pulse" />
                                Obligatorio
                              </span>
                            )}
                          </div>
                          {counterLabel && (
                            <span className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-black transition-colors whitespace-nowrap",
                              isFull
                                ? "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)]"
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
                          className="mt-2 inline-flex items-center gap-1.5 text-[length:var(--ts-sm)] font-bold text-[var(--data-error-500)]"
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

            {/* ── Footer mobile/tablet — sticky con price breakdown ──────
                En desktop (lg+) este footer se oculta porque qty + breakdown +
                CTA ya están dentro de la columna izquierda anclados al fondo. */}
            <div className="lg:hidden shrink-0 border-t border-[var(--rule-base)] bg-[var(--surface-raised)]">
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

              {/* Brandon 2026-05-18 v4: footer mobile rediseñado.
                  ANTES: stepper rectangular + CTA flex-1 con label "Agregar S/X" — el stepper competía visualmente con el CTA y el botón se veía angosto.
                  AHORA: stepper compacto pill arriba a la izquierda con label "Cant." + CTA full-width prominente abajo con precio integrado a la derecha. Más respiro, jerarquía clara: cantidad arriba, acción abajo. */}
              <div
                className="px-4 sm:px-5 pt-3 space-y-2.5"
                style={{ paddingBottom: "max(0.875rem, env(safe-area-inset-bottom))" }}
              >
                {/* Stepper compacto + breakdown precio en una fila */}
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2">
                    <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                      Cant.
                    </span>
                    <div className="inline-flex items-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] overflow-hidden shadow-sm">
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        aria-label="Disminuir cantidad"
                        disabled={quantity <= 1}
                        className="inline-flex h-10 w-10 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] active:scale-95 transition-all disabled:opacity-40"
                      >
                        <Minus className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
                      </button>
                      <span className="min-w-[2rem] text-center text-base font-black tabular-nums text-[var(--text-primary)]">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                        aria-label="Aumentar cantidad"
                        className="inline-flex h-10 w-10 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] active:scale-95 transition-all"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
                      </button>
                    </div>
                  </div>
                  {/* Total a la derecha — refleja precio + modifiers + qty */}
                  <div className="text-right">
                    <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-none">
                      Total
                    </p>
                    <p className="mt-0.5 text-lg font-black tabular-nums text-[var(--text-primary)]">
                      {fmt(totalPrice)}
                    </p>
                  </div>
                </div>

                {/* CTA principal full-width prominente */}
                <motion.button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!isValid}
                  whileTap={isValid ? { scale: 0.98 } : {}}
                  className={cn(
                    "w-full inline-flex items-center justify-center gap-2 rounded-2xl h-13 px-4 text-sm font-extrabold uppercase tracking-wide transition-all",
                    isValid
                      ? "bg-linear-to-br from-[var(--accent-600,var(--accent))] to-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/30 ring-1 ring-[var(--accent)]/40 hover:shadow-lg"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed",
                  )}
                  style={{ height: "3.25rem" }}
                >
                  {isValid ? (
                    <>
                      <ShoppingCart className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
                      <span>Agregar al carrito</span>
                    </>
                  ) : (
                    <span className="truncate normal-case tracking-normal font-bold">
                      {validation[0]?.message ?? "Elegí las opciones"}
                    </span>
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
          <span className="inline-flex items-center gap-0.5 mt-0.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider text-[var(--data-warning-500)]">
            <Star className="h-2.5 w-2.5 fill-current" /> Recomendado
          </span>
        )}
        {option.priceDelta !== 0 && (
          <span
            className={cn(
              "block mt-0.5 text-[length:var(--ts-xs)] font-black tabular-nums",
              option.priceDelta > 0
                ? "text-[var(--accent)]"
                : "text-[var(--data-success-500)]",
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
            ? "bg-[var(--accent-600,var(--accent))] text-white shadow-md shadow-[var(--accent)]/40"
            : "border-2 border-[var(--rule-strong)] bg-[var(--surface-canvas)]",
        )}
      >
        {isSelected && <Check className="h-4 w-4" strokeWidth={3.5} />}
      </motion.span>
    </motion.button>
  );
}
