/**
 * lives.mock.ts — Mock data para Buleje en Vivo (transmisiones live-commerce).
 *
 * Mientras no tengamos backend real, estos mocks cubren:
 *   - Lives en vivo "ahora" (status: "live")
 *   - Próximas transmisiones programadas (status: "upcoming")
 *   - Grabaciones pasadas (status: "past")
 *
 * Una vez haya DB, reemplazar con query `lib/db/lives.db.ts` siguiendo
 * la regla del tenantId 1er param.
 */

export type LiveStatus = "live" | "upcoming" | "past";

export interface LiveFeaturedProduct {
  id: string;
  productId: number;
  storeProductId: string;
  name: string;
  price: number;
  image: string;
  unit: string | null;
  storeId: string;
  storeSlug: string;
  storeName: string;
  /** Highlight destacado dentro del stream ("lo de ahora") */
  highlighted?: boolean;
}

export interface LiveChatMessage {
  id: string;
  user: string;
  text: string;
  /** ms relative to stream start (para orden estable) */
  t: number;
  /** "host" | "viewer" — estiliza distinto en el panel */
  role: "host" | "viewer";
}

export interface LiveSession {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: LiveStatus;
  /** Categoría principal (chips del hub) */
  category: string;
  /** Nombre de la tienda que transmite */
  storeName: string;
  storeSlug: string;
  /** Thumbnail para cards + poster del player */
  thumbnail: string;
  /** ISO date: cuando empieza (upcoming) o empezó (live/past) */
  startsAt: string;
  /** Duración en minutos, solo past */
  durationMin?: number;
  /** Viewers actuales (live) o totales (past) */
  viewers: number;
  /** Productos destacados en la transmisión */
  products: LiveFeaturedProduct[];
  /** Mensajes de chat (live = recientes, past = highlights) */
  chat: LiveChatMessage[];
}

// ── Fechas relativas (estables a lo largo de la sesión) ─────────────────────
// No llamamos Date.now() en la carga del módulo para evitar drift entre
// renders del servidor y cliente; se computa lazy vía getters cuando hace falta.

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function minutesAgo(mins: number): string {
  return new Date(Date.now() - mins * 60 * 1000).toISOString();
}

// ── Catalog ─────────────────────────────────────────────────────────────────

