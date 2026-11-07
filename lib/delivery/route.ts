/**
 * Motor de ruta para el delivery — single source de "ruta + ETA" que consumen
 * tanto la app del repartidor (DeliveryMap) como el seguimiento del cliente
 * (DeliveryTrackingMap).
 *
 * Estrategia (progressive enhancement):
 *   1. Pide la ruta real por calle a OSRM (demo público, sin API key).
 *   2. Si OSRM falla / está caído / no cubre la zona (selva remota), cae a una
 *      línea recta + ETA estimada por distancia haversine. Nunca rompe el mapa.
 *
 * Los helpers de formato/estimación son PUROS y testeables (no tocan red).
 */

import { haversineKm } from "@/lib/geo-utils";

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteResult {
  /** Vértices [lat, lng] listos para `L.polyline` (Leaflet usa lat,lng). */
  coords: [number, number][];
  /** Distancia del trayecto en km. */
  distanceKm: number;
  /** Duración estimada en minutos. */
  durationMin: number;
  /** De dónde salió la ruta: ruta real por calle u offline (línea recta). */
  source: "osrm" | "straight";
}

/** Servidor demo de OSRM — sin key, rate-limited, solo enhancement. */
const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

/** Velocidad urbana promedio de una moto de reparto (km/h) para el fallback. */
const MOTO_SPEED_KMH = 18;

/**
 * Estima la duración en minutos a partir de la distancia. Pura.
 * Mínimo 1 min para cualquier trayecto con distancia positiva.
 */
export function estimateDurationMin(
  distanceKm: number,
  speedKmh: number = MOTO_SPEED_KMH,
): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || speedKmh <= 0) return 0;
  return Math.max(1, Math.round((distanceKm / speedKmh) * 60));
}

/** Texto humano de la ETA. Pura. Ej: "8 min", "1 h 5 min". */
export function formatEta(durationMin: number): string {
  if (!Number.isFinite(durationMin) || durationMin <= 0) return "—";
  if (durationMin < 60) return `${durationMin} min`;
  const h = Math.floor(durationMin / 60);
  const m = durationMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Texto humano de la distancia. Pura. Ej: "450 m", "2.3 km". */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km <= 0) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/** Fallback offline: línea recta + ETA por haversine. Puro (no red). */
export function straightRoute(from: RoutePoint, to: RoutePoint): RouteResult {
  const distanceKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
  return {
    coords: [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ],
    distanceKm,
    durationMin: estimateDurationMin(distanceKm),
    source: "straight",
  };
}

// ─── Apilado de pedidos (batching) ──────────────────────────────────────────
// "Pedidos apilados" estilo Rappi/Uber: el repartidor lleva varios pedidos a la
// vez y los entrega en una sola ruta. Ordenamos las paradas por cercanía
// (vecino-más-cercano) para que el trayecto total sea corto. Es una heurística
// pura y determinística — no toca red — así el cliente y los tests la comparten.

export interface RouteStop<T> {
  /** Coordenada de la parada. `null` si el pedido no tiene GPS. */
  point: RoutePoint | null;
  /** Carga útil del caller (assignment/order); la devolvemos intacta. */
  data: T;
}

export interface SequencedStop<T> {
  data: T;
  point: RoutePoint | null;
  /** Posición en la ruta, 1-based. */
  sequence: number;
  /** Distancia desde la parada anterior (o el inicio) en km. */
  legDistanceKm: number;
  /** Minutos estimados del tramo anterior. */
  legDurationMin: number;
  /** Distancia acumulada desde el inicio hasta esta parada. */
  cumulativeDistanceKm: number;
  /** Minutos acumulados desde el inicio hasta esta parada. */
  cumulativeDurationMin: number;
}

export interface SequencedRoute<T> {
  ordered: SequencedStop<T>[];
  totalDistanceKm: number;
  totalDurationMin: number;
}

