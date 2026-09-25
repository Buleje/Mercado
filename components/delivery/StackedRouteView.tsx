"use client";

/**
 * StackedRouteView — "pedidos apilados" del repartidor (estilo Rappi/Uber).
 *
 * Presentacional: recibe la ruta ya ordenada por el backend
 * (GET /api/delivery/me/route) y la pinta como una lista de paradas en orden
 * óptimo, con ETA acumulada por parada, ganancia total y un botón para abrir
 * la ruta multi-parada en Google Maps. Diseño recto (border-2, sin redondeos),
 * light-only como el resto de la app del repartidor.
 */

import Link from "next/link";
import { ArrowRight } from "@buleje/design-system/icons";
import { PinIcon, RouteIcon, MotoIcon, PackageIcon } from "@/components/delivery/icons";
import { formatEta, formatDistance } from "@/lib/delivery/route";

export interface StackedStop {
  sequence: number;
  assignmentId: string;
  orderId: string;
  status: string;
  fee: number;
  tipAmount: number;
  customerName: string;
  customerLocation: string | null;
  customerReference: string | null;
  total: number;
  hasGps: boolean;
  /** Coords sobre las que se optimizó la ruta (null si la parada no tiene GPS). */
  lat: number | null;
  lng: number | null;
  cumulativeDistanceKm: number;
  cumulativeDurationMin: number;
  items: { name: string; quantity: number; unit: string }[];
}

export interface StackedRoute {
  count: number;
  totalDistanceKm: number;
  totalDurationMin: number;
  totalEarnings: number;
  stops: StackedStop[];
}

const STATUS_LABEL: Record<string, string> = {
  assigned: "Por recoger",
  picked_up: "Recogido",
  in_transit: "En camino",
};

/** URL de Google Maps con todas las paradas como waypoints, en orden óptimo. */
function buildMapsUrl(stops: StackedStop[]): string | null {
  // Preferimos las coords reales (sobre las que se optimizó la ruta); si una
  // parada no tiene GPS, caemos a su dirección de texto. Así no se cae del
  // enlace una parada que sí entró a la ruta por sus coords (sin texto), y los
  // waypoints coinciden con la lista que ve el repartidor.
  const places = stops
    .map((s) => {
      if (s.lat != null && s.lng != null) return `${s.lat},${s.lng}`;
      const loc = s.customerLocation?.replace(/GPS:\s*/i, "").trim();
      return loc ? loc : null;
    })
    .filter((p): p is string => Boolean(p))
    .map((p) => encodeURIComponent(p));
  if (places.length === 0) return null;
  const destination = places[places.length - 1];
  const waypoints = places.slice(0, -1).join("|");
  const base = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
  return waypoints ? `${base}&waypoints=${waypoints}` : base;
}

export function StackedRouteView({ route }: { route: StackedRoute }) {
  const mapsUrl = buildMapsUrl(route.stops);

  return (
    <div className="space-y-5">
      {/* Resumen de la ruta */}
      <section className="border-2 border-[var(--accent)] bg-[var(--surface-raised)] p-5">
        <div className="flex items-center gap-2">
          <RouteIcon className="h-5 w-5 text-[var(--accent)]" />
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
            Ruta apilada
          </h2>
        </div>
        <p className="mt-1 text-2xl font-extrabold text-[var(--text-primary)]">
          {route.count} {route.count === 1 ? "pedido" : "pedidos"} en una sola vuelta
        </p>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="Distancia" value={formatDistance(route.totalDistanceKm)} />
          <Stat label="Tiempo" value={formatEta(route.totalDurationMin)} />
          <Stat
            label="Ganas"
            value={`S/ ${Number(route.totalEarnings).toFixed(2)}`}
            accent
          />
        </div>

        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 h-14 bg-[var(--accent)] text-base font-extrabold text-white shadow-lg shadow-[var(--accent)]/30 active:scale-[0.99] transition-transform"
          >
            <MotoIcon className="h-5 w-5" />
            Iniciar ruta en Maps
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </a>
        )}
      </section>

      {/* Paradas en orden óptimo */}
      <ol className="space-y-3">
        {route.stops.map((stop) => (
          <li key={stop.assignmentId}>
            <Link
              href={`/delivery-app/pedido/${stop.assignmentId}`}
              className="block border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 hover:border-[var(--accent)] transition-colors"
            >
              <div className="flex items-start gap-3">
                {/* Badge de secuencia (cuadrado) */}
                <span className="shrink-0 inline-flex h-10 w-10 items-center justify-center bg-[var(--accent)] text-lg font-extrabold text-white tabular-nums">
                  {stop.sequence}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-base font-extrabold text-[var(--text-primary)] truncate">
                      {stop.customerName}
                    </p>
                    <span className="shrink-0 text-base font-extrabold text-[var(--accent)] tabular-nums">
                      S/ {(stop.fee + stop.tipAmount).toFixed(2)}
                    </span>
                  </div>

                  <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)]">
                    <PinIcon className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                    <span className="truncate">
                      {stop.customerLocation?.replace(/GPS:\s*[-\d.,\s]+/i, "").trim() ||
                        "Sin dirección"}
                    </span>
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1 text-sm font-extrabold text-[var(--text-primary)] tabular-nums">
                      <MotoIcon className="h-4 w-4 text-[var(--accent)]" />
                      {formatEta(stop.cumulativeDurationMin)}
                    </span>
                    <span className="text-sm font-semibold text-[var(--text-tertiary)] tabular-nums">
                      {formatDistance(stop.cumulativeDistanceKm)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--text-tertiary)]">
                      <PackageIcon className="h-4 w-4" />
                      {stop.items.length} {stop.items.length === 1 ? "ítem" : "ítems"}
                    </span>
                    {!stop.hasGps && (
                      <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--brand-secondary)]">
                        Sin GPS
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-[var(--rule-base)] pt-2.5">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                  {STATUS_LABEL[stop.status] ?? stop.status}
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-extrabold text-[var(--accent)]">
                  Abrir pedido
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-[var(--surface-sunken)] p-3 text-center">
      <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </p>
      <p
        className={`mt-0.5 text-base font-extrabold tabular-nums ${
          accent ? "text-[var(--accent)]" : "text-[var(--text-primary)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