export const LIVES_MOCK: LiveSession[] = [
  {
    id: "live-001",
    slug: "paiche-doncella-fresco",
    title: "Paiche y doncella recién llegados del puerto",
    description:
      "Acabamos de recibir la pesca de la madrugada. Paiche fresco, doncella entera y filetes. El señor Mauro te enseña cómo escoger el mejor pescado.",
    status: "live",
    category: "Pescados frescos",
    storeName: "Buleje",
    storeSlug: "bodega-san-martin",
    thumbnail:
      "https://images.unsplash.com/photo-1535591273668-578e31182c4f?w=800&q=80&auto=format&fit=crop",
    startsAt: minutesAgo(12),
    viewers: 142,
    products: [
      {
        id: "lp-001",
        productId: 1001,
        storeProductId: "sp-1001",
        name: "Paiche entero fresco",
        price: 45.0,
        image:
          "https://images.unsplash.com/photo-1535591273668-578e31182c4f?w=400&q=80&auto=format&fit=crop",
        unit: "kg",
        storeId: "store-001",
        storeSlug: "bodega-san-martin",
        storeName: "Buleje",
        highlighted: true,
      },
      {
        id: "lp-002",
        productId: 1002,
        storeProductId: "sp-1002",
        name: "Filete de doncella",
        price: 38.0,
        image:
          "https://images.unsplash.com/photo-1611171711791-b34b41b1a2c0?w=400&q=80&auto=format&fit=crop",
        unit: "kg",
        storeId: "store-001",
        storeSlug: "bodega-san-martin",
        storeName: "Buleje",
      },
      {
        id: "lp-003",
        productId: 1003,
        storeProductId: "sp-1003",
        name: "Limón para ceviche",
        price: 6.5,
        image:
          "https://images.unsplash.com/photo-1587486913049-53fc88980cfc?w=400&q=80&auto=format&fit=crop",
        unit: "kg",
        storeId: "store-001",
        storeSlug: "bodega-san-martin",
        storeName: "Buleje",
      },
    ],
    chat: [
      { id: "m-1", user: "Carla P.", text: "Hola Mauro, ¿a cuánto el paiche entero?", t: 60_000, role: "viewer" },
      { id: "m-2", user: "Mauro (host)", text: "Hola Carla, a S/ 45 el kilo. Entero o porción.", t: 75_000, role: "host" },
      { id: "m-3", user: "José R.", text: "Apartame 2 kilos porfa", t: 120_000, role: "viewer" },
      { id: "m-4", user: "Rosa M.", text: "¿Hay doncella para ceviche?", t: 180_000, role: "viewer" },
      { id: "m-5", user: "Mauro (host)", text: "Sí Rosa, filete fresco. Ideal para ceviche.", t: 210_000, role: "host" },
      { id: "m-6", user: "Luis A.", text: "¿Llega a Yarinacocha el delivery?", t: 260_000, role: "viewer" },
      { id: "m-7", user: "Ana T.", text: "Miren qué fresco se ve", t: 320_000, role: "viewer" },
    ],
  },
  {
    id: "live-002",
    slug: "ofertas-abarrotes-semana",
    title: "Ofertas de la semana — abarrotes al 20% off",
    description:
      "Bodega Rosita te trae arroz, azúcar, aceite y fideos con descuento directo del mayorista. Solo por esta transmisión.",
    status: "upcoming",
    category: "Abarrotes ofertas",
    storeName: "Bodega Rosita",
    storeSlug: "bodega-rosita",
    thumbnail:
      "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&q=80&auto=format&fit=crop",
    startsAt: hoursFromNow(2),
    viewers: 0,
    products: [],
    chat: [],
  },
  {
    id: "live-003",
    slug: "frutas-de-temporada-mango",
    title: "Frutas de temporada — mango, plátano y piña",
    description:
      "Don José trae frutas de los valles cercanos. Aprende qué fruta conviene comprar esta semana.",
    status: "upcoming",
    category: "Frutas de temporada",
    storeName: "Bodega El Trébol",
    storeSlug: "bodega-el-trebol",
    thumbnail:
      "https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=800&q=80&auto=format&fit=crop",
    startsAt: hoursFromNow(5),
    viewers: 0,
    products: [],
    chat: [],
  },
  {
    id: "live-004",
    slug: "carnes-parrilla-fin-de-semana",
    title: "Carnes de parrilla — cortes para el fin de semana",
    description:
      "Costillas, bistec, cecina regional. Todo recién cortado frente a cámara para que veas la calidad.",
    status: "upcoming",
    category: "Carnes",
    storeName: "Buleje",
    storeSlug: "bodega-san-martin",
    thumbnail:
      "https://images.unsplash.com/photo-1588347818121-1ff6bd5c88eb?w=800&q=80&auto=format&fit=crop",
    startsAt: hoursFromNow(26),
    viewers: 0,
    products: [],
    chat: [],
  },
  {
    id: "live-005",
    slug: "ofertas-navidad-panetones",
    title: "Ofertas de Navidad — panetones y combos",
    description: "Grabación de la transmisión navideña. Combos de panetón + chocolate caliente.",
    status: "past",
    category: "Abarrotes ofertas",
    storeName: "Bodega Rosita",
    storeSlug: "bodega-rosita",
    thumbnail:
      "https://images.unsplash.com/photo-1608198093002-ad4e005484ec?w=800&q=80&auto=format&fit=crop",
    startsAt: daysAgo(21),
    durationMin: 38,
    viewers: 1240,
    products: [],
    chat: [],
  },
  {
    id: "live-006",
    slug: "abarrotes-al-30",
    title: "Abarrotes al 30% — fin de mes",
    description: "Ofertas de último día del mes. Arroz, azúcar, aceite, fideos y leche en descuento.",
    status: "past",
    category: "Abarrotes ofertas",
    storeName: "Bodega El Trébol",
    storeSlug: "bodega-el-trebol",
    thumbnail:
      "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800&q=80&auto=format&fit=crop",
    startsAt: daysAgo(14),
    durationMin: 52,
    viewers: 2105,
    products: [],
    chat: [],
  },
  {
    id: "live-007",
    slug: "frutas-temporada-pasada",
    title: "Frutas de temporada — cosecha de marzo",
    description: "Grabación clásica. Mango, piña y plátano de chacra.",
    status: "past",
    category: "Frutas de temporada",
    storeName: "Buleje",
    storeSlug: "bodega-san-martin",
    thumbnail:
      "https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=800&q=80&auto=format&fit=crop",
    startsAt: daysAgo(9),
    durationMin: 24,
    viewers: 890,
    products: [],
    chat: [],
  },
  {
    id: "live-008",
    slug: "pescados-frescos-lunes",
    title: "Pescados frescos — lunes de llegada del puerto",
    description: "Paiche, doncella, boquichico. Selección del lunes.",
    status: "past",
    category: "Pescados frescos",
    storeName: "Buleje",
    storeSlug: "bodega-san-martin",
    thumbnail:
      "https://images.unsplash.com/photo-1526470498-9ae73c665de8?w=800&q=80&auto=format&fit=crop",
    startsAt: daysAgo(5),
    durationMin: 31,
    viewers: 1450,
    products: [],
    chat: [],
  },
];

// ── Selectors ──────────────────────────────────────────────────────────────

export function getLiveNow(): LiveSession | null {
  return LIVES_MOCK.find((l) => l.status === "live") ?? null;
}

export function getUpcomingLives(): LiveSession[] {
  return LIVES_MOCK.filter((l) => l.status === "upcoming").sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
}

export function getPastLives(): LiveSession[] {
  return LIVES_MOCK.filter((l) => l.status === "past").sort(
    (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
  );
}

export function getLiveById(id: string): LiveSession | null {
  return LIVES_MOCK.find((l) => l.id === id || l.slug === id) ?? null;
}

export function getLiveCategories(): string[] {
  const set = new Set<string>();
  for (const l of LIVES_MOCK) set.add(l.category);
  return Array.from(set);
}
