/**
 * mock-store-reviews.ts
 *
 * Datos de reseñas ficticios para la Store Detail Page.
 * No hay tabla de StoreReview en Prisma todavía — se reemplaza cuando se
 * agregue. Los datos son representativos de clientes reales de Pucallpa.
 */

export interface MockStoreReview {
  id: string;
  authorName: string;
  authorInitials: string;
  rating: number; // 1–5
  title: string;
  body: string;
  date: string; // ISO
  verified: boolean;
  helpfulCount: number;
}

export interface MockStoreRatingSummary {
  average: number;
  total: number;
  breakdown: { stars: number; count: number; percentage: number }[];
}

export const MOCK_STORE_REVIEWS: MockStoreReview[] = [
  {
    id: "sr1",
    authorName: "Carmen L.",
    authorInitials: "CL",
    rating: 5,
    title: "La mejor bodega del barrio",
    body: "Siempre encuentro todo lo que necesito y el delivery llega rapidísimo. El dueño es muy atento y los precios son justos.",
    date: "2026-04-12T10:00:00Z",
    verified: true,
    helpfulCount: 8,
  },
  {
    id: "sr2",
    authorName: "Miguel T.",
    authorInitials: "MT",
    rating: 5,
    title: "Excelente servicio, muy confiable",
    body: "Llevo 3 meses comprando aquí. El pedido siempre llega bien empacado y en el tiempo prometido. Recomendado al 100%.",
    date: "2026-04-08T15:30:00Z",
    verified: true,
    helpfulCount: 5,
  },
  {
    id: "sr3",
    authorName: "Rosa H.",
    authorInitials: "RH",
    rating: 4,
    title: "Muy buenos productos frescos",
    body: "Los productos frescos son muy buenos. A veces se demoran un poco más de lo indicado, pero siempre avisan por WhatsApp. Buena atención.",
    date: "2026-04-05T09:15:00Z",
    verified: false,
    helpfulCount: 3,
  },
  {
    id: "sr4",
    authorName: "Jorge P.",
    authorInitials: "JP",
    rating: 5,
    title: "Pago con Yape sin problemas",
    body: "Muy fácil pagar con Yape. Me mandaron el comprobante inmediatamente. Nunca tuve un problema con un pedido.",
    date: "2026-03-28T11:00:00Z",
    verified: true,
    helpfulCount: 12,
  },
  {
    id: "sr5",
    authorName: "Lucía M.",
    authorInitials: "LM",
    rating: 4,
    title: "Buena selección de abarrotes",
    body: "Tienen casi todo lo que uno necesita. Me gustaría que agreguen más variedad de lácteos. Por lo demás, excelente.",
    date: "2026-03-20T14:00:00Z",
    verified: true,
    helpfulCount: 2,
  },
];

export const MOCK_STORE_RATING_SUMMARY: MockStoreRatingSummary = {
  average: 4.8,
  total: 124,
  breakdown: [
    { stars: 5, count: 98, percentage: 79 },
    { stars: 4, count: 18, percentage: 15 },
    { stars: 3, count: 5, percentage: 4 },
    { stars: 2, count: 2, percentage: 1 },
    { stars: 1, count: 1, percentage: 1 },
  ],
};
