/**
 * Mock realista de reviews de productos — comunidad Pucallpa.
 *
 * NOTA: este archivo es puro data. Las DB classes reales
 * (`lib/db/product-reviews.db.ts`) se caen a este mock cuando no hay
 * datos reales en la DB todavía. Cuando migremos a seed real, estos
 * registros se pueden pasar directo a `prisma/seed.ts`.
 */

export type MockReview = {
  id: string;
  productId: number;
  userId: string;
  userName: string;
  userAvatar?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title: string;
  body: string;
  photos: string[];
  verifiedPurchase: boolean;
  helpfulCount: number;
  createdAt: string; // ISO
};

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

// Reviews genéricas reutilizables por producto — se asignan por productId al vuelo
export const MOCK_REVIEWS_LIBRARY: Omit<MockReview, "productId">[] = [
  {
    id: "rv_001",
    userId: "u_maria_elena",
    userName: "María Elena V.",
    rating: 5,
    title: "Llegó fresquito y rapidito",
    body: "La señora Elena atiende bien. Pedí por la tarde y para la cena ya estaba en la casa. El producto está tal como sale en la foto, nada de sorpresas feas. Lo recomiendo a las vecinas de Yarinacocha.",
    photos: [],
    verifiedPurchase: true,
    helpfulCount: 14,
    createdAt: iso(3),
  },
  {
    id: "rv_002",
    userId: "u_juan_carlos",
    userName: "Juan Carlos R.",
    rating: 4,
    title: "Buen precio para la zona",
    body: "Comparé con la bodega de la esquina y acá sale más conveniente. El único pero es que el empaque vino medio aplastado pero el contenido está bien. Volvería a comprar.",
    photos: [],
    verifiedPurchase: true,
    helpfulCount: 8,
    createdAt: iso(7),
  },
  {
    id: "rv_003",
    userId: "u_rosa_m",
    userName: "Rosa M.",
    rating: 5,
    title: "Calidad de bodega de toda la vida",
    body: "Mi mamá siempre compraba acá cuando yo era chibola. Ahora que pido por delivery siento el mismo cuidado. Gracias por mantener la tradición en Pucallpa.",
    photos: [],
    verifiedPurchase: true,
    helpfulCount: 22,
    createdAt: iso(12),
  },
  {
    id: "rv_004",
    userId: "u_luis_p",
    userName: "Luis P.",
    rating: 3,
    title: "Producto bien, delivery justo a tiempo",
    body: "Todo cumple lo que promete, nada del otro mundo pero tampoco falla. El repartidor llamó antes de llegar, eso me gustó. Tres estrellas por el precio que subió un poquito respecto al mes pasado.",
    photos: [],
    verifiedPurchase: false,
    helpfulCount: 3,
    createdAt: iso(18),
  },
  {
    id: "rv_005",
    userId: "u_carmen_s",
    userName: "Carmen S.",
    rating: 5,
    title: "La paiche llegó fresquita",
    body: "Pensé que pidiendo por celular iba a llegar medio blandita, pero no, estaba fresquita como en el mercado de Belén. Mi marido quedó contento con el almuerzo del domingo.",
    photos: [],
    verifiedPurchase: true,
    helpfulCount: 31,
    createdAt: iso(22),
  },
  {
    id: "rv_006",
    userId: "u_alberto_g",
    userName: "Alberto G.",
    rating: 4,
    title: "Rinde para toda la semana",
    body: "Compré dos kilos y me duró para varios almuerzos. La calidad está dentro de lo esperado para el precio. Recomiendo pedir con anticipación porque a veces se acaba rápido.",
    photos: [],
    verifiedPurchase: true,
    helpfulCount: 11,
    createdAt: iso(30),
  },
  {
    id: "rv_007",
    userId: "u_patricia_v",
    userName: "Patricia V.",
    rating: 5,
    title: "La dueña siempre atenta",
    body: "Le escribí por el chat preguntando si el producto servía para diabéticos y me respondió en minutos. Se nota que la señora conoce lo que vende. Eso da confianza.",
    photos: [],
    verifiedPurchase: true,
    helpfulCount: 18,
    createdAt: iso(45),
  },
  {
    id: "rv_008",
    userId: "u_hector_m",
    userName: "Héctor M.",
    rating: 2,
    title: "Llegó bien pero la porción un poco menor",
    body: "No me quejo del producto pero sí de la cantidad: pensé que el kilo iba a ser más generoso. Quizás es mi percepción. El resto todo OK, delivery puntual.",
    photos: [],
    verifiedPurchase: true,
    helpfulCount: 4,
    createdAt: iso(60),
  },
  {
    id: "rv_009",
    userId: "u_veronica_a",
    userName: "Verónica A.",
    rating: 5,
    title: "Mejor que ir al mercado central",
    body: "Con el embarazo ya no puedo ir al mercado central. Esta bodega me salva: pido en la mañana y para el almuerzo ya está en la puerta. Ahorro tiempo y me llega todo bien envuelto.",
    photos: [],
    verifiedPurchase: true,
    helpfulCount: 27,
    createdAt: iso(75),
  },
  {
    id: "rv_010",
    userId: "u_daniel_t",
    userName: "Daniel T.",
    rating: 4,
    title: "Cumple lo que promete",
    body: "Es mi tercera compra y siempre me ha tocado buena calidad. Una vez vino raspado el empaque pero me cambiaron el producto sin problema. Atención de primera.",
    photos: [],
    verifiedPurchase: true,
    helpfulCount: 9,
    createdAt: iso(90),
  },
  {
    id: "rv_011",
    userId: "u_miriam_o",
    userName: "Miriam O.",
    rating: 5,
    title: "Sabroso y rinde bastante",
    body: "Lo usé para la pachamanca del cumpleaños de mi hija. Todos los invitados preguntaron de dónde lo había comprado. Se acabó en un dos por tres. Pediré nuevamente.",
    photos: [],
    verifiedPurchase: true,
    helpfulCount: 16,
    createdAt: iso(110),
  },
  {
    id: "rv_012",
    userId: "u_ronald_j",
    userName: "Ronald J.",
    rating: 3,
    title: "Está bien por el precio",
    body: "Para el precio que cobran está correcto. No esperen calidad gourmet pero cumple. Bueno para la semana de mercado.",
    photos: [],
    verifiedPurchase: false,
    helpfulCount: 2,
    createdAt: iso(130),
  },
];

/**
 * Genera reviews para un producto. Determinístico por productId
 * (el mismo producto siempre devuelve los mismos reviews) para evitar
 * mismatch entre SSR y client.
 */
export function getMockReviewsForProduct(productId: number): MockReview[] {
  // Hash simple para seleccionar subset y rotar
  const seed = ((productId * 2654435761) >>> 0) % MOCK_REVIEWS_LIBRARY.length;
  const count = 3 + (productId % 6); // 3–8 reviews por producto
  const out: MockReview[] = [];
  for (let i = 0; i < count; i++) {
    const idx = (seed + i) % MOCK_REVIEWS_LIBRARY.length;
    const base = MOCK_REVIEWS_LIBRARY[idx];
    out.push({ ...base, id: `${base.id}_p${productId}`, productId });
  }
  return out;
}

/** Computa la distribución de estrellas para un set de reviews */
export function getReviewBreakdown(reviews: MockReview[]) {
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const r of reviews) {
    dist[r.rating]++;
    sum += r.rating;
  }
  const count = reviews.length;
  const average = count > 0 ? sum / count : 0;
  return { count, average, distribution: dist };
}
