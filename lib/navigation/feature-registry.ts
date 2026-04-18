/**
 * Feature Registry (ENRICH-1)
 *
 * Registry central de features "descubribles" de Buleje. Cada feature tiene
 * un icon (nombre de lucide re-exportado por @buleje/design-system/icons),
 * copy corto, href y una categoria que se usa para matching de
 * "related features" entre páginas.
 *
 * Uso:
 *   import { FEATURES, relatedFor } from "@/lib/navigation/feature-registry";
 *   const related = relatedFor("gift-cards", 3);
 *   // → [socio-buleje, cupones, bodega-al-mes]
 *
 * Extender: agregá una key nueva al map `FEATURES`. Mantené `category` y
 * `priority` para que el matching siga siendo determinístico.
 */

export type FeatureCategory =
  | "membership"
  | "regalo"
  | "descubrimiento"
  | "ahorro"
  | "inspiracion"
  | "seller"
  | "soporte";

export type FeatureCard = {
  /** Unique slug — usado como prop id. */
  id: string;
  /** Lucide icon name. Debe existir en @buleje/design-system/icons. */
  icon: string;
  /** Título corto (≤ 28 char). */
  title: string;
  /** Descripción de 1 línea (≤ 90 char). */
  description: string;
  /** Ruta interna, sin dominio. */
  href: string;
  /** CTA textual para el link/botón (≤ 18 char). */
  cta: string;
  /** Categoría para el matcher. */
  category: FeatureCategory;
  /** Prioridad: menor = más relevante al topear. */
  priority?: number;
};

export const FEATURES = {
  "gift-cards": {
    id: "gift-cards",
    icon: "Gift",
    title: "Gift Cards Buleje",
    description:
      "Tarjetas de regalo desde S/ 20. Sin vencimiento, llegan por WhatsApp.",
    href: "/marketplace/gift-cards",
    cta: "Explorar",
    category: "regalo",
    priority: 1,
  },
  "socio-buleje": {
    id: "socio-buleje",
    icon: "HeartHandshake",
    title: "Socio Buleje",
    description:
      "Delivery gratis ilimitado, 5% cashback y precios exclusivos cada mes.",
    href: "/socio-buleje",
    cta: "Hacete socio",
    category: "membership",
    priority: 1,
  },
  "bodega-al-mes": {
    id: "bodega-al-mes",
    icon: "Package",
    title: "Bodega al Mes",
    description:
      "Suscripción recurrente con 5% off. Pausá o cancelá cuando quieras.",
    href: "/cuenta/suscripciones",
    cta: "Ver planes",
    category: "ahorro",
    priority: 2,
  },
  "en-vivo": {
    id: "en-vivo",
    icon: "Flashlight",
    title: "Buleje en Vivo",
    description:
      "Transmisiones desde las bodegas de Pucallpa. Comprá sin salir del stream.",
    href: "/marketplace/en-vivo",
    cta: "Mirar ahora",
    category: "descubrimiento",
    priority: 1,
  },
  "asistente": {
    id: "asistente",
    icon: "Sparkles",
    title: "Asistente IA",
    description:
      "Preguntale al bot sobre frescura, descuentos y usos de cada producto.",
    href: "/asistente",
    cta: "Probar",
    category: "descubrimiento",
    priority: 2,
  },
  "comparar": {
    id: "comparar",
    icon: "GitCompareArrows",
    title: "Comparar productos",
    description:
      "Hasta 4 productos lado a lado: precio, stock, marca y tienda.",
    href: "/marketplace/comparar",
    cta: "Comparar",
    category: "descubrimiento",
    priority: 3,
  },
  "vender": {
    id: "vender",
    icon: "Store",
    title: "Vendé en Buleje",
    description:
      "Sumá tu bodega al marketplace. Gratis el primer mes, pagos con Yape.",
    href: "/vender",
    cta: "Abrir tienda",
    category: "seller",
    priority: 1,
  },
  "ofertas": {
    id: "ofertas",
    icon: "BadgePercent",
    title: "Ofertas flash",
    description:
      "Descuentos reales por tiempo limitado en abarrotes, frescos y bebidas.",
    href: "/marketplace/ofertas",
    cta: "Ver ofertas",
    category: "ahorro",
    priority: 1,
  },
  "cupones": {
    id: "cupones",
    icon: "Ticket",
    title: "Mis cupones",
    description:
      "Códigos canjeables en checkout: % de descuento, envío gratis, S/ off.",
    href: "/cuenta/cupones",
    cta: "Ver cupones",
    category: "ahorro",
    priority: 3,
  },
  "recetas": {
    id: "recetas",
    icon: "ChefHat",
    title: "Recetas",
    description:
      "Cocina pucallpina paso a paso. Ingredientes al carrito en 1 click.",
    href: "/recetas",
    cta: "Explorar recetas",
    category: "inspiracion",
    priority: 1,
  },
  "seguimiento": {
    id: "seguimiento",
    icon: "Truck",
    title: "Seguimiento en vivo",
    description:
      "Seguí cada pedido en el mapa y recibí notificaciones en WhatsApp.",
    href: "/tracking",
    cta: "Rastrear",
    category: "soporte",
    priority: 2,
  },
  "ayuda": {
    id: "ayuda",
    icon: "HelpCircle",
    title: "Centro de ayuda",
    description:
      "FAQs y atención por WhatsApp. Respuesta en minutos, no horas.",
    href: "/ayuda",
    cta: "Obtener ayuda",
    category: "soporte",
    priority: 3,
  },
} satisfies Record<string, FeatureCard>;

