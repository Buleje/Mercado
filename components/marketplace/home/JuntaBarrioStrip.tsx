"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, ArrowRight } from "@buleje/design-system/icons";

type Junta = {
  code: string;
  zoneLabel: string;
  productLabel?: string;
  memberCount: number;
  targetMembers: number;
};

/**
 * JuntaBarrioStrip — rail del home con las juntas abiertas del barrio.
 * Self-fetch + se auto-oculta si no hay juntas (mismo patrón que QuickReorder/
 * TopToday). Cada tarjeta lleva a /junta/[code] para sumarse.
 */
export default function JuntaBarrioStrip() {
  const [juntas, setJuntas] = useState<Junta[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/juntas")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && Array.isArray(d?.juntas)) setJuntas(d.juntas);
      })
      .catch((err) => console.warn("[junta-strip] fetch falló", err));
    return () => {
      alive = false;
    };
  }, []);

  if (!juntas || juntas.length === 0) return null;

  return (
    <section
      aria-label="La Junta del Barrio"
      className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7"
    >
      <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 sm:p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <Users className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
              Compra colaborativa vecinal
            </p>
            <h2 className="text-lg font-extrabold tracking-tight text-[var(--text-primary)]">
              Juntas abiertas en tu barrio
            </h2>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {juntas.map((j) => {
            const remaining = Math.max(0, j.targetMembers - j.memberCount);
            const progress = Math.min(
              100,
              Math.round((j.memberCount / j.targetMembers) * 100),
            );
            return (
              <Link
                key={j.code}
                href={`/junta/${j.code}`}
                className="group rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4 transition hover:border-[var(--accent)]/40"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-extrabold text-[var(--text-primary)]">
                    {j.zoneLabel}
                  </span>
                  <span className="shrink-0 text-sm font-extrabold tabular-nums text-[var(--accent)]">
                    {j.memberCount}/{j.targetMembers}
                  </span>
                </div>
                {j.productLabel && (
                  <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">
                    {j.productLabel}
                  </p>
                )}
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-[width]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)]">
                  {remaining > 0 ? `Faltan ${remaining} · únete` : "¡Completa!"}
                  <ArrowRight
                    className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                    strokeWidth={2}
                    aria-hidden
                  />
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
