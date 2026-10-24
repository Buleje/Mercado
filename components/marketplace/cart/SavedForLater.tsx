"use client";

/**
 * SavedForLater — Guardar para después + sección de recupero.
 *
 * Cada ItemRow del carrito puede mostrar el botón "Guardar para después"
 * (exportado aquí como SaveButton para importar en page.tsx).
 *
 * Los items se guardan en localStorage bajo la key "buleje-saved-for-later"
 * como CartItem[]. No se mezclan con el carrito activo.
 *
 * La sección SavedForLaterSection muestra esos items con un botón
 * "Mover al carrito" por cada uno (addItem + remover de guardados).
 */

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Bookmark, ShoppingCart, Trash2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { type CartItem } from "@/hooks/use-marketplace-cart";

// ── Persistencia localStorage ────────────────────────────────────────────────

const SAVED_KEY = "buleje-saved-for-later";

function readSaved(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

function writeSaved(items: CartItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(items));
  } catch {
    // storage lleno — silent fail
  }
}

// Genera una clave de línea única compatible con la del carrito
function lineKey(item: CartItem) {
  return `${item.storeId}-${item.productId}-${item.modifierHash ?? ""}`;
}

// ── Hook compartido ──────────────────────────────────────────────────────────

export function useSavedForLater() {
  const [saved, setSaved] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSaved(readSaved());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeSaved(saved);
  }, [saved, hydrated]);

  const saveItem = useCallback((item: CartItem) => {
    setSaved((prev) => {
      const key = lineKey(item);
      if (prev.some((s) => lineKey(s) === key)) return prev;
      return [...prev, item];
    });
  }, []);

  const unsaveItem = useCallback((item: CartItem) => {
    setSaved((prev) => prev.filter((s) => lineKey(s) !== lineKey(item)));
  }, []);

  const isSaved = useCallback(
    (item: CartItem) => saved.some((s) => lineKey(s) === lineKey(item)),
    [saved],
  );

  return { saved, saveItem, unsaveItem, isSaved };
}

// ── Botón "Guardar / Guardado" por item ─────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

interface SaveButtonProps {
  item: CartItem;
  onSave: (item: CartItem) => void;
  onRemoveFromCart: () => void;
  isSaved: boolean;
}

export function SaveButton({ item, onSave, onRemoveFromCart, isSaved }: SaveButtonProps) {
  const handleClick = useCallback(() => {
    if (isSaved) return; // ya guardado — no duplicar
    onSave(item);
    onRemoveFromCart();
  }, [isSaved, onSave, item, onRemoveFromCart]);

  return (
    <button
      type="button"
      aria-label={isSaved ? `${item.name} ya está guardado para después` : `Guardar ${item.name} para después`}
      aria-pressed={isSaved}
      onClick={handleClick}
      disabled={isSaved}
      className={cn(
        "inline-flex items-center gap-1.5 min-h-[40px] px-2 -mx-2",
        "text-[length:var(--ts-xs)] font-semibold transition-colors",
        isSaved
          ? "text-[var(--accent)] cursor-default"
          : "text-[var(--text-tertiary)] hover:text-[var(--accent)]",
      )}
    >
      {isSaved ? (
        <Bookmark className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      ) : (
        <Bookmark className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      )}
      {isSaved ? "Guardado" : "Guardar para después"}
    </button>
  );
}

// ── Sección "Guardados para después" ────────────────────────────────────────

interface SavedForLaterSectionProps {
  saved: CartItem[];
  onMoveToCart: (item: CartItem) => void;
  onRemoveSaved: (item: CartItem) => void;
}

export function SavedForLaterSection({
  saved,
  onMoveToCart,
  onRemoveSaved,
}: SavedForLaterSectionProps) {
  if (saved.length === 0) return null;

  return (
    <section
      aria-label="Guardados para después"
      className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden"
    >
      {/* Cabecera */}
      <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-6 py-4">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-raised)] border border-[var(--rule-soft)] text-[var(--accent)] shrink-0">
          <Bookmark className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Guardados
          </p>
          <p className="text-[length:var(--ts-sm)] font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)]">
            Para después ({saved.length})
          </p>
        </div>
      </header>

      <ul className="divide-y divide-[var(--rule-soft)]" role="list">
        {saved.map((item) => (
          <li
            key={lineKey(item)}
            className="flex gap-4 px-6 py-4 items-center"
          >
            {/* Imagen */}
            <div className="relative h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-[var(--surface-sunken)] border border-[var(--rule-soft)]">
              {item.image ? (
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-[var(--text-tertiary)]">
                  <ShoppingCart className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-[length:var(--ts-sm)] font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)] line-clamp-2">
                {item.name}
              </p>
              <p className="mt-0.5 text-[length:var(--ts-sm)] font-black tabular-nums text-[var(--text-primary)]">
                {fmt(item.price)}
              </p>
              <p className="mt-0.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                {item.storeName}
              </p>
            </div>

            {/* Acciones */}
            <div className="shrink-0 flex flex-col sm:flex-row items-end sm:items-center gap-2">
              <button
                type="button"
                aria-label={`Mover ${item.name} al carrito`}
                onClick={() => onMoveToCart(item)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl border border-[var(--accent)]",
                  "bg-[var(--accent)] text-white px-4 h-10",
                  "text-[length:var(--ts-xs)] font-bold hover:bg-[var(--accent)]/90 transition-colors",
                )}
              >
                <ShoppingCart className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                <span className="hidden sm:inline">Mover al carrito</span>
                <span className="sm:hidden">Al carrito</span>
              </button>

              <button
                type="button"
                aria-label={`Eliminar ${item.name} de guardados`}
                onClick={() => onRemoveSaved(item)}
                className="inline-flex items-center justify-center h-10 w-10 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
