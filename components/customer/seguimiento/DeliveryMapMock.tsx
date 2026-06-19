"use client";

/**
 * DeliveryMapMock — "Mapa" SVG estilizado de la ruta del repartidor.
 *
 * NO usa Google Maps / Leaflet — es un placeholder visual con:
 *   - Calles de Pucallpa dibujadas como líneas.
 *   - Pin de la bodega (origen) y destino (cliente).
 *   - Pin animado del repartidor interpolado sobre la ruta.
 *
 * Pensado para que las señoras vean "mi pedido está por X zona" sin costos
 * de Google Maps API. Reemplazar con mapa real tras ADR-XXX si hace falta.
 */
import { useState } from "react";
import { Bike, Store, MapPin, Plus, Minus, Navigation } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  /** 0..1 — fracción del recorrido completado por el repartidor */
  progress: number;
  storeLabel: string;
  destinationLabel: string;
  driverName?: string;
  className?: string;
}

// Waypoints de la "ruta" en coordenadas SVG viewBox 0..400 x 0..260.
// Simula un camino irregular entre depósito (izq-abajo) y destino (der-arriba).
const ROUTE_POINTS: Array<[number, number]> = [
  [60, 210], // origen
  [100, 180],
  [150, 170],
  [180, 140],
  [240, 130],
  [280, 100],
  [320, 80],
  [340, 50], // destino
];

function interpolateRoute(t: number): { x: number; y: number; segIdx: number } {
  if (t <= 0) return { x: ROUTE_POINTS[0][0], y: ROUTE_POINTS[0][1], segIdx: 0 };
  if (t >= 1) {
    const last = ROUTE_POINTS[ROUTE_POINTS.length - 1];
    return { x: last[0], y: last[1], segIdx: ROUTE_POINTS.length - 2 };
  }
  const segCount = ROUTE_POINTS.length - 1;
  const segFloat = t * segCount;
  const segIdx = Math.floor(segFloat);
  const localT = segFloat - segIdx;
  const [ax, ay] = ROUTE_POINTS[segIdx];
  const [bx, by] = ROUTE_POINTS[segIdx + 1];
  return {
    x: ax + (bx - ax) * localT,
    y: ay + (by - ay) * localT,
    segIdx,
  };
}

