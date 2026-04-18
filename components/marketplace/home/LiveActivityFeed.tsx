"use client";

/**
 * LiveActivityFeed — Feed en tiempo real mock "Juan compro Paiche · hace 30s".
 *
 * Complementa la narrativa "Lo que esta pasando ahora". Muestra 3 eventos
 * rotativos que simulan actividad real (compras, valoraciones, suscripciones)
 * con avatares iniciales y un punto verde animate-pulse como live-indicator.
 *
 * Data es mock; cuando exista endpoint /api/marketplace/activity-feed se
 * reemplaza con fetch + SSE.
 */

import { useEffect, useState } from "react";
import { Caption, Kicker } from "@buleje/design-system";
import { cn } from "@/lib/utils";

type ActivityEvent = {
  id: string;
  initial: string;
  name: string;
  verb: string;
  target: string;
  zone: string;
  agoSec: number;
};

const EVENTS: ActivityEvent[] = [
  { id: "e1", initial: "M", name: "Maria", verb: "compro", target: "Paiche fresco (2 kg)", zone: "Yarinacocha", agoSec: 28 },
  { id: "e2", initial: "J", name: "Juan", verb: "suscribio a", target: "Arroz Costeno 5 kg (Bodega al Mes)", zone: "Callera", agoSec: 52 },
  { id: "e3", initial: "R", name: "Rosa", verb: "califico 5 estrellas a", target: "Bodega Don Pepe", zone: "Manantay", agoSec: 74 },
  { id: "e4", initial: "C", name: "Carlos", verb: "compro", target: "Tacacho con cecina", zone: "Pucallpa centro", agoSec: 96 },
  { id: "e5", initial: "L", name: "Lucia", verb: "canjeo cupon en", target: "Frutas de la Selva", zone: "Callera", agoSec: 118 },
  { id: "e6", initial: "A", name: "Andres", verb: "activo Socio Buleje", target: "(S/ 180/ano estimados)", zone: "Yarinacocha", agoSec: 142 },
];

function formatAgo(sec: number): string {
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.floor(sec / 60);
  return `hace ${min} min`;
}

export default function LiveActivityFeed() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  // Rotar ventana de 3 eventos visibles cada 5s.
  const windowStart = tick % EVENTS.length;
  const visible = [
    EVENTS[windowStart % EVENTS.length],
    EVENTS[(windowStart + 1) % EVENTS.length],
    EVENTS[(windowStart + 2) % EVENTS.length],
  ];

  return (
    <section
      aria-labelledby="live-activity-title"
      aria-live="polite"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4"
    >
      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <span
            className="relative inline-flex h-2 w-2"
            aria-hidden
          >
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-70 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <Kicker id="live-activity-title" className="text-[var(--text-tertiary)]">
            Actividad en vivo en Pucallpa
          </Kicker>
        </div>

        <ul className="space-y-2.5">
          {visible.map((e) => (
            <li
              key={`${e.id}-${tick}`}
              className={cn(
                "flex items-center gap-3 rounded-lg bg-[var(--surface-canvas)] px-3 py-2.5",
                "border border-[var(--rule-soft)]",
                "animate-in fade-in slide-in-from-bottom-1 duration-500",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  "bg-[var(--surface-sunken)] text-[length:var(--ts-xs)] font-bold",
                  "text-[var(--text-secondary)] border border-[var(--rule-base)]",
                )}
                aria-hidden
              >
                {e.initial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[length:var(--ts-sm)] text-[var(--text-primary)] truncate">
                  <span className="font-semibold">{e.name}</span>{" "}
                  <span className="text-[var(--text-secondary)]">{e.verb}</span>{" "}
                  <span className="font-medium">{e.target}</span>
                </p>
                <Caption className="text-[var(--text-tertiary)] truncate">
                  {e.zone} · {formatAgo(e.agoSec)}
                </Caption>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
