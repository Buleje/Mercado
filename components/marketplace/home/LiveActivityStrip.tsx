"use client";

/**
 * LiveActivityStrip — strip rotativo de actividad en vivo (mocked).
 *
 * Genera FOMO + social proof: ver vecinos comprando AHORA aumenta
 * conversion 8-12% (ver: Etsy, Booking, Mercado Libre).
 *
 * Render: pill horizontal con avatar inicial + nombre + acción + producto + tiempo.
 * Rota cada 4s con animation slide-in.
 *
 * Distinto del LiveActivityFeed.tsx viejo (3-row card secundario que está
 * detrás del flag SHOW_SECONDARY_HOME_SECTIONS). Este es un strip top-level.
 */

import { useEffect, useState } from "react";
import { Activity } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type ActivityEvent = {
  id: string;
  initial: string;
  name: string;
  zone: string;
  action: string;
  product: string;
  minsAgo: number;
};

// Fallback events si el endpoint /activity-feed devuelve [] (no hay orders en 6h)
const FALLBACK_EVENTS: ActivityEvent[] = [
  { id: "f1", initial: "M", name: "Marlon", zone: "Yarinacocha", action: "pidió", product: "Arroz Costeño 5kg", minsAgo: 2 },
  { id: "f2", initial: "L", name: "Lucia", zone: "Pucallpa Centro", action: "compró", product: "Pollo entero", minsAgo: 4 },
  { id: "f3", initial: "J", name: "Juan", zone: "Manantay", action: "pidió", product: "Aceite Primor 1L", minsAgo: 6 },
];

const ROTATE_MS = 4000;

export default function LiveActivityStrip() {
  const [events, setEvents] = useState<ActivityEvent[]>(FALLBACK_EVENTS);
  const [idx, setIdx] = useState(0);

  // Fetch real activity feed (orders anonymized last 6h)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketplace/activity-feed", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.data) return;
        const real = d.data as ActivityEvent[];
        if (Array.isArray(real) && real.length > 0) setEvents(real);
      })
      .catch(() => { /* fallback ya esta seteado */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (events.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % events.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [events.length]);

  if (events.length === 0) return null;
  const ev = events[idx];

  return (
    <section
      aria-label="Actividad en vivo del marketplace"
      className="w-full pt-4 sm:pt-6"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div
          key={ev.id}
          className={cn(
            "flex items-center gap-3 px-4 py-2.5 rounded-full",
            "bg-[var(--surface-raised)] border border-[var(--rule-soft)]",
            "animate-in slide-in-from-left-2 fade-in duration-500",
          )}
        >
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)] shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
            </span>
            En vivo
          </span>
          <div className="hidden sm:block h-4 w-px bg-[var(--rule-base)] shrink-0" aria-hidden />
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] text-[length:var(--ts-xs)] font-bold shrink-0"
            aria-hidden
          >
            {ev.initial}
          </span>
          <p className="flex-1 min-w-0 text-[length:var(--ts-xs)] sm:text-[length:var(--ts-sm)] text-[var(--text-secondary)] truncate">
            <strong className="text-[var(--text-primary)]">{ev.name}</strong>{" "}
            <span className="text-[var(--text-tertiary)]">de {ev.zone}</span>{" "}
            {ev.action} <strong className="text-[var(--text-primary)]">{ev.product}</strong>{" "}
            <span className="text-[var(--text-tertiary)]">hace {ev.minsAgo} min</span>
          </p>
          <Activity className="h-4 w-4 text-[var(--text-tertiary)] shrink-0 hidden sm:block" strokeWidth={1.75} aria-hidden />
        </div>
      </div>
    </section>
  );
}
