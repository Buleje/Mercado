/**
 * Registro canónico de categorías del marketplace — SHARED entre server y client.
 *
 * Este archivo NO tiene `"server-only"` — es importable desde client components
 * (ej. `CategoryMegaMenu`) y desde DB classes. La constante `CATEGORIAS` es
 * datos puros: si hay que consultarla desde el server con Prisma, hacer la
 * query en `lib/db/marketplace-catalog.db.ts` (server-only) pero reutilizar
 * el mapping de acá.
 *
 * Los slugs son estables — renombrar uno requiere mantener el antiguo como
 * redirect para no romper SEO.
 */

export type CategoriaDef = {
  slug: string;
  label: string;
  subtitle: string;
  kicker: string;
  /** Sub-categorías usadas por el filtro de sidebar. */
  subCategorias: string[];
  /**
   * Keywords para matchear contra `Product.category` (case-insensitive,
   * substring). El primero se usa también como "canonical category" cuando
   * hay ambigüedad.
   */
  keywords: string[];
  /** Nombre de la ilustración del DS (se resuelve en el componente). */
  illustration:
    | "LimpiezaDomicilio"
    | "BodegaAbriendo"
    | "CarniceriaFresca"
    | "VerduraFresca"
    | "BebidasVarias"
    | "LacteosRefresh"
    | "CorazonLatiendo"
    | "PaicheEnOlla";
};

export const CATEGORIAS: Record<string, CategoriaDef> = {
  "limpieza-hogar": {
    slug: "limpieza-hogar",
    label: "Limpieza & Hogar",
    subtitle:
      "Todo lo que necesitas para tu casa — desde jabones hasta utensilios, en las bodegas cerca tuyo.",
    kicker: "Categoria",
    subCategorias: ["Jabones", "Detergentes", "Utensilios", "Desinfectantes"],
    keywords: ["limpieza", "limpie", "hogar"],
    illustration: "LimpiezaDomicilio",
  },
  abarrotes: {
    slug: "abarrotes",
    label: "Abarrotes",
    subtitle:
      "Arroz, fideos, aceites y enlatados — la despensa completa en un solo lugar.",
    kicker: "Categoria",
    subCategorias: ["Arroz", "Fideos", "Enlatados", "Aceites"],
    keywords: ["abarrote", "abarrotes"],
    illustration: "BodegaAbriendo",
  },
  carnes: {
    slug: "carnes",
    label: "Carniceria",
    subtitle:
      "Pollo, res, cerdo y embutidos frescos todos los dias — directo de las mejores carnicerias.",
    kicker: "Categoria",
    subCategorias: ["Pollo", "Res", "Cerdo", "Embutidos"],
    keywords: ["carne", "carnes", "carniceria"],
    illustration: "CarniceriaFresca",
  },
  "frutas-verduras": {
    slug: "frutas-verduras",
    label: "Frutas & Verduras",
    subtitle:
      "Lo mas fresco del mercado — frutas, verduras y hierbas del dia.",
    kicker: "Categoria",
    subCategorias: ["Frutas", "Verduras", "Hierbas"],
    keywords: ["fruta", "verdura", "frutas-verduras"],
    illustration: "VerduraFresca",
  },
  bebidas: {
    slug: "bebidas",
    label: "Bebidas",
    subtitle:
      "Gaseosas, jugos, aguas y licores — con delivery rapido a tu casa.",
    kicker: "Categoria",
    subCategorias: ["Gaseosas", "Jugos", "Aguas", "Licores"],
    keywords: ["bebida", "bebidas"],
    illustration: "BebidasVarias",
  },
  lacteos: {
    slug: "lacteos",
    label: "Lacteos",
    subtitle:
      "Leche, yogurt, queso y mantequilla — siempre frescos y en oferta.",
    kicker: "Categoria",
    subCategorias: ["Leche", "Yogurt", "Queso", "Mantequilla"],
    keywords: ["lacteo", "lacteos", "lácteo", "lácteos"],
    illustration: "LacteosRefresh",
  },
  panaderia: {
    slug: "panaderia",
    label: "Panaderia",
    subtitle:
      "Pan del dia, pasteles y galletas — de las mejores panaderias de Pucallpa.",
    kicker: "Categoria",
    subCategorias: ["Pan", "Pasteles", "Galletas"],
    keywords: ["panaderia", "panaderia", "pan"],
    illustration: "BodegaAbriendo",
  },
  farmacia: {
    slug: "farmacia",
    label: "Farmacia",
    subtitle:
      "Medicamentos OTC, cuidado personal y productos para bebes — con entrega discreta.",
    kicker: "Categoria",
    subCategorias: ["OTC", "Cuidado personal", "Bebes"],
    keywords: ["farmacia", "medicamento", "cuidado"],
    illustration: "CorazonLatiendo",
  },
};

/**
 * Devuelve la definición de categoría por slug, o `null` si no existe.
 */
export function getCategoriaDef(slug: string): CategoriaDef | null {
  return CATEGORIAS[slug] ?? null;
}

/**
 * Lista todos los slugs conocidos — para generateStaticParams o el menu.
 */
export function listCategoriaSlugs(): string[] {
  return Object.keys(CATEGORIAS);
}

// ─── Pure types (shared server/client) ───────────────────────────────────────

export type CatalogProduct = {
  /** StoreProduct.id (sirve para agregar al carrito multi-tienda) */
  storeProductId: string;
  productId: number;
  name: string;
  price: number;
  image: string | null;
  unit: string;
  category: string;
  stock: number | null;
  storeId: string;
  storeSlug: string;
  storeName: string;
  storeLogo: string | null;
  storeZone: string | null;
  storeRating: number;
};

export type GetByCategoryFilters = {
  /** Filtrar por storeId (array) */
  stores?: string[];
  /** Sub-categoría exacta (coincidencia parcial sobre Product.category). */
  subCategoria?: string;
  priceMin?: number;
  priceMax?: number;
  /** Solo en stock. */
  inStock?: boolean;
  /** Rating minimo de la tienda (0-5). */
  minStoreRating?: number;
  /** Zona de la tienda (Calleria, Manantay, Yarinacocha, etc.) */
  zone?: string;
  sort?: "relevance" | "price_asc" | "price_desc" | "rating" | "newest";
  limit?: number;
  offset?: number;
};
