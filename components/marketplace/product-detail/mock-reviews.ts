/**
 * Mock reviews para ProductDetailPage.
 * No hay schema de reviews en Prisma todavía — datos ficticios representativos
 * de Pucallpa. Se reemplazan con datos reales cuando se agregue la tabla.
 */

export interface MockReview {
  id: string;
  authorName: string;
  authorInitials: string;
  rating: number; // 1-5
  title: string;
  body: string;
  date: string; // ISO string
  verified: boolean;
}

export const MOCK_REVIEWS: MockReview[] = [
  {
    id: "r1",
    authorName: "Carmen L.",
    authorInitials: "CL",
    rating: 5,
    title: "Muy fresco y a buen precio",
    body: "Llegó en perfectas condiciones, bien empacado. La calidad es excelente, se nota que es producto fresco. Lo pediré de nuevo sin duda.",
    date: "2026-04-10T10:00:00Z",
    verified: true,
  },
  {
    id: "r2",
    authorName: "Miguel T.",
    authorInitials: "MT",
    rating: 4,
    title: "Buena calidad, entrega rápida",
    body: "El producto llegó en 20 minutos. La única observación es que el empaque podría mejorar un poco, pero el producto en sí estaba perfecto.",
    date: "2026-04-08T15:30:00Z",
    verified: true,
  },
  {
    id: "r3",
    authorName: "Rosa H.",
    authorInitials: "RH",
    rating: 5,
    title: "Recomendado 100%",
    body: "Siempre compro en esta bodega. Los productos son de buena calidad y el dueño es muy amable. Entrega puntual y sin cobros extra.",
    date: "2026-04-05T09:15:00Z",
    verified: false,
  },
];

export const MOCK_RATING_SUMMARY = {
  average: 4.7,
  total: 24,
  breakdown: [
    { stars: 5, count: 17, percentage: 70 },
    { stars: 4, count: 5, percentage: 21 },
    { stars: 3, count: 1, percentage: 4 },
    { stars: 2, count: 1, percentage: 4 },
    { stars: 1, count: 0, percentage: 0 },
  ],
};
