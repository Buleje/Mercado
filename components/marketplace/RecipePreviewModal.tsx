"use client";

/**
 * RecipePreviewModal — modal central de vista previa de receta.
 *
 * Reemplaza la pagina dedicada `/recetas/[id]`. Click en card de receta
 * abre este modal con:
 *   - Imagen + titulo + tiempo + dificultad.
 *   - Selector de porciones (+/-) que escala los ingredientes proporcionalmente.
 *   - Lista de ingredientes:
 *       * Disponibles en marketplace (stock > 0 + productoId): chip blanco con
 *         checkbox seleccionable + cantidad ajustada.
 *       * NO disponibles: chip gris, sin checkbox, etiqueta "no disponible".
 *   - CTA "Agregar todos al carrito" (suma solo los seleccionados disponibles).
 *
 * Estilo Holded/Buleje: minimal, tokens, sin sombras fuertes, sin emojis.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  Clock,
  Users,
  Minus,
  Plus,
  ShoppingCart,
  Check,
  AlertCircle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useCart } from "@/contexts/cart-context";

export type RecipeIngredient = {
  id?: string;
  productoId?: number | null;
  nombre: string;
  cantidad: number;
  unidad: string;
  precio: number;
  imagen?: string | null;
  stock: number;
  categoria?: string;
};

export type RecipeForPreview = {
  id: string;
  nombre: string;
  descripcion?: string | null;
  tiempoMinutos?: number;
  porciones?: number;
  dificultad?: string;
  categoria?: string;
  imageUrl?: string | null;
  ingredientes: RecipeIngredient[];
};

interface Props {
  recipe: RecipeForPreview | null;
  onClose: () => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

function isAvailable(ing: RecipeIngredient): boolean {
  return Boolean(ing.productoId && ing.productoId > 0 && ing.stock > 0);
}

export default function RecipePreviewModal({ recipe, onClose }: Props) {
  const open = recipe !== null;
  const baseServings = recipe?.porciones ?? 4;
  const [servings, setServings] = useState(baseServings);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { addItem } = useCart();

  // Reset al abrir/cerrar
  useEffect(() => {
    if (recipe) {
      setServings(recipe.porciones ?? 4);
      // Auto-seleccionar todos los disponibles por defecto
      const ids = new Set<string>();
      recipe.ingredientes.forEach((ing, i) => {
        if (isAvailable(ing)) ids.add(ing.id ?? `${ing.nombre}-${i}`);
      });
      setSelected(ids);
    } else {
      setSelected(new Set());
    }
  }, [recipe]);

  const factor = recipe ? servings / Math.max(1, recipe.porciones ?? 4) : 1;

  const ingredientesView = useMemo(() => {
    if (!recipe) return [];
    return recipe.ingredientes.map((ing, i) => ({
      key: ing.id ?? `${ing.nombre}-${i}`,
      raw: ing,
      cantidad: Number((ing.cantidad * factor).toFixed(2)),
      precio: Number((ing.precio * factor).toFixed(2)),
      available: isAvailable(ing),
    }));
  }, [recipe, factor]);

  const totalSeleccionado = useMemo(
    () =>
      ingredientesView
        .filter((v) => v.available && selected.has(v.key))
        .reduce((acc, v) => acc + v.precio, 0),
    [ingredientesView, selected],
  );
  const countSeleccionado = ingredientesView.filter(
    (v) => v.available && selected.has(v.key),
  ).length;

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleAddAll = useCallback(() => {
    if (!recipe) return;
    let added = 0;
    for (const v of ingredientesView) {
      if (!v.available || !selected.has(v.key) || !v.raw.productoId) continue;
      addItem({
        id: v.raw.productoId,
        name: v.raw.nombre,
        price: v.precio,
        image: v.raw.imagen || "",
        unit: v.raw.unidad,
        category: v.raw.categoria || "Receta",
      });
      added++;
    }
    if (added > 0) onClose();
  }, [recipe, ingredientesView, selected, addItem, onClose]);

  if (!recipe) return null;

  const minServ = 1;
  const maxServ = 20;

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[61] -translate-x-1/2 -translate-y-1/2",
            "w-[calc(100vw-2rem)] sm:w-full max-w-3xl max-h-[90vh] flex flex-col",
            "rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] shadow-2xl overflow-hidden",
            "data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95",
          )}
          aria-describedby={undefined}
        >
          {/* Header con imagen */}
          <div className="relative h-44 sm:h-56 shrink-0 bg-[var(--surface-sunken)]">
            {recipe.imageUrl ? (
              <Image
                src={recipe.imageUrl}
                alt={recipe.nombre}
                fill
                sizes="(max-width: 640px) 100vw, 768px"
                className="object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-[var(--text-tertiary)]">
                <span className="text-[length:var(--ts-xs)] uppercase tracking-wider">Sin imagen</span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" aria-hidden />
            <Dialog.Close asChild>
              <button
                aria-label="Cerrar"
                className="absolute top-3 right-3 h-9 w-9 inline-flex items-center justify-center rounded-full bg-white/95 text-[var(--text-primary)] hover:bg-white transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </Dialog.Close>
            <div className="absolute bottom-3 left-4 right-4">
              {recipe.categoria && (
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/90 mb-1">
                  {recipe.categoria}
                </p>
              )}
              <Dialog.Title className="text-xl sm:text-2xl font-black text-white leading-tight">
                {recipe.nombre}
              </Dialog.Title>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                {recipe.tiempoMinutos && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-0.5 text-[length:var(--ts-xs)] font-semibold text-[var(--text-primary)] tabular-nums">
                    <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden /> {recipe.tiempoMinutos} min
                  </span>
                )}
                {recipe.dificultad && (
                  <span className="inline-flex items-center rounded-full bg-white/95 px-2.5 py-0.5 text-[length:var(--ts-xs)] font-semibold text-[var(--text-primary)]">
                    {recipe.dificultad}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Body scrolleable */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
            {recipe.descripcion && (
              <p className="text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-relaxed">
                {recipe.descripcion}
              </p>
            )}

            {/* Selector de porciones */}
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.75} aria-hidden />
                <div>
                  <p className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-primary)]">
                    Para {servings} {servings === 1 ? "persona" : "personas"}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    Receta original: {recipe.porciones ?? 4} porciones — ajustamos cantidades automaticamente
                  </p>
                </div>
              </div>
              <div className="flex items-center rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)]">
                <button
                  type="button"
                  onClick={() => setServings((s) => Math.max(minServ, s - 1))}
                  aria-label="Menos personas"
                  disabled={servings <= minServ}
                  className="h-9 w-9 inline-flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] rounded-l-lg transition-colors disabled:opacity-40"
                >
                  <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
                <span className="min-w-[2.5rem] text-center text-[length:var(--ts-sm)] font-bold tabular-nums text-[var(--text-primary)]">
                  {servings}
                </span>
                <button
                  type="button"
                  onClick={() => setServings((s) => Math.min(maxServ, s + 1))}
                  aria-label="Mas personas"
                  disabled={servings >= maxServ}
                  className="h-9 w-9 inline-flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] rounded-r-lg transition-colors disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </div>
            </div>

            {/* Lista de ingredientes */}
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-[length:var(--ts-sm)] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  Ingredientes
                </h3>
                <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                  {ingredientesView.filter((v) => v.available).length} disponibles ·{" "}
                  {ingredientesView.filter((v) => !v.available).length} no disponibles
                </p>
              </div>
              <ul className="space-y-2">
                {ingredientesView.map((v) => {
                  const checked = selected.has(v.key);
                  if (!v.available) {
                    return (
                      <li
                        key={v.key}
                        className="flex items-center gap-3 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-3 opacity-60"
                        aria-disabled="true"
                      >
                        <span className="h-5 w-5 inline-flex items-center justify-center rounded border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] shrink-0">
                          <AlertCircle className="h-3 w-3" strokeWidth={2} aria-hidden />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[length:var(--ts-sm)] font-medium text-[var(--text-tertiary)] line-through">
                            {v.raw.nombre}
                          </p>
                          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                            {v.cantidad} {v.raw.unidad} · No disponible en marketplace
                          </p>
                        </div>
                      </li>
                    );
                  }
                  return (
                    <li key={v.key}>
                      <button
                        type="button"
                        onClick={() => toggle(v.key)}
                        aria-pressed={checked}
                        className={cn(
                          "w-full flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors text-left",
                          checked
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                            : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--rule-mid)]",
                        )}
                      >
                        <span
                          className={cn(
                            "h-5 w-5 inline-flex items-center justify-center rounded border-2 shrink-0 transition-colors",
                            checked
                              ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                              : "bg-[var(--surface-raised)] border-[var(--rule-mid)]",
                          )}
                        >
                          {checked && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)]">
                            {v.raw.nombre}
                          </p>
                          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                            {v.cantidad} {v.raw.unidad}
                            {v.raw.categoria ? ` · ${v.raw.categoria}` : ""}
                          </p>
                        </div>
                        <span className="text-[length:var(--ts-sm)] font-bold tabular-nums text-[var(--text-primary)] shrink-0">
                          {fmt(v.precio)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Footer fijo */}
          <div className="border-t border-[var(--rule-soft)] px-5 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-[var(--surface-raised)]">
            <div className="text-center sm:text-left">
              <p className="text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)] font-semibold">
                Total seleccionado
              </p>
              <p className="text-xl font-black text-[var(--text-primary)] tabular-nums">
                {fmt(totalSeleccionado)}{" "}
                <span className="text-[length:var(--ts-xs)] font-normal text-[var(--text-tertiary)]">
                  · {countSeleccionado} {countSeleccionado === 1 ? "ingrediente" : "ingredientes"}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddAll}
              disabled={countSeleccionado === 0}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 w-full sm:w-auto",
                "text-[length:var(--ts-sm)] font-semibold transition-colors",
                "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <ShoppingCart className="h-4 w-4" strokeWidth={2} aria-hidden />
              Agregar al carrito
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