export type FeatureId = keyof typeof FEATURES;

/**
 * Devuelve N features relacionadas a la feature actual.
 *
 * Regla de matching:
 *   1. Excluye la feature actual.
 *   2. Primero, features con el MISMO category (ordenadas por priority asc).
 *   3. Luego, features con categorías cercanas (tabla MIX).
 *   4. Por último, cualquiera restante (por priority global).
 *
 * Si la feature actual no existe en el registry, devuelve las top N por
 * priority global.
 */
const CATEGORY_MIX: Record<FeatureCategory, FeatureCategory[]> = {
  membership: ["ahorro", "regalo", "descubrimiento"],
  regalo: ["ahorro", "membership", "inspiracion"],
  descubrimiento: ["ahorro", "membership", "inspiracion"],
  ahorro: ["membership", "regalo", "descubrimiento"],
  inspiracion: ["descubrimiento", "ahorro", "regalo"],
  seller: ["descubrimiento", "membership", "soporte"],
  soporte: ["descubrimiento", "ahorro", "membership"],
};

export function relatedFor(
  currentFeature: FeatureId | string,
  count: number = 3,
): FeatureCard[] {
  const current = (FEATURES as Record<string, FeatureCard>)[currentFeature];
  const all = Object.values(FEATURES) as FeatureCard[];

  const remaining = all.filter((f) => f.id !== currentFeature);

  if (!current) {
    return [...remaining]
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
      .slice(0, count);
  }

  const sameCategory = remaining
    .filter((f) => f.category === current.category)
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

  const mix = CATEGORY_MIX[current.category] ?? [];
  const nearCategories = mix.flatMap((cat) =>
    remaining
      .filter((f) => f.category === cat)
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)),
  );

  const rest = remaining
    .filter(
      (f) => f.category !== current.category && !mix.includes(f.category),
    )
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

  const ordered: FeatureCard[] = [];
  const seen = new Set<string>();

  for (const f of [...sameCategory, ...nearCategories, ...rest]) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    ordered.push(f);
    if (ordered.length >= count) break;
  }

  return ordered;
}

/**
 * Devuelve un array de features específicas por IDs. Útil cuando el consumidor
 * sabe exactamente qué mostrar.
 */
export function featuresByIds(ids: readonly string[]): FeatureCard[] {
  return ids
    .map((id) => (FEATURES as Record<string, FeatureCard>)[id])
    .filter((f): f is FeatureCard => Boolean(f));
}