export function DeliveryMapMock({
  progress,
  storeLabel,
  destinationLabel,
  driverName,
  className,
}: Props) {
  const [zoomed, setZoomed] = useState(false);
  const p = Math.max(0, Math.min(1, progress));
  const driver = interpolateRoute(p);

  // Construir path de la ruta
  const routePath = ROUTE_POINTS.map(([x, y], i) =>
    i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`,
  ).join(" ");

  // Subpath recorrido (para destacar con color)
  const coveredPath = (() => {
    const parts: string[] = [];
    for (let i = 0; i <= driver.segIdx; i++) {
      const [x, y] = ROUTE_POINTS[i];
      parts.push(`${i === 0 ? "M" : "L"} ${x} ${y}`);
    }
    parts.push(`L ${Number(driver.x).toFixed(1)} ${Number(driver.y).toFixed(1)}`);
    return parts.join(" ");
  })();

  return (
    <section
      aria-labelledby="tracking-map-heading"
      className={cn(
        "relative border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden",
        className,
      )}
    >
      <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-[var(--rule-base)] flex items-center justify-between">
        <div>
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-muted">
            Ubicación en vivo
          </span>
          <h2
            id="tracking-map-heading"
            className="text-base font-extrabold tracking-tight text-[var(--text-primary)] mt-0.5"
          >
            Ruta del repartidor
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoomed(true)}
            aria-label="Acercar mapa"
            className="inline-flex h-8 w-8 items-center justify-center border border-[var(--rule-base)] text-muted hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => setZoomed(false)}
            aria-label="Alejar mapa"
            className="inline-flex h-8 w-8 items-center justify-center border border-[var(--rule-base)] text-muted hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors"
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Canvas SVG */}
      <div
        className={cn(
          "relative bg-[var(--surface-alt)] dark:bg-surface transition-[height] duration-[var(--dur-slow)]",
          zoomed ? "h-80 sm:h-96" : "h-64 sm:h-72",
        )}
      >
        <svg
          viewBox="0 0 400 260"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 w-full h-full"
          aria-label="Mapa estilizado de la ruta del repartidor en Pucallpa"
          role="img"
        >
          {/* Fondo: bloques de manzanas estilizadas */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <rect width="40" height="40" fill="transparent" />
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.4" className="text-gray-200 dark:text-card-border" />
            </pattern>
          </defs>
          <rect width="400" height="260" fill="url(#grid)" />

          {/* Manzanas estilo Pucallpa */}
          <g className="text-gray-100 dark:text-card-border" fill="currentColor">
            <rect x="20" y="20" width="60" height="70" rx="2" />
            <rect x="100" y="40" width="70" height="55" rx="2" />
            <rect x="190" y="20" width="60" height="60" rx="2" />
            <rect x="270" y="30" width="80" height="50" rx="2" />
            <rect x="30" y="110" width="70" height="55" rx="2" />
            <rect x="120" y="100" width="70" height="55" rx="2" />
            <rect x="210" y="90" width="60" height="50" rx="2" />
            <rect x="290" y="100" width="60" height="50" rx="2" />
            <rect x="30" y="180" width="90" height="50" rx="2" />
            <rect x="140" y="180" width="80" height="50" rx="2" />
            <rect x="240" y="170" width="70" height="50" rx="2" />
            <rect x="330" y="160" width="50" height="60" rx="2" />
          </g>

          {/* Rótulos de zonas (muy suaves) */}
          <g className="text-muted" fill="currentColor" fontSize="7" fontWeight="700" opacity="0.55">
            <text x="40" y="55">CENTRO</text>
            <text x="120" y="70">PLAZA</text>
            <text x="205" y="55">UCAYALI</text>
            <text x="290" y="60">YARINACOCHA</text>
            <text x="56" y="144">JR. SUCRE</text>
            <text x="145" y="135">AV. CENTENARIO</text>
            <text x="70" y="215">MALECÓN</text>
          </g>

          {/* Ruta completa (gris) */}
          <path
            d={routePath}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gray-300 dark:text-card-border"
            strokeDasharray="2 4"
          />

          {/* Ruta recorrida (accent) */}
          <path
            d={coveredPath}
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary"
          />

          {/* Pin origen (bodega) */}
          <g transform={`translate(${ROUTE_POINTS[0][0]}, ${ROUTE_POINTS[0][1]})`}>
            <circle r="9" className="fill-white dark:fill-card stroke-foreground" strokeWidth="2" />
            <g transform="translate(-5,-5)" className="text-[var(--text-primary)]">
              <Store width={10} height={10} />
            </g>
          </g>

          {/* Pin destino */}
          <g
            transform={`translate(${ROUTE_POINTS[ROUTE_POINTS.length - 1][0]}, ${ROUTE_POINTS[ROUTE_POINTS.length - 1][1]})`}
          >
            <circle r="9" className="fill-white dark:fill-card stroke-primary" strokeWidth="2" />
            <g transform="translate(-5,-5)" className="text-primary">
              <MapPin width={10} height={10} />
            </g>
          </g>

          {/* Repartidor (interpolado) */}
          <g transform={`translate(${Number(driver.x).toFixed(1)}, ${Number(driver.y).toFixed(1)})`}>
            {/* Pulso */}
            <circle r="14" className="fill-primary opacity-25 animate-ping" />
            <circle r="11" className="fill-primary" />
            <g transform="translate(-6,-6)" className="text-white">
              <Bike width={12} height={12} />
            </g>
          </g>
        </svg>

        {/* Footer info sobre el mapa */}
        <div className="absolute left-3 bottom-3 right-3 flex items-center justify-between bg-white/95 dark:bg-[var(--surface-raised)]/95 backdrop-blur border-2 border-[var(--rule-base)] px-3 py-2">
          <div className="flex items-center gap-2 text-[length:var(--ts-2xs)] text-[var(--text-primary)]">
            <Navigation className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
            <span className="font-bold tabular-nums">
              {Math.round(p * 100)}%
            </span>
            <span className="text-muted hidden sm:inline">recorrido</span>
          </div>
          <div className="text-[length:var(--ts-2xs)] text-muted truncate max-w-[60%]">
            {driverName ? (
              <span className="font-semibold text-[var(--text-primary)]">{driverName}</span>
            ) : (
              <span>Repartidor</span>
            )}
            <span className="hidden sm:inline"> · camino a {destinationLabel}</span>
          </div>
        </div>
      </div>

      {/* Leyenda */}
      <div className="px-5 py-3 sm:px-6 border-t border-[var(--rule-base)] flex flex-wrap items-center gap-4 text-[length:var(--ts-2xs)] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Store className="h-3 w-3 text-[var(--text-primary)]" strokeWidth={2} />
          {storeLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3 w-3 text-primary" strokeWidth={2} />
          {destinationLabel}
        </span>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 text-primary hover:text-primary/80 font-semibold transition-colors"
          onClick={() => setZoomed((z) => !z)}
        >
          Ver ruta completa
        </button>
      </div>
    </section>
  );
}
