"use client";

/* ── CategorySuggestionInline ────────────────────────────────────────────────
   Asistente heurístico de categoría en el form de inventario. Extraído de
   InventoryTab.tsx (2026-06-13).

   Dado el nombre del producto, el detector heurístico busca palabras clave
   y propone la categoría más probable. Si la categoría detectada difiere
   de la elegida actualmente, mostramos un panel naranja con un botón
   "Aplicar" que cambia la categoría en un click.

   Si las dos coinciden, mostramos un check verde tenue como confirmación.
   Si el detector no encuentra nada confiable, no mostramos nada (silencio). */

import { useMemo } from "react";
import { detectCategoryFromName } from "@/lib/category-detector";

export function CategorySuggestionInline({
  name,
  currentCategory,
  onApply,
}: {
  name: string;
  currentCategory: string;
  onApply: (id: string) => void;
}) {
  const detection = useMemo(() => detectCategoryFromName(name), [name]);
  if (!detection) return null;

  if (detection.id === currentCategory) {
    return (
      <p className="mt-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] flex items-center gap-1">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--data-success-500)]" />
        Categoría coincide con la detección automática.
      </p>
    );
  }

  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
          Sugerencia automática
        </p>
        <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
          Detectada: <span className="text-[var(--accent)]">{detection.label}</span>
        </p>
        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
          Por la palabra &ldquo;{detection.matchedKeyword}&rdquo;
        </p>
      </div>
      <button
        type="button"
        onClick={() => onApply(detection.id)}
        className="shrink-0 inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 active:scale-95 transition-all"
      >
        Aplicar
      </button>
    </div>
  );
}
