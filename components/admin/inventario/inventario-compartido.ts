import { categories } from "@/data/products";
import { formatCurrency } from "@/lib/format";

/** Constantes y ayudas de módulo de Inventario (antes arriba de InventoryTab). */
/** Las columnas de datos en su orden de fábrica (casilla y Acciones son fijas). */
export const COLS_INVENTARIO = [
  "img", "producto", "categoria", "precio", "historial", "badge", "stock",
  "costoProm", "rotacion", "cambio30d", "vence", "estado",
] as const;

// ── Types ────────────────────────────────────────────────────────────────────

export type View = "productos" | "kanban";

// ── Helpers ──────────────────────────────────────────────────────────────────

export function fmt(n: number) { return `${formatCurrency(n)}`; }

export const realCategories = categories.filter(c => c.id !== "todos");

/**
 * La clave con la que se cuenta Y se filtra una categoría — la MISMA función
 * en los dos lados. Medido en el navegador (2026-09-22, tenant main): el
 * producto guarda «Abarrotes» y las pastillas/el autofiltro guardaban
 * «abarrotes» (el id que arma `dynamicCategories`), así que
 * `p.category !== catFilter` nunca matcheaba y elegir cualquier categoría
 * dejaba «Mostrando 0 de 57». Ya pasaba antes de los filtros de cabecera.
 */
export const claveCategoria = (c: string | null | undefined) => (c || "otros").toLowerCase().trim();

// ── Estilos compartidos de los modales de producto (minimalista 2026-06-06) ──
// Borde 1px, fondo blanco, foco con ring sutil — limpio y profesional, sin la
// densidad de border-2 + ring-4 anterior.
export const FIELD_INPUT =
  "w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm font-medium text-[var(--text-primary)] placeholder:font-normal placeholder:text-[var(--text-tertiary)] outline-none transition-colors hover:border-[var(--accent)]/40 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
export const FIELD_LABEL =
  "block text-xs font-semibold text-[var(--text-secondary)] mb-1.5";

// ── Component ────────────────────────────────────────────────────────────────
