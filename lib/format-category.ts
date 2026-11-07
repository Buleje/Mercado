/**
 * lib/format-category.ts — ÚNICA vía para mostrar una categoría al cliente.
 *
 * Problema que resuelve (Brandon 2026-07-05): las categorías son texto libre
 * por tienda y se guardan como slug sin tilde ("pollo-brasa", "polleria",
 * "lacteos"). Cada superficie las mostraba distinto:
 *   - Los CHIPS/tabs del storefront (StoreCategories) pintaban el slug CRUDO
 *     → el cliente veía "pollo-brasa", "broaster", "guarniciones".
 *   - Los TÍTULOS de sección (StoreCatalog) hacían su propio title-case inline.
 *   - Las store cards usaban CSS `capitalize` → "Polleria" (sin acento).
 * Resultado: navegación inconsistente y poco legible. Este helper es la única
 * fuente: lookup curado (acentos/casing PE) + fallback title-case cuidado.
 *
 * OJO: solo formatea el TEXTO mostrado. El valor de filtrado sigue siendo el
 * slug original (no cambiar la clave que se compara contra productCategory).
 */

/**
 * Etiquetas curadas para las categorías más comunes en Perú (los slugs no
 * llevan tilde). Clave = slug normalizado (lowercase, guiones). Cubre rubros
 * de negocio (polleria, ferreteria…) y categorías de producto (bebidas…).
 */
const KNOWN_LABELS: Record<string, string> = {
  // Rubros de negocio
  polleria: "Pollería",
  ferreteria: "Ferretería",
  panaderia: "Panadería",
  farmacia: "Farmacia",
  restaurante: "Restaurante",
  bodega: "Bodega",
  minimarket: "Minimarket",
  bazar: "Bazar",
  jugueria: "Juguería",
  pizzeria: "Pizzería",
  cevicheria: "Cevichería",
  pasteleria: "Pastelería",
  licoreria: "Licorería",
  // Categorías de producto
  "pollo-brasa": "Pollo a la brasa",
  "pollos-brasa": "Pollo a la brasa",
  "pollo-a-la-brasa": "Pollo a la brasa",
  broaster: "Broaster",
  salchipapa: "Salchipapas",
  salchipapas: "Salchipapas",
  guarniciones: "Guarniciones",
  postres: "Postres",
  promociones: "Promociones",
  bebidas: "Bebidas",
  gaseosas: "Gaseosas",
  cervezas: "Cervezas",
  abarrotes: "Abarrotes",
  limpieza: "Limpieza",
  lacteos: "Lácteos",
  carnes: "Carnes",
  embutidos: "Embutidos",
  snacks: "Snacks",
  dulces: "Dulces",
  "frutas-verduras": "Frutas y verduras",
  "frutas-y-verduras": "Frutas y verduras",
  frutas: "Frutas",
  verduras: "Verduras",
  panaderia_pasteleria: "Panadería y pastelería",
  higiene: "Higiene personal",
  mascotas: "Mascotas",
  hogar: "Hogar",
  utiles: "Útiles",
  jugos: "Jugos",
  cafe: "Café",
  desayunos: "Desayunos",
  menu: "Menú",
  menus: "Menús",
  combos: "Combos",
  entradas: "Entradas",
  sopas: "Sopas",
  parrillas: "Parrillas",
  otros: "Otros",
};

/**
 * Convierte un slug/label de categoría en texto legible para el cliente.
 * @example formatCategoryLabel("pollo-brasa") → "Pollo a la brasa"
 * @example formatCategoryLabel("polleria")    → "Pollería"
 * @example formatCategoryLabel("mi-rubro-xyz")→ "Mi rubro xyz"
 */
export function formatCategoryLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  const slug = raw.trim();
  if (!slug) return "";
  const key = slug.toLowerCase().replace(/[_\s]+/g, "-");
  const known = KNOWN_LABELS[key] ?? KNOWN_LABELS[key.replace(/-/g, "_")];
  if (known) return known;

  // Fallback: guiones/underscores → espacios; sentence-case (solo la 1ª
  // palabra en mayúscula, resto en minúscula) — coincide con el estilo de las
  // etiquetas curadas ("Frutas y verduras", "Pollo a la brasa"). Preserva
  // palabras con mayúscula interna (iPhone, USB…).
  const words = slug.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().split(" ");
  return words
    .map((word, i) => {
      if (/[A-ZÁÉÍÓÚÑ]/.test(word.slice(1))) return word;
      const lower = word.toLowerCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}
