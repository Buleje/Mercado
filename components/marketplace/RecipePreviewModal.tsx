"use client";

/**
 * RecipePreviewModal — vista previa rica de receta.
 *
 * Layout: 2 columnas en desktop (md+), apilado en mobile.
 *   - Columna izquierda (md): ingredientes + selector de porciones + total + CTA.
 *   - Columna derecha (md): descripcion + pasos numerados.
 *   - Hero: imagen + categoria + tiempo + dificultad + banda de cocinabilidad.
 *
 * Datos por ingrediente (cuando el endpoint los provee):
 *   - availableInStores: en cuantas tiendas se encuentra
 *   - bestPrice / bestStoreName / bestStoreSlug: mejor oferta cross-store
 *   - essential: si falta esencial, banner ambar bloquea "agregar todo"
 *
 * Si un ingrediente esencial NO esta en ninguna tienda: se renderiza tachado
 * con CTA "Sugerir a una tienda" (placeholder mailto/toast).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  Clock,
  Users,
  Minus,
  Plus,
  ShoppingCart,
  Check,
  AlertTriangle,
  CheckCircle2,
  Store as StoreIcon,
  ChefHat,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useCart } from "@/contexts/cart-context";

export type RecipeIngredient = {
  id?: string;
  productoId?: number | null;
  storeProductId?: string | null;
  nombre: string;
  cantidad: number;
  unidad: string;
  precio: number;
  imagen?: string | null;
  stock: number;
  categoria?: string | null;
  essential?: boolean;
  availableInStores?: number;
  bestPrice?: number | null;
  bestStoreSlug?: string | null;
  bestStoreName?: string | null;
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
  pasos?: string[];
  cookable?: boolean;
  missingEssentials?: string[];
};

interface Props {
  recipe: RecipeForPreview | null;
  onClose: () => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

function isAvailable(ing: RecipeIngredient): boolean {
  if (typeof ing.availableInStores === "number") {
    return ing.availableInStores > 0;
  }
  return Boolean(ing.productoId && ing.productoId > 0 && ing.stock > 0);
}

export default function RecipePreviewModal({ recipe, onClose }: Props) {
  const open = recipe !== null;
  const baseServings = recipe?.porciones ?? 4;
  const [servings, setServings] = useState(baseServings);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { addItem } = useCart();

  useEffect(() => {
    if (recipe) {
      setServings(recipe.porciones ?? 4);
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
      precio: Number(((ing.bestPrice ?? ing.precio) * ing.cantidad * factor).toFixed(2)),
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
  const countDisponibles = ingredientesView.filter((v) => v.available).length;
  const countFaltantes = ingredientesView.filter((v) => !v.available).length;
  const cookable = recipe?.cookable !== false;
  const missing = recipe?.missingEssentials ?? [];

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(ingredientesView.filter((v) => v.available).map((v) => v.key)));
  }, [ingredientesView]);

  const clearAll = useCallback(() => setSelected(new Set()), []);

  const handleAddAll = useCallback(() => {
    if (!recipe) return;
    let added = 0;
    for (const v of ingredientesView) {
      if (!v.available || !selected.has(v.key) || !v.raw.productoId) continue;
      addItem({
        id: v.raw.productoId,
        name: v.raw.nombre,
        price: v.raw.bestPrice ?? v.raw.precio,
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
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[61] -translate-x-1/2 -translate-y-1/2",
            "w-[calc(100vw-1.5rem)] sm:w-full max-w-5xl max-h-[92vh] flex flex-col",
            "rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] shadow-[var(--shadow-xl)] overflow-hidden",
            "data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95",
          )}
          aria-describedby={undefined}
        >
          {/* ═══════════════════ HERO ═══════════════════ */}
          <div className="relative h-48 sm:h-60 shrink-0 bg-[var(--surface-sunken)]">
            {recipe.imageUrl ? (
              <Image
                src={recipe.imageUrl}
                alt={recipe.nombre}
                fill
                sizes="(max-width: 768px) 100vw, 1024px"
                className="object-cover"
              />
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center text-[var(--text-tertiary)] gap-3 bg-linear-to-br from-[var(--surface-sunken)] via-[var(--surface-canvas)] to-[var(--surface-sunken)]">
                <ChefHat className="h-14 w-14" strokeWidth={1.25} aria-hidden />
                <span className="text-[length:var(--ts-xs)] uppercase tracking-wider font-bold">
                  {recipe.categoria ?? "Receta"}
                </span>
              </div>
            )}
            <div
              className="absolute inset-x-0 bottom-0 h-3/4 bg-linear-to-t from-black/80 via-black/40 to-transparent"
              aria-hidden
            />
            <Dialog.Close asChild>
              <button
                aria-label="Cerrar"
                className="absolute top-3 right-3 h-10 w-10 inline-flex items-center justify-center rounded-full bg-white/95 text-[var(--text-primary)] hover:bg-white transition-colors shadow-md"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </Dialog.Close>

            <div className="absolute bottom-4 left-4 right-4 sm:left-6 sm:right-6">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {recipe.categoria && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-white/95 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-primary)]">
                    {recipe.categoria}
                  </span>
                )}
                {recipe.tiempoMinutos && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/95 text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)] tabular-nums">
                    <Clock className="h-3 w-3" strokeWidth={2} aria-hidden /> {recipe.tiempoMinutos} min
                  </span>
                )}
                {recipe.dificultad && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/95 text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)]">
                    {recipe.dificultad}
                  </span>
                )}
                {recipe.porciones && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/95 text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)] tabular-nums">
                    <Users className="h-3 w-3" strokeWidth={2} aria-hidden /> {recipe.porciones}
                  </span>
                )}
              </div>
              <Dialog.Title className="font-display text-2xl sm:text-3xl font-extrabold text-white leading-tight tracking-tight drop-shadow-md">
                {recipe.nombre}
              </Dialog.Title>
            </div>
          </div>

          {/* ═══════════════════ COOKABILITY BANNER ═══════════════════ */}
          <div
            className={cn(
              "shrink-0 px-5 sm:px-6 py-3 flex items-center gap-3 border-b text-sm font-semibold",
              cookable
                ? "bg-[var(--data-success-50,#ecfdf5)] border-[var(--data-success-200,#a7f3d0)] text-[var(--data-success-700,#047857)] dark:bg-emerald-950/40 dark:border-emerald-800/40 dark:text-emerald-300"
                : "bg-[var(--data-warning-50,#fffbeb)] border-[var(--data-warning-200,#fde68a)] text-[var(--data-warning-700,#b45309)] dark:bg-amber-950/40 dark:border-amber-800/40 dark:text-amber-300",
            )}
          >
            {cookable ? (
              <>
                <CheckCircle2 className="h-5 w-5 shrink-0" strokeWidth={2.25} />
                <span>
                  <strong>Listo para cocinar hoy.</strong>{" "}
                  {countDisponibles} de {ingredientesView.length} ingredientes disponibles en el marketplace.
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 shrink-0" strokeWidth={2.25} />
                <span>
                  <strong>Faltan ingredientes esenciales:</strong>{" "}
                  {missing.join(", ")}. Te avisamos cuando alguna tienda los tenga.
                </span>
              </>
            )}
          </div>

          {/* ═══════════════════ BODY 2-COL ═══════════════════ */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-0 divide-y md:divide-y-0 md:divide-x divide-[var(--rule-soft)]">
              {/* ── Col izquierda: ingredientes + porciones ── */}
              <div className="md:col-span-2 p-5 sm:p-6 space-y-5 bg-[var(--surface-sunken)]/40">
                {/* Selector de porciones */}
                <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Porciones
                    </p>
                    <div className="flex items-center rounded-lg border-2 border-[var(--rule-base)]">
                      <button
                        type="button"
                        onClick={() => setServings((s) => Math.max(minServ, s - 1))}
                        aria-label="Menos personas"
                        disabled={servings <= minServ}
                        className="h-9 w-9 inline-flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] rounded-l-md transition-colors disabled:opacity-40"
                      >
                        <Minus className="h-4 w-4" strokeWidth={2.25} />
                      </button>
                      <span className="min-w-[2.5rem] text-center text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                        {servings}
                      </span>
                      <button
                        type="button"
                        onClick={() => setServings((s) => Math.min(maxServ, s + 1))}
                        aria-label="Mas personas"
                        disabled={servings >= maxServ}
                        className="h-9 w-9 inline-flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] rounded-r-md transition-colors disabled:opacity-40"
                      >
                        <Plus className="h-4 w-4" strokeWidth={2.25} />
                      </button>
                    </div>
                  </div>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    Receta original para {recipe.porciones ?? 4} — ajustamos cantidades.
                  </p>
                </div>

                {/* Header lista */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-[var(--text-primary)]">
                    Ingredientes ({ingredientesView.length})
                  </h3>
                  <div className="flex items-center gap-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-[var(--accent)] hover:underline"
                    >
                      Todos
                    </button>
                    <span className="text-[var(--rule-base)]">·</span>
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-[var(--text-tertiary)] hover:underline"
                    >
                      Ninguno
                    </button>
                  </div>
                </div>

                {/* Lista de ingredientes — densa */}
                <ul className="space-y-2">
                  {ingredientesView.map((v) => {
                    const checked = selected.has(v.key);
                    const ing = v.raw;
                    if (!v.available) {
                      return (
                        <li
                          key={v.key}
                          className="rounded-lg border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-3 opacity-75"
                          role="option"
                          aria-selected={false}
                          aria-disabled="true"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="h-5 w-5 inline-flex items-center justify-center rounded-md bg-[var(--data-warning-50,#fffbeb)] text-[var(--data-warning-600,#d97706)] shrink-0">
                              <AlertTriangle className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-[var(--text-secondary)] line-through truncate">
                                {ing.nombre}
                              </p>
                              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                                {v.cantidad} {ing.unidad} · Sin stock en ninguna tienda
                              </p>
                            </div>
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
                            "w-full flex items-start gap-2.5 rounded-lg border-2 px-3.5 py-3 transition-all text-left",
                            checked
                              ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                              : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--text-tertiary)]",
                          )}
                        >
                          <span
                            className={cn(
                              "h-5 w-5 inline-flex items-center justify-center rounded-md border-2 shrink-0 transition-colors mt-0.5",
                              checked
                                ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                                : "bg-[var(--surface-raised)] border-[var(--rule-mid)]",
                            )}
                          >
                            {checked && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                                {ing.nombre}
                              </p>
                              <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)] shrink-0">
                                {fmt(v.precio)}
                              </span>
                            </div>
                            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5 truncate">
                              {v.cantidad} {ing.unidad}
                              {ing.bestStoreName && (
                                <> · <span className="font-semibold text-[var(--text-secondary)]">{ing.bestStoreName}</span></>
                              )}
                              {ing.availableInStores && ing.availableInStores > 1 && (
                                <> · {ing.availableInStores} tiendas</>
                              )}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* ── Col derecha: descripcion + pasos ── */}
              <div className="md:col-span-3 p-5 sm:p-6 space-y-6">
                {recipe.descripcion && (
                  <div>
                    <h3 className="text-sm font-extrabold uppercase tracking-wider text-[var(--text-primary)] mb-2">
                      Sobre este plato
                    </h3>
                    <p className="text-base text-[var(--text-secondary)] leading-relaxed">
                      {recipe.descripcion}
                    </p>
                  </div>
                )}

                {recipe.pasos && recipe.pasos.length > 0 && (
                  <div>
                    <h3 className="text-sm font-extrabold uppercase tracking-wider text-[var(--text-primary)] mb-3 flex items-center gap-2">
                      <ChefHat className="h-4 w-4" strokeWidth={2} />
                      Preparacion · {recipe.pasos.length} pasos
                    </h3>
                    <ol className="space-y-3">
                      {recipe.pasos.map((paso, idx) => (
                        <li key={idx} className="flex gap-3">
                          <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-white text-sm font-extrabold tabular-nums">
                            {idx + 1}
                          </span>
                          <p className="pt-0.5 text-[length:var(--ts-sm)] sm:text-base text-[var(--text-secondary)] leading-relaxed">
                            {paso}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {countFaltantes > 0 && cookable && (
                  <div className="rounded-lg border border-[var(--data-warning-200,#fde68a)] bg-[var(--data-warning-50,#fffbeb)] px-4 py-3 dark:bg-amber-950/40 dark:border-amber-800/40">
                    <p className="text-[length:var(--ts-xs)] font-bold text-[var(--data-warning-700,#b45309)] dark:text-amber-300">
                      {countFaltantes} ingrediente{countFaltantes !== 1 ? "s" : ""} opcional{countFaltantes !== 1 ? "es" : ""} sin stock
                    </p>
                    <p className="text-[length:var(--ts-xs)] text-[var(--data-warning-700,#b45309)]/80 dark:text-amber-300/80 mt-0.5">
                      Puedes cocinar el plato sin ellos o esperar a que alguna tienda los reponga.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══════════════════ FOOTER FIJO ═══════════════════ */}
          <div className="shrink-0 border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] px-5 sm:px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-center sm:text-left">
              <p className="text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)] font-bold">
                Total seleccionado
              </p>
              <p className="font-display text-2xl font-extrabold text-[var(--text-primary)] tabular-nums leading-none mt-0.5">
                {fmt(totalSeleccionado)}
                <span className="ml-2 text-[length:var(--ts-xs)] font-bold text-[var(--text-tertiary)]">
                  {countSeleccionado} de {countDisponibles}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {!cookable && missing[0] && (
                <Link
                  href={`/marketplace/buscar?q=${encodeURIComponent(missing[0])}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-4 h-12 text-sm font-bold text-[var(--text-secondary)] hover:border-[var(--text-tertiary)] transition-colors"
                  onClick={onClose}
                >
                  <StoreIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Buscar {missing[0]}
                </Link>
              )}
              <button
                type="button"
                onClick={handleAddAll}
                disabled={countSeleccionado === 0}
                className={cn(
                  "flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl px-6 h-12",
                  "text-sm font-extrabold uppercase tracking-wider transition-all",
                  "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 hover:shadow-lg active:scale-[0.98]",
                  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--accent)]",
                )}
              >
                <ShoppingCart className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                {countSeleccionado > 0
                  ? `Agregar ${countSeleccionado}`
                  : "Selecciona ingredientes"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
