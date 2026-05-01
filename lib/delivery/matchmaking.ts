/**
 * lib/delivery/matchmaking.ts
 *
 * Algoritmo de matching geográfico para asignar pedidos a motorizados
 * estilo Rappi/Uber Eats. Sin dependencias externas, sin DB inside —
 * recibe partners + order coords y devuelve ranking ordenado.
 *
 * Score = 60% distancia + 20% rating + 20% acceptance rate
 *   - distancia más baja → mejor score
 *   - rating 5 / acceptance 1.0 → mejor score
 *
 * Filtros pre-score:
 *   - isOnline=true
 *   - lastPingAt < 5min (heartbeat fresco)
 *   - currentOrderId=null (no atendiendo otro pedido)
 *   - distance <= maxRadiusKm
 */

export interface PartnerCandidate {
  id: string;
  name: string;
  phone: string;
  lat: number | null;
  lng: number | null;
  isOnline: boolean;
  lastPingAt: Date | null;
  currentOrderId: string | null;
  rating: number;
  acceptanceRate: number;
  maxRadiusKm: number;
  fee: number;
  vehicleType: string;
}

export interface RankedPartner extends PartnerCandidate {
  distanceKm: number;
  score: number;
}

/**
 * Distancia haversine en km entre dos coordenadas (lat/lng en grados).
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // radio de la Tierra en km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Score normalizado (0..1, menor = mejor). Permite ordenar ascending.
 *
 * - distance term: distancia / maxRadiusKm (saturado en 1)
 * - rating term: (5 - rating) / 5 (rating 5 = 0; rating 0 = 1)
 * - acceptance term: 1 - acceptanceRate (1.0 = 0; 0.0 = 1)
 */
export function scorePartner(p: RankedPartner): number {
  const distanceTerm = Math.min(p.distanceKm / Math.max(p.maxRadiusKm, 0.1), 1);
  const ratingTerm = (5 - Math.min(Math.max(p.rating, 0), 5)) / 5;
  const acceptanceTerm = 1 - Math.min(Math.max(p.acceptanceRate, 0), 1);
  return 0.6 * distanceTerm + 0.2 * ratingTerm + 0.2 * acceptanceTerm;
}

export interface FindNearestOpts {
  limit?: number;
  /** Margin en km para extender el maxRadiusKm. Default 0. */
  radiusBufferKm?: number;
  /** Tiempo máximo desde lastPingAt en segundos. Default 300 (5min). */
  pingMaxAgeSec?: number;
  /** Excluir partners ya invitados a este order (anti-loop). */
  excludePartnerIds?: string[];
  /** Reloj inyectable para tests. Default Date.now(). */
  now?: number;
}

/**
 * Filtra y rankea partners para un pedido. Devuelve top-N ordenados por score.
 */
export function findNearestPartners(
  orderLat: number,
  orderLng: number,
  candidates: PartnerCandidate[],
  opts: FindNearestOpts = {},
): RankedPartner[] {
  const limit = opts.limit ?? 5;
  const buffer = opts.radiusBufferKm ?? 0;
  const pingMaxAgeMs = (opts.pingMaxAgeSec ?? 300) * 1000;
  const now = opts.now ?? Date.now();
  const excludeSet = new Set(opts.excludePartnerIds ?? []);

  const ranked: RankedPartner[] = [];

  for (const p of candidates) {
    if (excludeSet.has(p.id)) continue;
    if (!p.isOnline) continue;
    if (p.currentOrderId) continue;
    if (p.lat == null || p.lng == null) continue;
    if (!p.lastPingAt) continue;
    if (now - p.lastPingAt.getTime() > pingMaxAgeMs) continue;

    const distanceKm = haversineKm(orderLat, orderLng, p.lat, p.lng);
    if (distanceKm > p.maxRadiusKm + buffer) continue;

    const candidate: RankedPartner = {
      ...p,
      distanceKm,
      score: 0, // placeholder, se setea abajo
    };
    candidate.score = scorePartner(candidate);
    ranked.push(candidate);
  }

  ranked.sort((a, b) => a.score - b.score);
  return ranked.slice(0, limit);
}

/**
 * Calcula el fee dinámico para una oferta basado en distancia y zona.
 * Default: S/ 5 base + S/ 1.5/km. Configurable via tenant settings.
 */
export function computeOfferFee(
  distanceKm: number,
  baseFee = 5,
  perKmFee = 1.5,
): number {
  return Math.round((baseFee + distanceKm * perKmFee) * 100) / 100;
}
