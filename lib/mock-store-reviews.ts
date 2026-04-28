/**
 * mock-store-reviews.ts — Tipos compartidos para reseñas de tienda.
 *
 * Histórico: este archivo contenía datos mock que se renderizaban en
 * /marketplace/[slug]. 2026-04-28 se reemplazó por la tabla `Review`
 * leída desde `lib/db/store-reviews.db.ts`. Mantenemos los tipos
 * `MockStoreReview` y `MockStoreRatingSummary` por compatibilidad con
 * los componentes que los importan — los nombres conservan el prefijo
 * "Mock" sólo por historia, ahora representan reseñas reales.
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
  breakdown: Array<{ stars: number; count: number; percentage: number }>;
}
