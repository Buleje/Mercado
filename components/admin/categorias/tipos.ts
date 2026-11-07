/**
 * Tipos y reglas puras del editor de categorías (Productos e inventario ›
 * Categorías). La fila es lo que guarda Settings.categoryOrder más lo que el
 * servidor cuenta de los productos (`/api/admin/categorias`).
 */

export type SeoCategoria = {
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  ogImage?: string;
  canonical?: string;
  slug?: string;
};

/** Lo que se guarda en Settings.categoryOrder (forma de siempre). */
export type CategoriaGuardada = {
  id: string;
  label: string;
  emoji: string;
  visible: boolean;
  order: number;
  seo?: SeoCategoria;
};

/** Lo que devuelve GET /api/admin/categorias. */
export type CategoriaDelServidor = CategoriaGuardada & {
  productos: number;
  activos: number;
  valores: string[];
  guardada: boolean;
};

export type FilaCategoria = CategoriaDelServidor & {
  /** Clave estable de la fila (React key) aunque el id cambie al renombrar. */
  clave: string;
  /** El nombre con el que vino: si cambia y la categoría tiene productos, se renombran. */
  labelOriginal: string;
};

export type SeoScore = "good" | "warning" | "error";

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Misma clave que Productos y stock (`claveCategoria`): minúsculas + trim. */
export const claveDeInventario = (label: string) => (label || "otros").toLowerCase().trim();

export function puntajeSeo(cat: { seo?: SeoCategoria }): SeoScore {
  const seo = cat.seo;
  if (!seo?.metaTitle || !seo?.metaDescription) return "error";
  if (seo.metaTitle.length < 30 || seo.metaTitle.length > 60) return "warning";
  if (seo.metaDescription.length < 120 || seo.metaDescription.length > 160) return "warning";
  if (!seo.keywords || seo.keywords.length < 3) return "warning";
  return "good";
}

export const ROTULO_SEO: Record<SeoScore, string> = {
  good: "SEO óptimo",
  warning: "SEO mejorable",
  error: "SEO incompleto",
};

/** Plantilla SEO con el nombre real del comercio (no la marca del marketplace). */
export function seoPorDefecto(label: string, storeName: string, previo?: SeoCategoria): SeoCategoria {
  const minus = label.toLowerCase();
  return {
    ...previo,
    metaTitle: `${label} en ${storeName} | Compra online con delivery`,
    metaDescription: `Encuentra ${minus} frescos y de calidad en ${storeName}. Entrega rápida a domicilio. Paga con Yape, Plin o efectivo.`,
    keywords: [minus, "delivery", storeName.toLowerCase(), "compra online", "pucallpa"],
    slug: slugify(label),
  };
}

export function aFila(c: CategoriaDelServidor, i: number): FilaCategoria {
  return { ...c, emoji: c.emoji ?? "", clave: `${c.id}#${i}`, labelOriginal: c.label };
}

/** «11 productos · 4 inactivos» / «Sin productos». */
export function cuentaDeProductos(c: { productos: number; activos: number }): { principal: string; extra?: string } {
  if (c.productos === 0) return { principal: "Sin productos" };
  const principal = `${c.activos} producto${c.activos === 1 ? "" : "s"}`;
  const inactivos = c.productos - c.activos;
  return inactivos > 0 ? { principal, extra: `${inactivos} inactivo${inactivos === 1 ? "" : "s"}` } : { principal };
}

/** Lo que se guarda: sin las cuentas ni las claves de la pantalla. */
export function aGuardada(f: FilaCategoria, order: number, id: string): CategoriaGuardada {
  return { id, label: f.label.trim(), emoji: f.emoji ?? "", visible: f.visible, order, ...(f.seo ? { seo: f.seo } : {}) };
}
