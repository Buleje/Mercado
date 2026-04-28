/**
 * store-tagline.ts — Genera taglines/descriptions ÚNICAS por bodega
 * cuando la propia descripción está vacía. Determinístico (basado en
 * slug) para que la misma bodega siempre vea la misma frase, y único
 * dentro del catálogo para no repetir.
 *
 * No reemplaza `store.description` cuando viene del DB — solo se usa
 * como fallback. Si una bodega quiere personalizar su mensaje, lo
 * hace desde su panel admin.
 */

const TAGLINES_BY_CATEGORY: Record<string, string[]> = {
  bodega: [
    "Tu bodega de confianza, a la vuelta de la esquina.",
    "El básico que nunca te falta, ahora con delivery.",
    "Frescura, abarrotes y atención de barrio en una sola app.",
    "Lo que necesitás de la bodega de siempre, sin salir de casa.",
    "Tu vecino bodeguero, ahora también online.",
    "Pedís, pagás con Yape y recibís en minutos. Como siempre, pero más fácil.",
  ],
  minimarket: [
    "Variedad de minimarket, comodidad de delivery.",
    "Más pasillos, mejores precios, todo a domicilio.",
    "El minimarket del barrio que se subió a la app.",
  ],
  polleria: [
    "Pollo crocante, recién hecho — a la mesa en 25 minutos.",
    "Ese pollito de viernes, ahora también de lunes.",
    "Brasa real, papas crujientes, ensalada fresca.",
  ],
  restaurante: [
    "El sabor de siempre, ahora a un toque de tu celular.",
    "Cocina hecha al momento, lista cuando llegás.",
    "Menú casero del día, recién preparado por nosotros.",
  ],
  panaderia: [
    "Pan tibio, pasteles del día, café cargado.",
    "Recién horneado, todavía caliente cuando lo recibís.",
    "Tu panadería de cada mañana, sin colas.",
  ],
  farmacia: [
    "Medicamentos, primeros auxilios, lo que necesitás cuando lo necesitás.",
    "Tu botica de barrio con delivery rápido y reserva online.",
  ],
  ropa: [
    "Estilo de barrio, precios sin marketing.",
    "Lo último en moda local, ahora a un click.",
  ],
  heladeria: [
    "Helados artesanales, esa cremita que solo nosotros tenemos.",
    "Refrescá tu día con sabores recién hechos.",
  ],
};

const GENERIC_FALLBACKS: string[] = [
  "Cerca tuyo, listo cuando lo necesitás.",
  "Atención personal, precios honestos, delivery rápido.",
  "Lo que pides, como lo pides — sin complicaciones.",
  "Tu compra del barrio, ahora también desde el celular.",
  "Productos de calidad, atendido con cariño.",
];

function hashSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Devuelve la descripción a mostrar para una bodega.
 *  - Si `existing` no está vacía, se respeta tal cual (el dueño la escribió).
 *  - Si está vacía, genera una tagline determinística basada en (slug, category).
 */
export function getStoreTagline(opts: {
  slug: string;
  name: string;
  category: string | null | undefined;
  existing: string | null | undefined;
}): string {
  const { slug, name, category, existing } = opts;
  const trimmed = (existing ?? "").trim();
  if (trimmed.length > 0) return trimmed;

  const cat = (category ?? "").toLowerCase().trim();
  const pool = TAGLINES_BY_CATEGORY[cat] ?? GENERIC_FALLBACKS;
  const idx = hashSlug(slug) % pool.length;
  const tagline = pool[idx]!;
  // Nombre opcional al frente para reforzar identidad: "Mi Pollo · ese pollito…"
  return `${name} · ${tagline}`;
}
