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
export const claveCategoria = (c: string | null | undefined) => normalizarCategoria(c ?? "") || "otros";

/**
 * Cómo se comparan dos nombres de categoría: sin mayúsculas, sin tildes y con
 * guiones (10-10). «Servicios De Salón», «servicios-de-salon» y «SERVICIOS DE
 * SALON» son la misma. Copia en cliente de `normalizarCategoria` de
 * `lib/db/categorias-catalogo.db.ts` (ese archivo importa Prisma y no puede
 * llegar al navegador): si cambia una, cambia la otra.
 */
export function normalizarCategoria(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * El texto que se GUARDA en `Product.category` para una categoría: el que más
 * usan sus productos hoy (en Blas «madera-aserrada», no «Madera aserrada»).
 * La tienda y el menú QR agrupan por ese texto tal cual: guardar el nombre
 * «bonito» partía la categoría en dos (reviewer 10-10). Sin productos, su id
 * de Ajustes (lo que guardaba el formulario de antes).
 */
export function textoDeCategoria(
  c: { id: string; label: string; valores: string[] },
  productos: ReadonlyArray<{ category?: string | null }>,
): string {
  const claves = new Set([c.id, c.label, ...c.valores].map((v) => claveCategoria(v)));
  const usos = new Map<string, number>();
  for (const p of productos) {
    const t = p.category ?? "";
    if (t && claves.has(claveCategoria(t))) usos.set(t, (usos.get(t) ?? 0) + 1);
  }
  let mejor: string | undefined;
  let n = 0;
  for (const [t, k] of usos) {
    if (k > n || (k === n && t === c.label)) { mejor = t; n = k; }
  }
  return mejor ?? c.valores[0] ?? c.id;
}

/** Una categoría de `GET /api/admin/categorias`: la lista de Ajustes unida con las de los productos. */
export interface CategoriaCatalogo {
  id: string;
  label: string;
  visible: boolean;
  /** Los textos tal cual están en `Product.category` que caen en esta categoría. */
  valores: string[];
}


/**
 * La búsqueda del Inventario: nombre o código, sin distinguir mayúsculas en
 * NINGUNO de los dos lados. Antes sólo bajaba lo buscado y el escáner, que
 * pasa el código tal cual, no encontraba `MU003` (27 de 130 códigos tienen letras).
 */
export function coincideBusqueda(p: { name: string; barcode?: string | null }, busqueda: string): boolean {
  const q = busqueda.trim().toLowerCase();
  if (!q) return true;
  return p.name.toLowerCase().includes(q) || (p.barcode?.toLowerCase().includes(q) ?? false);
}

// ── Estilos compartidos de los modales de producto (minimalista 2026-06-06) ──
// Borde 1px, fondo blanco, foco con ring sutil — limpio y profesional, sin la
// densidad de border-2 + ring-4 anterior.
export const FIELD_INPUT =
  "w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm font-medium text-[var(--text-primary)] placeholder:font-normal placeholder:text-[var(--text-tertiary)] outline-none transition-colors hover:border-[var(--accent)]/40 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
export const FIELD_LABEL =
  "block text-xs font-semibold text-[var(--text-secondary)] mb-1.5";

// ── Component ────────────────────────────────────────────────────────────────