/**
 * Ordena las paradas por vecino-más-cercano desde `start` y calcula distancia y
 * ETA acumuladas por tramo. Pura y determinística (haversine, sin red).
 *
 * - Las paradas sin coordenada (`point: null`) van al final, en su orden
 *   original, con tramo 0 (no podemos ubicarlas para optimizar).
 * - Ante empates de distancia, gana la de menor índice original (estable).
 */
export function sequenceStops<T>(
  start: RoutePoint,
  stops: RouteStop<T>[],
): SequencedRoute<T> {
  const withGps = stops.filter((s) => s.point !== null);
  const withoutGps = stops.filter((s) => s.point === null);

  const ordered: SequencedStop<T>[] = [];
  const remaining = withGps.map((s, i) => ({ stop: s, originalIdx: i }));
  let current: RoutePoint = start;
  let cumulativeDistanceKm = 0;
  let cumulativeDurationMin = 0;
  let sequence = 1;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i].stop.point!;
      const d = haversineKm(current.lat, current.lng, p.lat, p.lng);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const [{ stop }] = remaining.splice(bestIdx, 1);
    const legDistanceKm = bestDist;
    const legDurationMin = estimateDurationMin(legDistanceKm);
    cumulativeDistanceKm += legDistanceKm;
    cumulativeDurationMin += legDurationMin;
    ordered.push({
      data: stop.data,
      point: stop.point,
      sequence: sequence++,
      legDistanceKm,
      legDurationMin,
      cumulativeDistanceKm,
      cumulativeDurationMin,
    });
    current = stop.point!;
  }

  for (const stop of withoutGps) {
    ordered.push({
      data: stop.data,
      point: null,
      sequence: sequence++,
      legDistanceKm: 0,
      legDurationMin: 0,
      cumulativeDistanceKm,
      cumulativeDurationMin,
    });
  }

  return {
    ordered,
    totalDistanceKm: cumulativeDistanceKm,
    totalDurationMin: cumulativeDurationMin,
  };
}

/**
 * Pide la ruta real por calle a OSRM; si algo falla cae a `straightRoute`.
 * Devuelve SIEMPRE un `RouteResult` usable (nunca lanza).
 */
export async function fetchRoute(
  from: RoutePoint,
  to: RoutePoint,
  opts?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<RouteResult> {
  // Coords inválidas → no tiene sentido pegarle a la red.
  if (
    !Number.isFinite(from.lat) ||
    !Number.isFinite(from.lng) ||
    !Number.isFinite(to.lat) ||
    !Number.isFinite(to.lng)
  ) {
    return straightRoute(from, to);
  }

  const timeoutMs = opts?.timeoutMs ?? 6000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // Si el caller aborta, abortamos también nuestra request interna.
  opts?.signal?.addEventListener("abort", () => ctrl.abort(), { once: true });

  try {
    // OSRM espera lng,lat (GeoJSON order), al revés de Leaflet.
    const url =
      `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return straightRoute(from, to);

    const data = (await res.json()) as {
      routes?: {
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: [number, number][] };
      }[];
    };
    const route = data.routes?.[0];
    const raw = route?.geometry?.coordinates;
    if (!raw?.length) return straightRoute(from, to);

    // GeoJSON viene [lng, lat] → Leaflet quiere [lat, lng].
    const coords: [number, number][] = raw.map(([lng, lat]) => [lat, lng]);
    const distanceKm = (route?.distance ?? 0) / 1000;
    const durationMin =
      route?.duration && route.duration > 0
        ? Math.max(1, Math.round(route.duration / 60))
        : estimateDurationMin(distanceKm);

    return { coords, distanceKm, durationMin, source: "osrm" };
  } catch {
    // Red caída / abort / JSON inválido → degradamos a línea recta.
    // No es un error que deba romper la UX; el fallback es la respuesta válida.
    return straightRoute(from, to);
  } finally {
    clearTimeout(timer);
  }
}
